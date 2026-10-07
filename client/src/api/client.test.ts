import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getAnalysis, refreshSession, setAccessToken, setSessionEndedHandler } from './client';

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('API client sessions', () => {
  it('refreshes an expired access token once and retries the request', async () => {
    setAccessToken('expired');
    const calls: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
        if (url.endsWith('/auth/refresh')) return json(200, { token: 'fresh', user: { id: '1', name: 'A B', email: 'a@b.co' } });
        return new Headers(init.headers).get('Authorization') === 'Bearer fresh' ? json(200, { id: 'x' }) : json(401, { code: 'TOKEN_EXPIRED', message: 'expired' });
      }),
    );
    await expect(getAnalysis('x')).resolves.toEqual({ id: 'x' });
    expect(calls.map((call) => call.auth)).toEqual(['Bearer expired', null, 'Bearer fresh']);
  });

  it('ends the session when the refresh cookie is no longer valid', async () => {
    setAccessToken('expired');
    const ended = vi.fn();
    setSessionEndedHandler(ended);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('/auth/refresh') ? json(204, null) : json(401, { code: 'TOKEN_EXPIRED', message: 'Your session expired. Please sign in again.' }))),
    );
    await expect(getAnalysis('x')).rejects.toBeInstanceOf(ApiError);
    expect(ended).toHaveBeenCalledWith('expired');
  });

  it('sends the CSRF header on refresh and treats 204 as "no session"', async () => {
    const fetchMock = vi.fn(async () => json(204, null));
    vi.stubGlobal('fetch', fetchMock);
    await expect(refreshSession()).resolves.toBeNull();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('resumefit');
    expect(init.credentials).toBe('include');
  });

  it('maps network failures to a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(getAnalysis('x')).rejects.toMatchObject({ code: 'NETWORK', message: expect.stringContaining('Cannot reach') });
  });
});
