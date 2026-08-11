"use client";

import { NhostClient } from '@nhost/nhost-js';
import { ApolloClient, InMemoryCache, HttpLink, split, ApolloProvider } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient as createWsClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Initialize Nhost Client
export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local',
  region: process.env.NEXT_PUBLIC_NHOST_REGION || 'local',
});

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
}

const NhostAuthContext = createContext<AuthState>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
});

export function NhostProvider({ children }: { children: ReactNode }) {
  const [apolloClient, setApolloClient] = useState<ApolloClient<any> | null>(null);
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  });

  useEffect(() => {
    // Build a default Apollo Client immediately so we don't block rendering
    const buildClient = (accessToken?: string) => {
      const httpLink = new HttpLink({
        uri: nhost.graphql.httpUrl,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      let link: any = httpLink;

      // Only create WebSocket link on the client side
      if (typeof window !== 'undefined') {
        try {
          const wsLink = new GraphQLWsLink(
            createWsClient({
              url: nhost.graphql.wsUrl,
              connectionParams: () => ({
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
              }),
            })
          );

          link = split(
            ({ query }) => {
              const definition = getMainDefinition(query);
              return (
                definition.kind === 'OperationDefinition' &&
                definition.operation === 'subscription'
              );
            },
            wsLink,
            httpLink
          );
        } catch (e) {
          // Fallback to HTTP only
          console.warn('WebSocket link failed, using HTTP only');
        }
      }

      return new ApolloClient({ link, cache: new InMemoryCache() });
    };

    // Set default client
    setApolloClient(buildClient());

    // Listen to auth state changes
    const unsubscribe = nhost.auth.onAuthStateChanged((event, session) => {
      setAuthState({
        isAuthenticated: !!session,
        isLoading: false,
        user: session?.user || null,
      });

      // Rebuild Apollo Client with new token
      setApolloClient(buildClient(session?.accessToken));
    });

    // Mark loading as false after initial check
    const timeout = setTimeout(() => {
      setAuthState(prev => prev.isLoading ? { ...prev, isLoading: false } : prev);
    }, 2000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (!apolloClient) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#a1a1aa' }}>
        Loading...
      </div>
    );
  }

  return (
    <NhostAuthContext.Provider value={authState}>
      <ApolloProvider client={apolloClient}>
        {children}
      </ApolloProvider>
    </NhostAuthContext.Provider>
  );
}

export const useNhostAuth = () => useContext(NhostAuthContext);
