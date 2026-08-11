"use client";

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';
import Link from 'next/link';
import { Play, Plus, Save, Trash2, ArrowLeft, Bot, Globe, Database, Bell, Split, ShieldCheck } from 'lucide-react';

const GET_WORKFLOW = gql`
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id name description
      organization {
        members { role }
      }
      steps(order_by: { step_order: asc }) {
        id step_order step_type name config
      }
      triggers {
        id trigger_type config is_active
      }
    }
  }
`;

const UPSERT_STEPS = gql`
  mutation UpsertSteps($objects: [workflow_steps_insert_input!]!) {
    insert_workflow_steps(
      objects: $objects,
      on_conflict: {
        constraint: workflow_steps_pkey,
        update_columns: [step_order, step_type, name, config]
      }
    ) { returning { id } }
  }
`;

const DELETE_STEP = gql`
  mutation DeleteStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) { id }
  }
`;

const TRIGGER_RUN = gql`
  mutation TriggerRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) { run_id status message }
  }
`;

const STEP_ICONS: Record<string, any> = {
  llm_call: Bot,
  http_request: Globe,
  db_write: Database,
  notify: Bell,
  conditional_branch: Split,
  approval_gate: ShieldCheck,
};

const STEP_TEMPLATES: Record<string, any> = {
  llm_call: { name: 'LLM Prompt', config: { model: 'google/gemini-2.0-flash-001', prompt: 'Summarize: {{previous_output.data}}', max_tokens: 500 } },
  http_request: { name: 'HTTP Request', config: { method: 'GET', url: 'https://api.example.com/data' } },
  db_write: { name: 'Save to DB', config: { result_type: 'summary' } },
  notify: { name: 'Send Alert', config: { channel: 'general', message: 'Workflow completed!' } },
  conditional_branch: { name: 'If/Else', config: { field: 'response', operator: 'contains', value: 'error', true_branch: 'continue', false_branch: 'skip_next' } },
  approval_gate: { name: 'Manual Approval', config: { message: 'Please review before proceeding' } },
};

