"use client";

import { NhostClient } from '@nhost/nhost-js';
import { ApolloClient, InMemoryCache, HttpLink, split, ApolloProvider } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient as createWsClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { createContext, useContext, useEffect, useState } from 'react';

// Initialize Nhost Client
export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local',
  region: process.env.NEXT_PUBLIC_NHOST_REGION || 'local',
});

const NhostAuthContext = createContext({
  isAuthenticated: false,
  isLoading: true,
  user: null as any,
});

export function NhostProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [apolloClient, setApolloClient] = useState<ApolloClient<any> | null>(null);
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  });

  useEffect(() => {
    // Listen to Nhost auth state changes
    nhost.auth.onAuthStateChanged((event, session) => {
      setAuthState({
        isAuthenticated: !!session,
        isLoading: false,
        user: session?.user || null,
      });

      // Rebuild Apollo Client on auth changes to get fresh token
      const httpLink = new HttpLink({
        uri: nhost.graphql.httpUrl,
        headers: {
          Authorization: session ? `Bearer ${session.accessToken}` : '',
        },
      });

      const wsLink = new GraphQLWsLink(
        createWsClient({
          url: nhost.graphql.wsUrl,
          connectionParams: () => ({
            headers: {
              Authorization: session ? `Bearer ${session.accessToken}` : '',
            },
          }),
        })
      );

      const splitLink = split(
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

      setApolloClient(new ApolloClient({
        link: splitLink,
        cache: new InMemoryCache(),
      }));
    });

    setAuthReady(true);
  }, []);

  if (!authReady || !apolloClient) return <div className="p-8 text-center">Loading Application...</div>;

  return (
    <NhostAuthContext.Provider value={authState}>
      <ApolloProvider client={apolloClient}>
        {children}
      </ApolloProvider>
    </NhostAuthContext.Provider>
  );
}

export const useNhostAuth = () => useContext(NhostAuthContext);
