import { parseInviteToken } from '../inviteLink';

const TOKEN = 'Abc_def-0123456789ghijklmnopqrstuvwxyzABCDE';

describe('parseInviteToken', () => {
  it('reads web links, app links and bare tokens', () => {
    expect(parseInviteToken(`https://tasks.kite.mn/invite/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteToken(`  https://tasks.kite.mn/invite/${TOKEN}?utm=x  `)).toBe(TOKEN);
    expect(parseInviteToken(`kitetasks://invite/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteToken(TOKEN)).toBe(TOKEN);
  });

  it('rejects anything else', () => {
    expect(parseInviteToken('')).toBeNull();
    expect(parseInviteToken('https://tasks.kite.mn/w/kite-studio/my-tasks')).toBeNull();
    expect(parseInviteToken('https://tasks.kite.mn/invite/short')).toBeNull();
    expect(parseInviteToken('hello world')).toBeNull();
  });
});
