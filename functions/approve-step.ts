import { Request, Response } from 'express';

const HASURA_URL = process.env.NHOST_HASURA_URL || 'http://localhost:1337/v1/graphql';
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

async function adminQuery(query: string, variables: Record<string, any> = {}) {
  const res = await fetch(HASURA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

function resolveTemplate(template: string, context: any): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    let value = context;
    for (const key of path.split('.')) { value = value?.[key]; }
    return value !== undefined && value !== null ? String(value) : match;
  });
}

async function updateStepRun(stepRunId: string, updates: Record<string, any>) {
  await adminQuery(`
    mutation UpdateStepRun($id: uuid!, $set: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: {id: $id}, _set: $set) { id }
    }
  `, { id: stepRunId, set: updates });
}

async function updateWorkflowRun(runId: string, updates: Record<string, any>) {
  await adminQuery(`
    mutation UpdateWorkflowRun($id: uuid!, $set: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: $set) { id }
    }
  `, { id: runId, set: updates });
}

// Step executors (duplicated from trigger-workflow-run for standalone function)
async function executeLLMCall(config: any, input: any) {
  const prompt = resolveTemplate(config.prompt || 'Hello', input);
  const model = config.model || 'google/gemini-2.0-flash-001';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://ai-workflow-builder.vercel.app',
      'X-Title': 'AI Workflow Builder',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: config.system_prompt || 'You are a helpful assistant.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: config.max_tokens || 500,
      temperature: config.temperature || 0.7,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`LLM error: ${JSON.stringify(data.error)}`);
  return { response: data.choices?.[0]?.message?.content || '', model: data.model, usage: data.usage };
}

async function executeHTTPRequest(config: any, input: any) {
  const url = resolveTemplate(config.url || '', input);
  const method = config.method || 'GET';
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
    body: method !== 'GET' && config.body ? JSON.stringify(config.body) : undefined,
  });
  const ct = response.headers.get('content-type') || '';
  const responseData = ct.includes('json') ? await response.json() : await response.text();
  return { status: response.status, data: responseData };
}

async function executeDBWrite(config: any, input: any, ctx: any) {
  const result = await adminQuery(`
    mutation InsertResult($obj: workflow_results_insert_input!) {
      insert_workflow_results_one(object: $obj) { id }
    }
  `, {
    obj: {
      workflow_id: ctx.workflow_id, run_id: ctx.run_id, step_id: ctx.step_id,
      result_type: config.result_type || 'generic',
      data: input.previous_output || input,
    },
  });
  if (result.errors) throw new Error(`DB write: ${JSON.stringify(result.errors)}`);
  return { saved_id: result.data?.insert_workflow_results_one?.id };
}

async function executeNotify(config: any, input: any) {
  const message = resolveTemplate(config.message || 'Notification', input);
  console.log(`[NOTIFY] ${message}`);
  if (config.webhook_url) {
    try { await fetch(config.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message }) }); } catch(e) {}
  }
  return { notified: true, message, timestamp: new Date().toISOString() };
}

function evaluateCondition(config: any, input: any) {
  const field = config.field || 'response';
  const operator = config.operator || 'contains';
  const value = config.value || '';
  const prev = input.previous_output || input;
  let fieldValue = prev;
  for (const key of field.split('.')) { fieldValue = fieldValue?.[key]; }
  const sv = String(fieldValue || '').toLowerCase();
  const cv = String(value).toLowerCase();
  let matched = false;
  switch (operator) {
    case 'contains': matched = sv.includes(cv); break;
    case 'not_contains': matched = !sv.includes(cv); break;
    case 'equals': matched = sv === cv; break;
    case 'not_equals': matched = sv !== cv; break;
    default: matched = sv.includes(cv);
  }
  return { branch: matched ? (config.true_branch || 'continue') : (config.false_branch || 'skip_next'), matched };
}

