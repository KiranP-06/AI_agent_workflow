"use client";

import { useNhostAuth } from '@/lib/nhost';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { LogOut, ArrowLeft } from 'lucide-react';

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { orgId: string };
}) {
  const { isAuthenticated, isLoading } = useNhostAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors flex items-center">
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="text-sm font-medium">Workspaces</span>
            </Link>
            <div className="h-4 w-px bg-zinc-700"></div>
            <Link href={`/dashboard/${params.orgId}/workflows`} className="font-semibold text-white">
              Workflows
            </Link>
            <Link href={`/dashboard/${params.orgId}/settings`} className="text-sm font-medium text-zinc-400 hover:text-white">
              Settings
            </Link>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
