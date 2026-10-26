import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { createMMKV, type MMKV } from 'react-native-mmkv';

/** The query cache on disk, for reads while offline and a fast cold start. */
export const CACHE_KEY = 'kite.query-cache';
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const cacheStorage: MMKV = createMMKV({ id: CACHE_KEY });

export function createCachePersister(storage: MMKV = cacheStorage) {
  return createAsyncStoragePersister({
    key: CACHE_KEY,
    storage: {
      getItem: (key) => storage.getString(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.remove(key);
      },
    },
    throttleTime: 1000,
  });
}

export const cachePersister = createCachePersister();

/** One-off lookups (an invite link's preview) aren't worth keeping. */
const EPHEMERAL = new Set(['invite']);

function shouldPersist(query: Query) {
  const head = query.queryKey[0];
  return defaultShouldDehydrateQuery(query) && !(typeof head === 'string' && EPHEMERAL.has(head));
}

/**
 * Successful queries and paused mutations (offline writes) survive a restart. A restored
 * mutation has only its key and variables: it replays only when its key has a `mutationFn` set
 * with `queryClient.setMutationDefaults` (writes that are safe to send twice; creates wait for
 * idempotency keys, G15).
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: cachePersister,
  maxAge: CACHE_MAX_AGE_MS,
  // A new app version may parse responses differently: start from an empty cache.
  buster: Constants.expoConfig?.version ?? '0',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};
