import { applyAuthUrl } from '@/data/auth';

/**
 * The bug this covers: signUpWithEmail() creates the account, Supabase mails
 * a confirmation link, and the app has to actually turn that link into a
 * session when it's tapped - otherwise the account exists, confirmed, while
 * the app stays stuck on the guest identity forever with nothing to explain
 * why. applyAuthUrl is the piece that closes that loop, for both link shapes
 * Supabase actually sends (PKCE `?code=` and implicit `#access_token=`), plus
 * a magic-link/OAuth deep link arriving mid-navigation.
 */

const mockExchangeCodeForSession = jest.fn(async (_code: string) => ({ error: null as { message: string } | null }));
const mockSetSession = jest.fn(async (_tokens: { access_token: string; refresh_token: string }) => ({
  error: null as { message: string } | null,
}));

jest.mock('@/data/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
      setSession: (tokens: { access_token: string; refresh_token: string }) => mockSetSession(tokens),
    },
  },
}));

describe('applyAuthUrl', () => {
  beforeEach(() => {
    mockExchangeCodeForSession.mockClear();
    mockSetSession.mockClear();
  });

  it('exchanges a PKCE code (Google/Apple OAuth, and PKCE-mode email links)', async () => {
    const applied = await applyAuthUrl('cliffhanger://auth-callback?code=abc123');
    expect(applied).toBe(true);
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('sets the session from implicit-flow tokens (email confirmation, password recovery, magic links)', async () => {
    const applied = await applyAuthUrl(
      'cliffhanger://auth-callback#access_token=at-1&refresh_token=rt-1&type=signup',
    );
    expect(applied).toBe(true);
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'at-1', refresh_token: 'rt-1' });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('returns false, not an error, for a deep link that carries neither shape', async () => {
    // e.g. a notification deep link, or any other in-app URL a passive
    // listener sees that has nothing to do with auth.
    const applied = await applyAuthUrl('cliffhanger://title/12345');
    expect(applied).toBe(false);
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('does not treat a half-formed implicit URL as valid', async () => {
    // access_token present but refresh_token missing - must not silently succeed.
    const applied = await applyAuthUrl('cliffhanger://auth-callback#access_token=at-1');
    expect(applied).toBe(false);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('throws when Supabase rejects the code, rather than reporting success', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: { message: 'invalid grant' } });
    await expect(applyAuthUrl('cliffhanger://auth-callback?code=expired')).rejects.toMatchObject({
      message: 'invalid grant',
    });
  });

  it('throws when Supabase rejects the tokens, rather than reporting success', async () => {
    mockSetSession.mockResolvedValueOnce({ error: { message: 'invalid token' } });
    await expect(
      applyAuthUrl('cliffhanger://auth-callback#access_token=at-1&refresh_token=rt-1'),
    ).rejects.toMatchObject({ message: 'invalid token' });
  });
});
