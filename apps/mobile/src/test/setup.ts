// Native modules the app's data layer uses, as in-memory stand-ins (jest has no native side).
import type * as SharedTesting from '@kite/shared/testing';
import type * as QueryClientModule from '../api/queryClient';
import type * as MockMMKV from 'react-native-mmkv/lib/createMMKV/createMockMMKV';

// MMKV's own mock (`createMockMMKV`) without loading Nitro, which needs the native runtime.
jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = jest.requireActual<typeof MockMMKV>(
    'react-native-mmkv/lib/createMMKV/createMockMMKV',
  );
  return { createMMKV: createMockMMKV };
});

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual<object>('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

// The realtime socket never reaches a server in tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FakeWebSocket } = require('@kite/shared/testing') as typeof SharedTesting;
globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
afterEach(() => {
  FakeWebSocket.reset();
});

// Cached queries keep a 24 h garbage-collection timer, which would keep jest from exiting.
afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('../api/queryClient') as typeof QueryClientModule).queryClient.clear();
});
