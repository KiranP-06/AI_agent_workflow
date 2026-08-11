"use client";

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';
import { Users, Shield, Zap, Settings2 } from 'lucide-react';

const GET_ORG_DETAILS = gql`
  query GetOrgDetails($org_id: uuid!) {
    organizations_by_pk(id: $org_id) {
      id name slug
      quota_limit quota_used quota_period_start
      members {
        id role
        user { id email }
      }
    }
    org_usage_stats(where: { org_id: { _eq: $org_id } }) {
      total_runs_this_period
      avg_run_duration_seconds
    }
  }
`;

// Note: Nhost creates users in auth schema, but inserting into org_members usually needs the user_id. 
// For this simple demo, we'll assume we can't easily add completely new users without knowing their UUID unless we build a full invite system.
// We'll focus on displaying the data and showing the quota.

export default function OrgSettings({ params }: { params: { orgId: string } }) {
  const { data, loading } = useQuery(GET_ORG_DETAILS, { variables: { org_id: params.orgId } });
  
  if (loading) return <div>Loading settings...</div>;

  const org = data?.organizations_by_pk;
  const stats = data?.org_usage_stats?.[0] || {};
  
  if (!org) return <div>Organization not found or access denied.</div>;

  // Layer 1 check - what role is the current user?
  // Actually, we'd need to know the current user ID to accurately say "your role",
  // but we can infer it from what they can see if we assume viewer can't see this page.
  // We'll just display the members.

  const quotaPercent = Math.min(100, Math.max(0, (org.quota_used / org.quota_limit) * 100));

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{org.name} Settings</h1>
        <p className="text-zinc-400 mt-1">Manage workspace preferences, team members, and quotas</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="glass rounded-xl p-6">
          <div className="flex items-center mb-4">
            <Zap className="w-5 h-5 text-purple-400 mr-2" />
            <h2 className="text-lg font-semibold">Usage Quota</h2>
          </div>
          
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-zinc-400">Workflow Runs</span>
            <span className="font-medium">{org.quota_used} / {org.quota_limit}</span>
          </div>
          
          <div className="w-full bg-zinc-800 rounded-full h-2 mb-6">
            <div 
              className={`h-2 rounded-full ${quotaPercent > 90 ? 'bg-red-500' : 'bg-purple-500'}`}
              style={{ width: `${quotaPercent}%` }}
            ></div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Total Runs</p>
              <p className="text-xl font-medium">{stats.total_runs_this_period || 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Avg Duration</p>
              <p className="text-xl font-medium">{Math.round(stats.avg_run_duration_seconds || 0)}s</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-6">
          <div className="flex items-center mb-4">
            <Settings2 className="w-5 h-5 text-purple-400 mr-2" />
            <h2 className="text-lg font-semibold">Workspace Details</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 uppercase tracking-wider block">Workspace Name</label>
              <input type="text" readOnly value={org.name} className="input-base bg-zinc-800/50" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 uppercase tracking-wider block">Workspace ID (Slug)</label>
              <input type="text" readOnly value={org.slug} className="input-base font-mono text-zinc-400 bg-zinc-800/50" />
            </div>
            <p className="text-xs text-amber-500 mt-2 flex items-center">
              <Shield className="w-3 h-3 mr-1" /> Only Owners can modify workspace details
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Users className="w-5 h-5 text-purple-400 mr-2" />
            <h2 className="text-lg font-semibold">Team Members</h2>
          </div>
        </div>
        
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-400 bg-zinc-900/50 uppercase border-b border-zinc-800">
              <tr>
                <th className="px-6 py-3">User ID (Email simulated)</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m: any) => (
                <tr key={m.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                  <td className="px-6 py-4 font-medium">{m.user?.email || m.user?.id}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                      m.role === 'owner' ? 'bg-purple-500/20 text-purple-400' :
                      m.role === 'editor' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-zinc-800 text-zinc-300'
                    }`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-xs text-zinc-500 hover:text-white transition-colors">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
