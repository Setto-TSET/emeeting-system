import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchRoomSnapshot, EMPTY_SNAPSHOT } from './snapshot';
import { setAccessToken } from '@/services/api/client';

describe('fetchRoomSnapshot', () => {
  beforeEach(() => {
    setAccessToken('jwt-token-value');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns every section of the snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            voteTopics: [],
            raisedHands: [{ userId: 'U-003', userName: 'มาลี', raisedAt: 5 }],
            transcript: [{ speakerId: 'U-001', speakerName: 'สมชาย', startSec: 0, text: 'สวัสดี' }],
            docShare: { fileId: 'F-1', fileName: 'วาระ.pdf', page: 2, sharedBy: 'U-999', sharedName: 'admin' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const snapshot = await fetchRoomSnapshot('MT-2569-007');

    expect(snapshot.raisedHands).toHaveLength(1);
    expect(snapshot.transcript[0].text).toBe('สวัสดี');
    expect(snapshot.docShare?.page).toBe(2);
  });

  it('falls back to an empty snapshot on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));

    await expect(fetchRoomSnapshot('MT-2569-007')).resolves.toEqual(EMPTY_SNAPSHOT);
  });
});
