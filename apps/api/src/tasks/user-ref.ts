import { users } from '../db/schema/index.js';

/** `UserRef` columns of `users`. */
export const userRefColumns = {
  id: users.id,
  name: users.name,
  initials: users.initials,
  avatarColor: users.avatarColor,
};
