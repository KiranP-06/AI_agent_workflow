"use client";

import { useState } from 'react';
import { nhost } from '@/lib/nhost';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { session, error } = await nhost.auth.signUp({ email, password });
        if (error) throw error;
        // Since we disabled email verification in config, it logs them in
        router.push('/dashboard');
      } else {
        const { session, error } = await nhost.auth.signIn({ email, password });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
            AgentFlow
          </h1>
          <p className="text-zinc-400 mt-2">Next-Gen AI Workflow Builder</p>
        </div>

        <div className="glass rounded-xl p-8">
          <h2 className="text-2xl font-semibold mb-6">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-md mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
              <input
                type="email"
                required
                className="input-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Password</label>
              <input
                type="password"
                required
                className="input-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6"
            >
              {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-400">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
