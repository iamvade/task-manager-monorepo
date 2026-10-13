import { shortName, shortNames } from '@kite/shared';
import { useMemo } from 'react';

interface Person {
  id: string;
  name: string;
}

/**
 * `shortName` made distinct across a list of people (two "Бат-Эрдэнэ Г." become "…Ганб." and
 * "…Гант."). Returns a lookup for any user; someone outside the list gets the plain short form.
 */
export function useShortNames(people: readonly Person[]): (user: Person) => string {
  const map = useMemo(() => shortNames(people), [people]);
  return (user) => map.get(user.id) ?? shortName(user.name);
}
