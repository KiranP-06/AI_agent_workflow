import { Request, Response } from 'express';

// Shared admin GraphQL client for functions
const HASURA_URL = process.env.NHOST_HASURA_URL || 'http://localhost:1337/v1/graphql';
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

interface GraphQLResult {
  data?: any;
  errors?: any[];
}

async function adminQuery(query: string, variables: Record<string, any> = {}): Promise<GraphQLResult> {
  const res = await fetch(HASURA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// ============================================================
// Step Executors
// ============================================================

async function executeLLMCall(config: any, input: any): Promise<any> {
  const prompt = config.prompt || 'Hello, world!';
  const model = config.model || 'google/gemini-2.0-flash-001';

  // Interpolate variables from previous step output
  const resolvedPrompt = resolveTemplate(prompt, input);

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
        { role: 'user', content: resolvedPrompt },
      ],
      max_tokens: config.max_tokens || 500,
      temperature: config.temperature || 0.7,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`LLM API error: ${JSON.stringify(data.error)}`);

  return {
    response: data.choices?.[0]?.message?.content || '',
    model: data.model,
    usage: data.usage,
  };
}

async function executeHTTPRequest(config: any, input: any): Promise<any> {
  const url = resolveTemplate(config.url || '', input);
  const method = config.method || 'GET';
  const headers = config.headers || {};
  let body = config.body || null;

  if (body && typeof body === 'string') {
    body = resolveTemplate(body, input);
  }

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method !== 'GET' && body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  let responseData: any;
  if (contentType.includes('application/json')) {
    responseData = await response.json();
  } else {
    responseData = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    data: responseData,
  };
}

async function executeDBWrite(config: any, input: any, runContext: any): Promise<any> {
  const result = await adminQuery(`
    mutation InsertWorkflowResult($object: workflow_results_insert_input!) {
      insert_workflow_results_one(object: $object) { id }
    }
  `, {
    object: {
      workflow_id: runContext.workflow_id,
      run_id: runContext.run_id,
      step_id: runContext.step_id,
      result_type: config.result_type || 'generic',
      data: input.previous_output || input,
    },
  });

  if (result.errors) throw new Error(`DB write failed: ${JSON.stringify(result.errors)}`);
  return { saved_id: result.data?.insert_workflow_results_one?.id };
}

async function executeNotify(config: any, input: any): Promise<any> {
  // This creates a log entry and optionally calls a webhook (simulated Slack/email)
  const message = resolveTemplate(config.message || 'Workflow notification', input);
  const channel = config.channel || 'general';

  console.log(`[NOTIFY] Channel: ${channel}, Message: ${message}`);

  // If a webhook_url is configured, actually POST to it
  if (config.webhook_url) {
    try {
      await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, channel }),
      });
    } catch (e) {
      console.log(`[NOTIFY] Webhook call failed: ${e}`);
    }
  }

  return { notified: true, message, channel, timestamp: new Date().toISOString() };
}

function evaluateCondition(config: any, input: any): { branch: string; matched: boolean } {
  const field = config.field || 'response';
  const operator = config.operator || 'contains';
  const value = config.value || '';
  const previousOutput = input.previous_output || input;

  // Navigate to the field in the output
  let fieldValue = previousOutput;
  for (const key of field.split('.')) {
    fieldValue = fieldValue?.[key];
  }

  if (fieldValue === undefined || fieldValue === null) {
    fieldValue = '';
  }

  const strFieldValue = String(fieldValue).toLowerCase();
  const strValue = String(value).toLowerCase();

  let matched = false;
  switch (operator) {
    case 'contains': matched = strFieldValue.includes(strValue); break;
    case 'not_contains': matched = !strFieldValue.includes(strValue); break;
    case 'equals': matched = strFieldValue === strValue; break;
    case 'not_equals': matched = strFieldValue !== strValue; break;
    case 'starts_with': matched = strFieldValue.startsWith(strValue); break;
    case 'ends_with': matched = strFieldValue.endsWith(strValue); break;
    case 'greater_than': matched = parseFloat(strFieldValue) > parseFloat(strValue); break;
    case 'less_than': matched = parseFloat(strFieldValue) < parseFloat(strValue); break;
    default: matched = strFieldValue.includes(strValue);
  }

  return {
    branch: matched ? (config.true_branch || 'continue') : (config.false_branch || 'skip_next'),
    matched,
  };
}

function resolveTemplate(template: string, context: any): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    let value = context;
    for (const key of path.split('.')) {
      value = value?.[key];
    }
    return value !== undefined && value !== null ? String(value) : match;
  });
}

// ============================================================
// Update step_run status in real-time
// ============================================================

