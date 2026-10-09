import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toastMutationError } from './lib/mutationErrors';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
    mutationCache: new MutationCache({
      onError: (error, _vars, _context, mutation) => {
        toastMutationError(error, mutation);
      },
    }),
  });
}
