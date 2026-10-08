import argon2 from 'argon2';

export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { type: argon2.argon2id });

let dummyHash: Promise<string> | undefined;

/**
 * Checks a password. With no stored hash (unknown email) it still runs a full verify against a
 * throwaway hash, so response timing doesn't reveal which emails have accounts.
 */
export async function verifyPassword(hash: string | undefined, password: string): Promise<boolean> {
  if (hash === undefined) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
