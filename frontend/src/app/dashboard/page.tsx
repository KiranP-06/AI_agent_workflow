"use client";

import { useNhostAuth, nhost } from '@/lib/nhost';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Building2, LogOut, Plus, Settings, Play } from 'lucide-react';
import Link from 'next/link';

const GET_USER_ORGS = gql`
  query GetUserOrgs($user_id: uuid!) {
    org_members(where: { user_id: { _eq: $user_id } }) {
      role
      organization {
        id
        name
        slug
      }
    }
  }
`;

const CREATE_ORG = gql`
  mutation CreateOrg($name: String!, $slug: String!, $user_id: uuid!) {
    insert_organizations_one(object: {
      name: $name,
      slug: $slug,
      members: {
        data: [{ user_id: $user_id, role: "owner" }]
      }
    }) {
      id
    }
  }
`;

export default function Dashboard() {
  const { isAuthenticated, isLoading, user } = useNhostAuth();
  const router = useRouter();
  
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  
  const { data, loading: orgsLoading, refetch } = useQuery(GET_USER_ORGS, {
    variables: { user_id: user?.id },
    skip: !user?.id,
  });

  const [createOrg] = useMutation(CREATE_ORG);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || orgsLoading) return <div className="p-8">Loading...</div>;
  if (!isAuthenticated) return null;

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const slug = newOrgName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      await createOrg({ variables: { name: newOrgName, slug, user_id: user.id } });
      setNewOrgName('');
      setShowCreateOrg(false);
      refetch();
    } catch (err) {
      console.error(err);
      alert('Failed to create organization');
    }
  };

  const handleSignOut = async () => {
    await nhost.auth.signOut({ all: false });
    router.push('/');
  };

  const orgs = data?.org_members || [];

  return (
    <div className="max-w-6xl mx-auto p-6 pt-12">
      <header className="flex justify-between items-center mb-12 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold">Your Workspaces</h1>
          <p className="text-zinc-400 mt-1">Logged in as {user?.email}</p>
        </div>
        <button onClick={handleSignOut} className="btn-outline text-zinc-400">
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orgs.map((member: any) => (
          <div key={member.organization.id} className="glass rounded-xl p-6 node-card flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="bg-purple-500/20 p-3 rounded-lg text-purple-400">
                <Building2 className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium px-2 py-1 bg-zinc-800 rounded text-zinc-300 capitalize">
                {member.role}
              </span>
            </div>
            
            <h2 className="text-xl font-semibold mb-1">{member.organization.name}</h2>
            <p className="text-sm text-zinc-400 mb-6 flex-grow">
              Workspace ID: <span className="font-mono">{member.organization.slug}</span>
            </p>
            
            <Link 
              href={`/dashboard/${member.organization.id}/workflows`}
              className="btn-primary w-full"
            >
              Enter Workspace
            </Link>
          </div>
        ))}

        {showCreateOrg ? (
          <div className="glass rounded-xl p-6 border-dashed border-2 border-zinc-700">
            <h3 className="font-semibold mb-4">New Workspace</h3>
            <form onSubmit={handleCreateOrg}>
              <input
                type="text"
                required
                placeholder="Company Name"
                className="input-base mb-4"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
              />
              <div className="flex space-x-2">
                <button type="button" onClick={() => setShowCreateOrg(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Create
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button 
            onClick={() => setShowCreateOrg(true)}
            className="rounded-xl p-6 border-dashed border-2 border-zinc-800 hover:border-zinc-600 transition-colors flex flex-col items-center justify-center text-zinc-400 hover:text-zinc-200 min-h-[220px]"
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="font-medium">Create Workspace</span>
          </button>
        )}
      </div>
    </div>
  );
}
