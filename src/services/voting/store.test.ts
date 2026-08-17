import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listTopics } from './store';
import { setAccessToken } from '@/services/api/client';

describe('voting store', () => {
  beforeEach(() => {
    setAccessToken('jwt-token-value');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reads topics from the room snapshot endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          voteTopics: [
            {
              id: 'vote-1',
              meetingId: 'MT-2569-007',
              title: 'มติที่ 1',
              options: [{ id: 'opt-1', label: 'เห็นด้วย' }],
              createdBy: 'U-999',
              createdByName: 'IT Admin',
              createdAt: 1,
              status: 'open',
              votes: [],
            },
          ],
          raisedHands: [],
          transcript: [],
          docShare: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const topics = await listTopics('MT-2569-007');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/rooms/MT-2569-007/state',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(topics).toHaveLength(1);
    expect(topics[0].title).toBe('มติที่ 1');
  });

  it('returns an empty list when the request fails, so the room still renders', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await expect(listTopics('MT-2569-007')).resolves.toEqual([]);
  });
});
