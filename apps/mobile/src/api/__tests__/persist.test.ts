import NetInfo from '@react-native-community/netinfo';
import { queryKeys } from '@kite/shared/client';
import { ME } from '@kite/shared/testing';
import { onlineManager } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { createMMKV } from 'react-native-mmkv';
import { signOut } from '../../auth/signOut';
import { resetApp, signedInSession } from '../../test/app';
import { wireQueryLifecycle } from '../lifecycle';
import { cachePersister, createCachePersister, persistOptions } from '../persist';
import { createQueryClient, queryClient } from '../queryClient';

/** The app's client, but finished writes are dropped at once (their 5 min timer would keep jest up). */
function testClient() {
  const client = createQueryClient();
  client.setDefaultOptions({ ...client.getDefaultOptions(), mutations: { gcTime: 0 } });
  return client;
}

/** The NetInfo listener `wireQueryLifecycle` registered. */
function netListener() {
  const listener = jest.mocked(NetInfo.addEventListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('no NetInfo listener');
  return (isConnected: boolean) => {
    listener({ isConnected, isInternetReachable: isConnected } as Parameters<typeof listener>[0]);
  };
}

describe('offline writes and the persisted cache', () => {
  beforeEach(async () => {
    await resetApp();
    jest.mocked(NetInfo.addEventListener).mockClear();
    wireQueryLifecycle();
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('pauses a mutation while NetInfo says offline and sends it on reconnect', async () => {
    const client = testClient();
    client.mount();
    const setOnline = netListener();
    const send = jest.fn((n: number) => Promise.resolve(n * 2));

    setOnline(false);
    const result = client.getMutationCache().build(client, { mutationFn: send }).execute(21);
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);

    setOnline(true);
    await expect(result).resolves.toBe(42);
    expect(send.mock.calls[0]?.[0]).toBe(21);
    client.unmount();
    client.clear();
  });

  it('restores queries and paused writes after a restart, then replays the writes', async () => {
    const storage = createMMKV({ id: 'persist-test' });
    const persister = createCachePersister(storage);
    const before = testClient();
    before.setQueryData(queryKeys.me, ME);
    before.setQueryData(['invite', 'tok'], { email: 'x' });
    before.setMutationDefaults(['test-write'], { mutationFn: (n: number) => Promise.resolve(n) });
    onlineManager.setOnline(false);
    void before
      .getMutationCache()
      .build(before, { mutationKey: ['test-write'] })
      .execute(7)
      .catch(() => undefined);
    await Promise.resolve();
    await persistQueryClientSave({
      queryClient: before,
      persister,
      buster: persistOptions.buster,
      dehydrateOptions: persistOptions.dehydrateOptions,
    });
    // The old app's copy goes away with it (here: let it finish so jest can exit).
    onlineManager.setOnline(true);
    await before.resumePausedMutations();
    onlineManager.setOnline(false);

    const after = testClient();
    const replay = jest.fn((n: number) => Promise.resolve(n));
    after.setMutationDefaults(['test-write'], { mutationFn: replay });
    await persistQueryClientRestore({
      queryClient: after,
      persister,
      maxAge: persistOptions.maxAge,
      buster: persistOptions.buster,
    });
    expect(after.getQueryData(queryKeys.me)).toEqual(ME);
    // One-off lookups aren't kept.
    expect(after.getQueryData(['invite', 'tok'])).toBeUndefined();

    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    expect(replay.mock.calls[0]?.[0]).toBe(7);
    before.clear();
    after.clear();
  });

  it('forgets the persisted cache on sign-out', async () => {
    await signedInSession();
    queryClient.setQueryData(queryKeys.me, ME);
    await persistQueryClientSave({ queryClient, persister: cachePersister });
    expect(await cachePersister.restoreClient()).toBeDefined();
    await signOut();
    expect(await cachePersister.restoreClient()).toBeUndefined();
  });
});