async function updateStepRun(stepRunId: string, updates: Record<string, any>) {
  const setClauses = Object.entries(updates)
    .map(([key, _], i) => `${key}: $v${i}`)
    .join(', ');
  const varDefs = Object.entries(updates)
    .map(([key, value], i) => {
      if (key === 'status') return `$v${i}: step_status!`;
      if (key === 'attempt_count') return `$v${i}: Int!`;
      if (typeof value === 'string' && key.endsWith('_at')) return `$v${i}: timestamptz`;
      if (typeof value === 'string') return `$v${i}: String`;
      return `$v${i}: jsonb`;
    })
    .join(', ');

  const variables: Record<string, any> = { id: stepRunId };
  Object.values(updates).forEach((val, i) => {
    variables[`v${i}`] = val;
  });

  // Simpler approach - just use _set with jsonb
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

// ============================================================
// Main Workflow Execution Engine
// ============================================================

async function executeWorkflow(
  workflowId: string,
  runId: string,
  triggeredBy: string | null,
  startFromStepOrder: number = 0
) {
  // Fetch workflow steps
  const stepsResult = await adminQuery(`
    query GetWorkflowSteps($workflow_id: uuid!) {
      workflow_steps(
        where: { workflow_id: { _eq: $workflow_id } }
        order_by: { step_order: asc }
      ) {
        id
        step_order
        step_type
        name
        config
      }
    }
  `, { workflow_id: workflowId });

  const steps = stepsResult.data?.workflow_steps || [];

  if (steps.length === 0) {
    await updateWorkflowRun(runId, { status: 'failed', error: 'No steps configured', completed_at: new Date().toISOString() });
    return;
  }

  // Update run to running
  await updateWorkflowRun(runId, { status: 'running' });

  let previousOutput: any = {};
  let skipNext = false;

  for (const step of steps) {
    if (step.step_order < startFromStepOrder) {
      // Fetch previous output from already-completed step
      const prevResult = await adminQuery(`
        query GetStepRunOutput($run_id: uuid!, $step_id: uuid!) {
          step_runs(where: {run_id: {_eq: $run_id}, step_id: {_eq: $step_id}}) {
            output
            status
          }
        }
      `, { run_id: runId, step_id: step.id });
      const prevStepRun = prevResult.data?.step_runs?.[0];
      if (prevStepRun?.output) previousOutput = prevStepRun.output;
      continue;
    }

    // Check or create step_run record
    let stepRunResult = await adminQuery(`
      query GetStepRun($run_id: uuid!, $step_id: uuid!) {
        step_runs(where: {run_id: {_eq: $run_id}, step_id: {_eq: $step_id}}) { id status }
      }
    `, { run_id: runId, step_id: step.id });

    let stepRunId: string;
    if (stepRunResult.data?.step_runs?.length > 0) {
      stepRunId = stepRunResult.data.step_runs[0].id;
    } else {
      const insertResult = await adminQuery(`
        mutation CreateStepRun($object: step_runs_insert_input!) {
          insert_step_runs_one(object: $object) { id }
        }
      `, {
        object: {
          run_id: runId,
          step_id: step.id,
          status: 'pending',
          input: { previous_output: previousOutput },
        },
      });
      stepRunId = insertResult.data?.insert_step_runs_one?.id;
    }

    if (!stepRunId) {
      await updateWorkflowRun(runId, { status: 'failed', error: `Failed to create step_run for step ${step.name}`, completed_at: new Date().toISOString() });
      return;
    }

    // Handle skip from conditional branch
    if (skipNext && step.step_type !== 'conditional_branch') {
      await updateStepRun(stepRunId, {
        status: 'skipped',
        output: { reason: 'Skipped by conditional branch' },
        completed_at: new Date().toISOString(),
      });
      skipNext = false;
      continue;
    }
    skipNext = false;

    // Handle approval_gate — pause and stop
    if (step.step_type === 'approval_gate') {
      await updateStepRun(stepRunId, {
        status: 'awaiting_approval',
        input: { previous_output: previousOutput },
        started_at: new Date().toISOString(),
      });
      await updateWorkflowRun(runId, { status: 'paused' });
      console.log(`[WORKFLOW] Run ${runId} paused at approval gate: ${step.name}`);
      return; // Stop execution — will resume when approved
    }

    // Execute step with retry
    const maxAttempts = step.step_type === 'llm_call' || step.step_type === 'http_request' ? 2 : 1;
    let lastError: string | null = null;
    let output: any = null;

    await updateStepRun(stepRunId, {
      status: 'running',
      started_at: new Date().toISOString(),
      input: { previous_output: previousOutput },
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await updateStepRun(stepRunId, { attempt_count: attempt });

        switch (step.step_type) {
          case 'llm_call':
            output = await executeLLMCall(step.config, { previous_output: previousOutput });
            break;
          case 'http_request':
            output = await executeHTTPRequest(step.config, { previous_output: previousOutput });
            break;
          case 'db_write':
            output = await executeDBWrite(step.config, { previous_output: previousOutput }, {
              workflow_id: workflowId,
              run_id: runId,
              step_id: step.id,
            });
            break;
          case 'notify':
            output = await executeNotify(step.config, { previous_output: previousOutput });
            break;
          case 'conditional_branch':
            const condResult = evaluateCondition(step.config, { previous_output: previousOutput });
            output = condResult;
            if (condResult.branch === 'skip_next') {
              skipNext = true;
            }
            break;
          default:
            throw new Error(`Unknown step type: ${step.step_type}`);
        }

        lastError = null;
        break; // Success, exit retry loop
      } catch (err: any) {
        lastError = err.message || String(err);
        console.error(`[WORKFLOW] Step ${step.name} attempt ${attempt} failed: ${lastError}`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
        }
      }
    }

    if (lastError) {
      await updateStepRun(stepRunId, {
        status: 'failed',
        error: lastError,
        output: output || {},
        completed_at: new Date().toISOString(),
      });
      await updateWorkflowRun(runId, {
        status: 'failed',
        error: `Step "${step.name}" failed: ${lastError}`,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    await updateStepRun(stepRunId, {
      status: 'completed',
      output: output || {},
      completed_at: new Date().toISOString(),
    });

    previousOutput = output;
  }

  // All steps completed
  await updateWorkflowRun(runId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });

  // Increment quota
  const workflowResult = await adminQuery(`
    query GetWorkflowOrg($workflow_id: uuid!) {
      workflows_by_pk(id: $workflow_id) { org_id }
    }
  `, { workflow_id: workflowId });

  const orgId = workflowResult.data?.workflows_by_pk?.org_id;
  if (orgId) {
    await adminQuery(`
      mutation IncrementQuota($org_id: uuid!) {
        update_organizations_by_pk(
          pk_columns: {id: $org_id},
          _inc: {quota_used: 1}
        ) { id quota_used }
      }
    `, { org_id: orgId });
  }

  console.log(`[WORKFLOW] Run ${runId} completed successfully`);
}

// ============================================================
// Main Action Handler
// ============================================================

export default async (req: Request, res: Response) => {
  try {
    const { input, session_variables } = req.body;
    const workflowId = input?.workflow_id;
    const userId = session_variables?.['x-hasura-user-id'];

    if (!workflowId) {
      return res.status(400).json({ run_id: null, status: 'error', message: 'workflow_id is required' });
    }

    if (!userId) {
      return res.status(401).json({ run_id: null, status: 'error', message: 'Authentication required' });
    }

    // Layer 2: Verify caller is owner/editor in the workflow's org
    const memberResult = await adminQuery(`
      query CheckMembership($workflow_id: uuid!, $user_id: uuid!) {
        workflows_by_pk(id: $workflow_id) {
          id
          org_id
          organization {
            id
            quota_limit
            quota_used
            quota_period_start
            members(where: {user_id: {_eq: $user_id}}) {
              role
            }
          }
        }
      }
    `, { workflow_id: workflowId, user_id: userId });

    const workflow = memberResult.data?.workflows_by_pk;
    if (!workflow) {
      return res.status(404).json({ run_id: null, status: 'error', message: 'Workflow not found' });
    }

    const member = workflow.organization?.members?.[0];
    if (!member) {
      return res.status(403).json({ run_id: null, status: 'error', message: 'You are not a member of this organization' });
    }

    if (member.role === 'viewer') {
      return res.status(403).json({ run_id: null, status: 'error', message: 'Viewers cannot trigger workflow runs' });
    }

    // Check quota
    const org = workflow.organization;
    if (org.quota_used >= org.quota_limit) {
      // Check if quota period needs reset
      const periodStart = new Date(org.quota_period_start);
      const currentPeriod = new Date();
      currentPeriod.setDate(1);
      currentPeriod.setHours(0, 0, 0, 0);

      if (periodStart < currentPeriod) {
        // Reset quota for new period
        await adminQuery(`
          mutation ResetQuota($org_id: uuid!) {
            update_organizations_by_pk(
              pk_columns: {id: $org_id},
              _set: {quota_used: 0, quota_period_start: "${currentPeriod.toISOString()}"}
            ) { id }
          }
        `, { org_id: org.id });
      } else {
        return res.status(429).json({ run_id: null, status: 'error', message: 'Organization quota exhausted for this period' });
      }
    }

    // Create workflow_run
    const runResult = await adminQuery(`
      mutation CreateWorkflowRun($object: workflow_runs_insert_input!) {
        insert_workflow_runs_one(object: $object) { id }
      }
    `, {
      object: {
        workflow_id: workflowId,
        triggered_by: userId,
        trigger_type: 'manual',
        status: 'pending',
        started_at: new Date().toISOString(),
      },
    });

    const runId = runResult.data?.insert_workflow_runs_one?.id;
    if (!runId) {
      return res.status(500).json({ run_id: null, status: 'error', message: 'Failed to create workflow run' });
    }

    // Start execution asynchronously (don't await — return immediately for live updates)
    executeWorkflow(workflowId, runId, userId).catch(err => {
      console.error(`[WORKFLOW] Async execution failed: ${err.message}`);
      updateWorkflowRun(runId, {
        status: 'failed',
        error: err.message,
        completed_at: new Date().toISOString(),
      });
    });

    return res.status(200).json({
      run_id: runId,
      status: 'running',
      message: 'Workflow run started successfully',
    });

  } catch (err: any) {
    console.error('[triggerWorkflowRun] Error:', err);
    return res.status(500).json({ run_id: null, status: 'error', message: err.message });
  }
};
