import { mcpTokenSchema, signedInDeviceSchema, type CreateMcpToken } from '@kite/shared';
import { queryKeys } from '@kite/shared/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';

/** My MCP tokens (Settings → Claude), most recently used first. */
export function useMcpTokens() {
  return useQuery({
    queryKey: queryKeys.signedInDevices,
    queryFn: () => apiFetch('/auth/sessions', z.array(signedInDeviceSchema)),
    select: (devices) => devices.filter((d) => d.client === 'mcp'),
  });
}

/** A new token for Claude Desktop; the response is the only time the token is visible. */
export function useCreateMcpToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMcpToken) => apiSend('/auth/mcp-tokens', mcpTokenSchema, 'POST', body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.signedInDevices }),
  });
}

/** Ends a token: Claude Desktop using it gets 401 from then on. */
export function useRevokeMcpToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/auth/sessions/${id}`, z.null(), 'DELETE'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.signedInDevices }),
  });
}