async function resumeWorkflowFromStep(workflowId: string, runId: string, startFromStepOrder: number) {
  const stepsResult = await adminQuery(`
    query GetSteps($wid: uuid!) {
      workflow_steps(where: {workflow_id: {_eq: $wid}}, order_by: {step_order: asc}) {
        id step_order step_type name config
      }
    }
  `, { wid: workflowId });

  const steps = stepsResult.data?.workflow_steps || [];
  await updateWorkflowRun(runId, { status: 'running' });

  let previousOutput: any = {};
  let skipNext = false;

  for (const step of steps) {
    if (step.step_order < startFromStepOrder) {
      const prev = await adminQuery(`
        query GetPrev($rid: uuid!, $sid: uuid!) {
          step_runs(where: {run_id: {_eq: $rid}, step_id: {_eq: $sid}}) { output }
        }
      `, { rid: runId, sid: step.id });
      if (prev.data?.step_runs?.[0]?.output) previousOutput = prev.data.step_runs[0].output;
      continue;
    }

    // Get or create step_run
    let srResult = await adminQuery(`
      query GetSR($rid: uuid!, $sid: uuid!) {
        step_runs(where: {run_id: {_eq: $rid}, step_id: {_eq: $sid}}) { id status }
      }
    `, { rid: runId, sid: step.id });

    let stepRunId: string;
    if (srResult.data?.step_runs?.length > 0) {
      stepRunId = srResult.data.step_runs[0].id;
      if (srResult.data.step_runs[0].status === 'completed') {
        // Already done
        continue;
      }
    } else {
      const ins = await adminQuery(`
        mutation CreateSR($obj: step_runs_insert_input!) {
          insert_step_runs_one(object: $obj) { id }
        }
      `, { obj: { run_id: runId, step_id: step.id, status: 'pending', input: { previous_output: previousOutput } } });
      stepRunId = ins.data?.insert_step_runs_one?.id;
    }

    if (!stepRunId) {
      await updateWorkflowRun(runId, { status: 'failed', error: 'Failed to create step run', completed_at: new Date().toISOString() });
      return;
    }

    if (skipNext && step.step_type !== 'conditional_branch') {
      await updateStepRun(stepRunId, { status: 'skipped', output: { reason: 'Skipped by conditional branch' }, completed_at: new Date().toISOString() });
      skipNext = false;
      continue;
    }
    skipNext = false;

    if (step.step_type === 'approval_gate') {
      await updateStepRun(stepRunId, { status: 'awaiting_approval', input: { previous_output: previousOutput }, started_at: new Date().toISOString() });
      await updateWorkflowRun(runId, { status: 'paused' });
      return;
    }

    const maxAttempts = ['llm_call', 'http_request'].includes(step.step_type) ? 2 : 1;
    let lastError: string | null = null;
    let output: any = null;

    await updateStepRun(stepRunId, { status: 'running', started_at: new Date().toISOString(), input: { previous_output: previousOutput } });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await updateStepRun(stepRunId, { attempt_count: attempt });
        switch (step.step_type) {
          case 'llm_call': output = await executeLLMCall(step.config, { previous_output: previousOutput }); break;
          case 'http_request': output = await executeHTTPRequest(step.config, { previous_output: previousOutput }); break;
          case 'db_write': output = await executeDBWrite(step.config, { previous_output: previousOutput }, { workflow_id: workflowId, run_id: runId, step_id: step.id }); break;
          case 'notify': output = await executeNotify(step.config, { previous_output: previousOutput }); break;
          case 'conditional_branch':
            const cr = evaluateCondition(step.config, { previous_output: previousOutput });
            output = cr;
            if (cr.branch === 'skip_next') skipNext = true;
            break;
          default: throw new Error(`Unknown step type: ${step.step_type}`);
        }
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err.message;
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (lastError) {
      await updateStepRun(stepRunId, { status: 'failed', error: lastError, completed_at: new Date().toISOString() });
      await updateWorkflowRun(runId, { status: 'failed', error: `Step "${step.name}" failed: ${lastError}`, completed_at: new Date().toISOString() });
      return;
    }

    await updateStepRun(stepRunId, { status: 'completed', output: output || {}, completed_at: new Date().toISOString() });
    previousOutput = output;
  }

  await updateWorkflowRun(runId, { status: 'completed', completed_at: new Date().toISOString() });

  // Increment quota
  const wResult = await adminQuery(`query GetOrg($wid: uuid!) { workflows_by_pk(id: $wid) { org_id } }`, { wid: workflowId });
  const orgId = wResult.data?.workflows_by_pk?.org_id;
  if (orgId) {
    await adminQuery(`mutation Inc($oid: uuid!) { update_organizations_by_pk(pk_columns: {id: $oid}, _inc: {quota_used: 1}) { id } }`, { oid: orgId });
  }
}

// ============================================================
// Approve Step Handler
// ============================================================

export default async (req: Request, res: Response) => {
  try {
    const { input, session_variables } = req.body;
    const stepRunId = input?.step_run_id;
    const userId = session_variables?.['x-hasura-user-id'];

    if (!stepRunId) return res.status(400).json({ success: false, message: 'step_run_id is required', run_id: null });
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required', run_id: null });

    // Fetch step_run with org membership check
    const result = await adminQuery(`
      query GetStepRunForApproval($step_run_id: uuid!, $user_id: uuid!) {
        step_runs_by_pk(id: $step_run_id) {
          id
          status
          step_id
          run_id
          step {
            step_order
            step_type
            workflow_id
            workflow {
              id
              org_id
              organization {
                members(where: {user_id: {_eq: $user_id}}) {
                  role
                }
              }
            }
          }
        }
      }
    `, { step_run_id: stepRunId, user_id: userId });

    const stepRun = result.data?.step_runs_by_pk;
    if (!stepRun) return res.status(404).json({ success: false, message: 'Step run not found', run_id: null });

    // Layer 2: Check that approver is owner/editor in the org
    const member = stepRun.step?.workflow?.organization?.members?.[0];
    if (!member) return res.status(403).json({ success: false, message: 'You are not a member of this organization', run_id: null });
    if (member.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot approve steps', run_id: null });

    if (stepRun.status !== 'awaiting_approval') {
      return res.status(400).json({ success: false, message: `Step is not awaiting approval (current status: ${stepRun.status})`, run_id: stepRun.run_id });
    }

    if (stepRun.step?.step_type !== 'approval_gate') {
      return res.status(400).json({ success: false, message: 'This step is not an approval gate', run_id: stepRun.run_id });
    }

    // Approve the step
    await updateStepRun(stepRunId, {
      status: 'completed',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      output: { approved: true, approved_by: userId },
    });

    const workflowId = stepRun.step?.workflow?.id;
    const runId = stepRun.run_id;
    const nextStepOrder = (stepRun.step?.step_order || 0) + 1;

    // Resume workflow execution from the next step (async)
    resumeWorkflowFromStep(workflowId, runId, nextStepOrder).catch(err => {
      console.error(`[APPROVE] Resume failed: ${err.message}`);
      updateWorkflowRun(runId, { status: 'failed', error: err.message, completed_at: new Date().toISOString() });
    });

    return res.status(200).json({
      success: true,
      message: 'Step approved. Workflow execution resuming.',
      run_id: runId,
    });

  } catch (err: any) {
    console.error('[approveStep] Error:', err);
    return res.status(500).json({ success: false, message: err.message, run_id: null });
  }
};
