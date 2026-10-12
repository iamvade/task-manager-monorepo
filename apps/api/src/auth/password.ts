import argon2 from 'argon2';

/**
 * Each argon2id hash takes ~64 MiB and a CPU core for a moment. Cap how many run at once so a
 * burst of sign-ins (from many IPs, past the per-IP limit) queues instead of exhausting memory.
 */
const MAX_CONCURRENT = 4;
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

export const hashPassword = (password: string): Promise<string> =>
  limited(() => argon2.hash(password, { type: argon2.argon2id }));

let dummyHash: Promise<string> | undefined;

/**
 * Checks a password. With no stored hash (unknown email) it still runs a full verify against a
 * throwaway hash, so response timing doesn't reveal which emails have accounts.
 */
export async function verifyPassword(hash: string | undefined, password: string): Promise<boolean> {
  if (hash === undefined) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    const dummy = await dummyHash;
    await limited(() => argon2.verify(dummy, password)).catch(() => false);
    return false;
  }
  try {
    return await limited(() => argon2.verify(hash, password));
  } catch {
    return false;
  }
}
