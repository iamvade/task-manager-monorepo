import { healthResponseSchema } from '@kite/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch('/health', healthResponseSchema),
    retry: false,
  });
}
