"use client";

import { gql, useQuery, useMutation } from '@apollo/client';
import Link from 'next/link';
import { Plus, Play, Clock, MoreVertical, Activity } from 'lucide-react';

const GET_WORKFLOWS = gql`
  query GetWorkflows($org_id: uuid!) {
    workflows(where: { org_id: { _eq: $org_id } }, order_by: { created_at: desc }) {
      id
      name
      description
      is_active
      steps_aggregate { aggregate { count } }
      runs(limit: 1, order_by: { started_at: desc }) {
        status
        started_at
      }
    }
  }
`;

const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($org_id: uuid!, $name: String!) {
    insert_workflows_one(object: { org_id: $org_id, name: $name }) {
      id
    }
  }
`;

export default function WorkflowsPage({ params }: { params: { orgId: string } }) {
  const { data, loading } = useQuery(GET_WORKFLOWS, { variables: { org_id: params.orgId } });
  const [createWorkflow] = useMutation(CREATE_WORKFLOW);

  const handleCreate = async () => {
    const name = prompt('Workflow Name:');
    if (!name) return;
    try {
      const res = await createWorkflow({ variables: { org_id: params.orgId, name } });
      window.location.href = `/dashboard/${params.orgId}/workflows/${res.data.insert_workflows_one.id}`;
    } catch (e) {
      alert('Failed to create workflow');
    }
  };

  if (loading) return <div>Loading workflows...</div>;

  const workflows = data?.workflows || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-zinc-400 mt-1">Manage and monitor your automation chains</p>
        </div>
        <button onClick={handleCreate} className="btn-primary">
          <Plus className="w-4 h-4 mr-2" /> New Workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center">
          <Activity className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-lg font-medium mb-2">No workflows yet</h3>
          <p className="text-zinc-400 max-w-md mb-6">Create your first agent workflow to automate tasks, connect APIs, and process data.</p>
          <button onClick={handleCreate} className="btn-primary">
            Get Started
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workflows.map((wf: any) => {
            const lastRun = wf.runs?.[0];
            return (
              <div key={wf.id} className="glass rounded-xl p-6 node-card flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold truncate pr-4">{wf.name}</h3>
                  <div className={`px-2 py-1 text-xs rounded font-medium ${wf.is_active ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    {wf.is_active ? 'Active' : 'Draft'}
                  </div>
                </div>
                
                <p className="text-sm text-zinc-400 mb-6 flex-grow line-clamp-2">
                  {wf.description || 'No description provided.'}
                </p>
                
                <div className="flex items-center justify-between text-sm text-zinc-500 mb-6 border-t border-zinc-800 pt-4">
                  <span>{wf.steps_aggregate.aggregate.count} steps</span>
                  <div className="flex items-center">
                    {lastRun ? (
                      <>
                        <span className={`status-dot status-${lastRun.status}`}></span>
                        <span className="capitalize">{lastRun.status}</span>
                      </>
                    ) : (
                      'Never run'
                    )}
                  </div>
                </div>
                
                <Link href={`/dashboard/${params.orgId}/workflows/${wf.id}`} className="btn-secondary w-full">
                  Edit Workflow
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
