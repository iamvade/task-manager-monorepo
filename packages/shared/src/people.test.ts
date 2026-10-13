import { describe, expect, it } from 'vitest';
import { matchesName, nameSearchKey, shortName, shortNames } from './people.js';

describe('shortName', () => {
  it('abbreviates the last name', () => {
    expect(shortName('Anu Bold')).toBe('Anu B.');
    expect(shortName('Ану Болд')).toBe('Ану Б.');
  });

  it('keeps short and single names', () => {
    expect(shortName('Sara K.')).toBe('Sara K.');
    expect(shortName('Bat')).toBe('Bat');
  });
});

describe('shortNames', () => {
  const names = (people: { id: string; name: string }[]) => Object.fromEntries(shortNames(people));

  it('uses the plain short form when nothing collides', () => {
    expect(
      names([
        { id: 'a', name: 'Anu Bold' },
        { id: 'b', name: 'Bat Orgil' },
      ]),
    ).toEqual({ a: 'Anu B.', b: 'Bat O.' });
  });

  it('grows the surname prefix until two colliding short names differ', () => {
    expect(
      names([
        { id: 'a', name: 'Бат-Эрдэнэ Ганболд' },
        { id: 'b', name: 'Бат-Эрдэнэ Гантулга' },
        { id: 'c', name: 'Бат-Эрдэнэ Цогт' },
      ]),
    ).toEqual({ a: 'Бат-Эрдэнэ Ганб.', b: 'Бат-Эрдэнэ Гант.', c: 'Бат-Эрдэнэ Ц.' });
  });

  it('falls back to the full name when one surname is a prefix of the other', () => {
    expect(
      names([
        { id: 'a', name: 'Anu Bold' },
        { id: 'b', name: 'Anu Boldbaatar' },
      ]),
    ).toEqual({ a: 'Anu Bold', b: 'Anu Boldb.' });
  });

  it('keeps identical full names as they are', () => {
    expect(
      names([
        { id: 'a', name: 'Bat Orgil' },
        { id: 'b', name: 'Bat Orgil' },
      ]),
    ).toEqual({ a: 'Bat O.', b: 'Bat O.' });
  });
});

describe('nameSearchKey / matchesName', () => {
  it('folds Cyrillic and Latin spellings together', () => {
    expect(nameSearchKey('Бат-Эрдэнэ')).toBe('bat-erdene');
    expect(nameSearchKey('Bat-Erdene')).toBe('bat-erdene');
    expect(nameSearchKey('Цогт')).toBe(nameSearchKey('Tsogt'));
    expect(nameSearchKey('Хулан')).toBe(nameSearchKey('Khulan'));
    expect(nameSearchKey('Müller')).toBe('muller');
  });

  it('matches a query in either script, case-insensitively', () => {
    expect(matchesName('Бат-Эрдэнэ Ганболд', 'bat')).toBe(true);
    expect(matchesName('Bat-Erdene Tsogt', 'Бат-Эрдэнэ')).toBe(true);
    expect(matchesName('Bat-Erdene Tsogt', 'цогт')).toBe(true);
    expect(matchesName('Anu Bold', 'Бат')).toBe(false);
    expect(matchesName('Anu Bold', '')).toBe(true);
  });
});
