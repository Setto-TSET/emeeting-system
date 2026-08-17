import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { signIn } from './session';
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
