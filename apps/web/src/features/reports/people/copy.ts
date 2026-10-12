/** People (an admin looking at someone) or My performance (a member looking at themselves). */
export type PersonVariant = 'people' | 'me';

/** i18n prefix of the strings whose wording differs between the two (design STR tables). */
export const variantKeys = (variant: PersonVariant) =>
  variant === 'me' ? 'reports.person.mine' : 'reports.person.people';
