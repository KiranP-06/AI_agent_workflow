"use client";

import { gql, useSubscription, useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

const GET_RUN = gql`
  query GetRunDetails($run_id: uuid!) {
    workflow_runs_by_pk(id: $run_id) {
      id
      status
      started_at
      completed_at
      error
      workflow { id name organization { members { role } } }
    }
  }
`;

const SUB_STEP_RUNS = gql`
  subscription OnStepRunsChange($run_id: uuid!) {
    step_runs(where: { run_id: { _eq: $run_id } }, order_by: { step: { step_order: asc } }) {
      id status output error attempt_count
      approved_by approved_at started_at completed_at
      step { id name step_type step_order }
    }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) { success message }
  }
`;

export default function LiveRunViewer({ params }: { params: { orgId: string, id: string, runId: string } }) {
  const { data: runData } = useQuery(GET_RUN, { variables: { run_id: params.runId } });
  const { data: subData, loading: subLoading } = useSubscription(SUB_STEP_RUNS, { variables: { run_id: params.runId } });
  const [approveStep] = useMutation(APPROVE_STEP);

  const run = runData?.workflow_runs_by_pk;
  const stepRuns = subData?.step_runs || [];
  
  const role = run?.workflow?.organization?.members?.[0]?.role || 'viewer';
  const canApprove = role === 'owner' || role === 'editor';

  const handleApprove = async (stepRunId: string) => {
    try {
      const res = await approveStep({ variables: { step_run_id: stepRunId } });
      if (res.data.approveStep.success) {
        // Optimistic UI or wait for subscription
      } else {
        alert(res.data.approveStep.message);
      }
    } catch (e: any) {
      alert(`Approval failed: ${e.message}`);
    }
  };

  if (!run) return <div>Loading run details...</div>;

  return (
    <div className="pb-24 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <Link href={`/dashboard/${params.orgId}/workflows/${params.id}`} className="p-2 mr-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Run Progress: {run.workflow.name}</h1>
            <div className="flex items-center mt-1 text-sm text-zinc-400">
              <span className={`status-dot status-${run.status}`}></span>
              <span className="capitalize">{run.status}</span>
              <span className="mx-2">•</span>
              <span className="font-mono text-xs">{params.runId}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {stepRuns.length === 0 && subLoading ? (
          <div className="p-8 text-center text-zinc-500 glass rounded-xl">Waiting for steps to start...</div>
        ) : (
          stepRuns.map((sr: any, idx: number) => (
            <div key={sr.id} className={`glass rounded-xl p-6 border-l-4 transition-all ${
              sr.status === 'completed' ? 'border-l-green-500' :
              sr.status === 'running' ? 'border-l-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]' :
              sr.status === 'failed' ? 'border-l-red-500' :
              sr.status === 'awaiting_approval' ? 'border-l-amber-500' :
              'border-l-zinc-700'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="text-sm font-medium text-zinc-400">Step {sr.step.step_order + 1}</span>
                    <h3 className="text-lg font-semibold">{sr.step.name}</h3>
                  </div>
                  <div className="text-xs text-zinc-500 uppercase font-mono">{sr.step.step_type}</div>
                </div>
                
                <div className="flex flex-col items-end">
                  <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${
                    sr.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    sr.status === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                    sr.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    sr.status === 'awaiting_approval' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {sr.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {sr.status === 'running' && <Clock className="w-3 h-3 mr-1" />}
                    {sr.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                    {sr.status === 'awaiting_approval' && <AlertTriangle className="w-3 h-3 mr-1" />}
                    <span className="capitalize">{sr.status.replace('_', ' ')}</span>
                  </div>
                  {sr.attempt_count > 1 && (
                    <span className="text-xs text-zinc-500 mt-2">Attempt {sr.attempt_count}</span>
                  )}
                </div>
              </div>

              {sr.status === 'awaiting_approval' && (
                <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-amber-500 flex items-center mb-1">
                      <ShieldCheck className="w-4 h-4 mr-2" /> Approval Required
                    </h4>
                    <p className="text-sm text-amber-500/80">This run is paused and requires authorization to proceed.</p>
                  </div>
                  <button 
                    onClick={() => handleApprove(sr.id)}
                    disabled={!canApprove}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      canApprove 
                        ? 'bg-amber-500 text-black hover:bg-amber-400' 
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    {canApprove ? 'Approve & Continue' : 'Requires Owner/Editor'}
                  </button>
                </div>
              )}

              {sr.error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400 font-mono">
                  {sr.error}
                </div>
              )}

              {sr.status === 'completed' && sr.output && (
                <div className="mt-4 p-4 bg-zinc-900/50 rounded-lg">
                  <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase">Output Data</h4>
                  <pre className="text-xs text-zinc-300 overflow-x-auto">
                    {JSON.stringify(sr.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
