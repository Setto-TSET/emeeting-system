import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { signIn, loginEmail } from './session';
import { getAccessToken, setAccessToken } from '@/services/api/client';

describe('signIn', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('stores the token and returns the user on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            token: 'jwt-token-value',
            user: { id: 'U-999', name: 'IT Admin', email: 'admin@e-office.cloud', systemRole: 'admin' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const result = await signIn('admin@e-office.cloud', 'Meeting@2569');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('U-999');
    expect(getAccessToken()).toBe('jwt-token-value');
  });

  it('surfaces the server message and stores no token on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const result = await signIn('admin@e-office.cloud', 'wrong');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    expect(getAccessToken()).toBeNull();
  });

  it('adds the default domain when only a username is typed, keeps full emails as-is', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: 'x' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchSpy);
    const sentEmail = (call: number) => JSON.parse((fetchSpy.mock.calls[call] as unknown as [string, RequestInit])[1].body as string).email;

    await signIn('  Malee.R ', 'pw');
    await signIn('guest@external.org', 'pw');

    expect(sentEmail(0)).toBe('malee.r@e-office.cloud');
    expect(sentEmail(1)).toBe('guest@external.org');
  });

  it('maps a role name to the first test account with that role', () => {
    expect(loginEmail('Secretary')).toBe('malee.r@e-office.cloud');
    expect(loginEmail('staff')).toBe('somchai.j@e-office.cloud');
    expect(loginEmail('external')).toBe('expert@external.org');
    expect(loginEmail('room')).toBe('room-801@e-office.cloud');
    expect(loginEmail('decha')).toBe('decha@e-office.cloud');
  });

  it('accepts the usernames handed out to testers', () => {
    expect(loginEmail('admin')).toBe('admin@e-office.cloud');
    expect(loginEmail('organizer')).toBe('somchai.j@e-office.cloud');
    expect(loginEmail('member')).toBe('decha@e-office.cloud');
    expect(loginEmail('external')).toBe('expert@external.org');
    expect(loginEmail('room-801')).toBe('room-801@e-office.cloud');
  });

  it('rejects an empty email without calling the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await signIn('', 'Meeting@2569');

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a network failure as a readable Thai message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const result = await signIn('admin@e-office.cloud', 'Meeting@2569');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  });
});
