/** Seeded people used by the specs (apps/api/src/db/seed; everyone's password is password123). */
export const ADMIN = { email: 'anu@kite.test', state: 'e2e/.auth/admin.json' } as const;
export const MEMBER = { email: 'dorj@kite.test', state: 'e2e/.auth/member.json' } as const;
/** The platform admin (no workspace): signs in to /admin. */
export const VADE = { email: 'vade@kite.test', state: 'e2e/.auth/vade.json' } as const;
export const PASSWORD = 'password123';
/** Sara K., a member of App Redesign (mentioned in the journey spec). */
export const SARA = { email: 'sara@kite.test' } as const;