export default function WorkflowBuilder({ params }: { params: { orgId: string, id: string } }) {
  const { data, loading, refetch } = useQuery(GET_WORKFLOW, { variables: { id: params.id } });
  const [upsertSteps] = useMutation(UPSERT_STEPS);
  const [deleteStep] = useMutation(DELETE_STEP);
  const [triggerRun] = useMutation(TRIGGER_RUN);
  
  const [localSteps, setLocalSteps] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [runLoading, setRunLoading] = useState(false);

  // Sync initial data
  if (data?.workflows_by_pk && !isEditing && localSteps.length === 0 && data.workflows_by_pk.steps.length > 0) {
    setLocalSteps(data.workflows_by_pk.steps);
  }

  const role = data?.workflows_by_pk?.organization?.members?.[0]?.role || 'viewer';
  const canEdit = role === 'owner' || role === 'editor';

  const handleAddStep = (type: string) => {
    setIsEditing(true);
    const template = STEP_TEMPLATES[type];
    setLocalSteps([...localSteps, {
      workflow_id: params.id,
      step_order: localSteps.length,
      step_type: type,
      name: template.name,
      config: template.config,
    }]);
  };

  const handleRemoveStep = async (index: number) => {
    setIsEditing(true);
    const step = localSteps[index];
    const newSteps = [...localSteps];
    newSteps.splice(index, 1);
    // Reorder
    newSteps.forEach((s, i) => s.step_order = i);
    setLocalSteps(newSteps);
    
    if (step.id) {
      await deleteStep({ variables: { id: step.id } });
    }
  };

  const handleSave = async () => {
    if (localSteps.length === 0) return;
    try {
      // Clean up fields before upsert
      const cleanedSteps = localSteps.map(s => {
        const { __typename, ...rest } = s;
        return rest;
      });
      await upsertSteps({ variables: { objects: cleanedSteps } });
      setIsEditing(false);
      refetch();
      alert('Saved!');
    } catch (e) {
      console.error(e);
      alert('Failed to save steps');
    }
  };

  const handleRun = async () => {
    setRunLoading(true);
    try {
      const res = await triggerRun({ variables: { workflow_id: params.id } });
      const runId = res.data.triggerWorkflowRun.run_id;
      if (runId) {
        window.location.href = `/dashboard/${params.orgId}/workflows/${params.id}/run/${runId}`;
      } else {
        alert('Failed to trigger run: ' + res.data.triggerWorkflowRun.message);
      }
    } catch (e: any) {
      alert(`Error triggering run: ${e.message}`);
    } finally {
      setRunLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  const wf = data?.workflows_by_pk;
  if (!wf) return <div>Workflow not found.</div>;

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <Link href={`/dashboard/${params.orgId}/workflows`} className="p-2 mr-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{wf.name}</h1>
            <p className="text-zinc-400 text-sm">Builder Mode</p>
          </div>
        </div>
        <div className="flex space-x-3">
          {canEdit && (
            <button onClick={handleSave} disabled={!isEditing} className={`btn-secondary ${isEditing ? 'border-purple-500 text-purple-400' : ''}`}>
              <Save className="w-4 h-4 mr-2" /> Save Changes
            </button>
          )}
          <button onClick={handleRun} disabled={runLoading || isEditing} className="btn-primary">
            <Play className="w-4 h-4 mr-2" /> {runLoading ? 'Starting...' : 'Run Workflow'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-lg mb-4">Step Sequence</h2>
          
          {localSteps.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-zinc-500 border-dashed border-2 border-zinc-800">
              <p>No steps added yet. Add a step from the panel to begin.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {localSteps.map((step, idx) => {
                const Icon = STEP_ICONS[step.step_type] || Play;
                return (
                  <div key={idx} className="glass rounded-xl p-5 relative group border border-zinc-800 hover:border-zinc-700 transition-colors">
                    {idx > 0 && <div className="absolute -top-4 left-8 w-px h-4 bg-zinc-700"></div>}
                    
                    <div className="flex justify-between items-start">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center mr-4 text-purple-400">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <input 
                            value={step.name}
                            onChange={(e) => {
                              const newSteps = [...localSteps];
                              newSteps[idx].name = e.target.value;
                              setLocalSteps(newSteps);
                              setIsEditing(true);
                            }}
                            disabled={!canEdit}
                            className="font-semibold bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-purple-500 focus:outline-none transition-colors"
                          />
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">{step.step_type.replace('_', ' ')}</p>
                        </div>
                      </div>
                      
                      {canEdit && (
                        <button onClick={() => handleRemoveStep(idx)} className="p-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="mt-4 pl-14">
                      {/* Very basic config editor */}
                      <div className="bg-zinc-900/50 rounded-lg p-3 text-sm font-mono text-zinc-300">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(step.config, null, 2)}
                        </pre>
                        {canEdit && (
                          <div className="mt-2 text-xs text-purple-400 cursor-pointer hover:underline">
                            Edit Config JSON (Implementation details omitted for brevity)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg mb-4">Available Steps</h2>
            <div className="glass rounded-xl p-4 sticky top-24 space-y-2">
              {Object.keys(STEP_TEMPLATES).map(type => {
                const Icon = STEP_ICONS[type];
                const restricted = ['db_write', 'notify'].includes(type) && role !== 'owner';
                
                return (
                  <button
                    key={type}
                    onClick={() => handleAddStep(type)}
                    disabled={restricted}
                    className={`w-full flex items-center p-3 rounded-lg border border-transparent hover:bg-zinc-800 hover:border-zinc-700 transition-colors text-left ${restricted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center mr-3">
                      <Icon className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{STEP_TEMPLATES[type].name}</div>
                      {restricted && <div className="text-[10px] text-red-400">Owner only</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
