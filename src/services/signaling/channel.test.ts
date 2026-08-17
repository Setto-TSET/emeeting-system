import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTransport, MAX_QUEUE_SIZE, RECONNECT_BASE_MS, RECONNECT_MAX_MS } from './channel';
import { setAccessToken } from '@/services/api/client';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  sent: string[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('openTransport', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'ws://api.test/ws');
    setAccessToken('jwt-token-value');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('connects with the meeting id and the stored token', () => {
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe(
      'ws://api.test/ws?meetingId=MT-2569-007&token=jwt-token-value'
    );
  });

  it('reports connected only after the socket opens', () => {
    const onStatus = vi.fn();
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus });

    expect(onStatus).toHaveBeenLastCalledWith(false);
    FakeWebSocket.instances[0].simulateOpen();
    expect(onStatus).toHaveBeenLastCalledWith(true);
  });

  it('queues sends made before the socket is open, then flushes them', () => {
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });

    transport.send('hand_raise', { raised: true });
    expect(FakeWebSocket.instances[0].sent).toHaveLength(0);

    FakeWebSocket.instances[0].simulateOpen();
    expect(FakeWebSocket.instances[0].sent).toHaveLength(1);
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toEqual({
      type: 'hand_raise',
      payload: { raised: true },
    });
  });

  it('forwards parsed messages to onMessage', () => {
    const onMessage = vi.fn();
    openTransport('MT-2569-007', { onMessage, onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    FakeWebSocket.instances[0].simulateMessage({
      type: 'hand_state',
      senderId: 'U-003',
      senderName: 'มาลี',
      timestamp: 1,
      payload: { raised: [] },
    });

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hand_state', senderId: 'U-003' })
    );
  });

  it('ignores malformed messages instead of throwing', () => {
    const onMessage = vi.fn();
    openTransport('MT-2569-007', { onMessage, onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    FakeWebSocket.instances[0].onmessage?.({ data: 'not json' });
    FakeWebSocket.instances[0].simulateMessage({ nope: true });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('reconnects with backoff after an unexpected close', () => {
    const onStatus = vi.fn();
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus });
    FakeWebSocket.instances[0].simulateOpen();

    FakeWebSocket.instances[0].close();
    expect(onStatus).toHaveBeenLastCalledWith(false);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not reconnect after an explicit close()', () => {
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    transport.close();
    vi.advanceTimersByTime(10_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('retries with backoff instead of dying when no token is available yet, then connects once one appears', () => {
    setAccessToken(null);
    const onStatus = vi.fn();
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus });

    // ไม่มี token ตอน mount — ต้องไม่สร้าง socket แต่ก็ต้องไม่ตายถาวร
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(onStatus).toHaveBeenLastCalledWith(false);

    // token ยังไม่มา ก่อนครบ backoff ต้องยังไม่ลองต่อ
    vi.advanceTimersByTime(RECONNECT_BASE_MS - 1);
    expect(FakeWebSocket.instances).toHaveLength(0);

    // token มาแล้วก่อนรอบ retry ถัดไป
    setAccessToken('jwt-token-value');
    vi.advanceTimersByTime(1);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe(
      'ws://api.test/ws?meetingId=MT-2569-007&token=jwt-token-value'
    );
  });

  it('cancels a pending token-retry timer when close() is called before a token appears', () => {
    setAccessToken(null);
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });

    transport.close();
    setAccessToken('jwt-token-value');
    vi.advanceTimersByTime(10_000);

    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('bounds the pre-open queue and coalesces last-write-wins signals, dropping stale subtitles entirely', () => {
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });

    // vote_cast ไม่ coalesce (แต่ละครั้งมีความหมายของตัวเอง) — ส่งเกินเพดานเพื่อพิสูจน์ว่าคิวโดยรวมมีขอบเขต
    for (let i = 0; i < 100; i++) {
      transport.send('vote_cast', { topicId: 'T-1', optionId: `O-${i}` });
    }

    // subtitle_text transient เกินจะมีความหมายหลังต่อกลับมา — ทิ้งทันที ไม่เข้าคิวเลย
    for (let i = 0; i < 100; i++) {
      transport.send('subtitle_text', { text: `partial-${i}`, isFinal: false, lang: 'th' });
    }

    // doc_share_page เป็น "สถานะล่าสุด" — ส่งซ้ำ ๆ ตอนออฟไลน์ ต้องเหลือแค่ค่าสุดท้ายในคิว
    // (และต้องรอดจากการเบียดคิวของ vote_cast ด้านบน เพราะถูกส่งเข้าคิวหลังสุด)
    for (let page = 0; page < 100; page++) {
      transport.send('doc_share_page', { fileId: 'F-1', page });
    }

    FakeWebSocket.instances[0].simulateOpen();
    const sent = FakeWebSocket.instances[0].sent.map((raw) => JSON.parse(raw));

    const docSharePages = sent.filter((s) => s.type === 'doc_share_page');
    expect(docSharePages).toHaveLength(1);
    expect(docSharePages[0].payload.page).toBe(99);

    expect(sent.some((s) => s.type === 'subtitle_text')).toBe(false);

    expect(sent.length).toBeLessThanOrEqual(MAX_QUEUE_SIZE);
  });

  it('resets backoff to the base delay after a successful reopen, and caps it at RECONNECT_MAX_MS', () => {
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    // ปิดต่อเนื่องหลายรอบโดยไม่เปิดสำเร็จ — backoff ต้องเพิ่มแบบทวีคูณจนชนเพดาน
    let expectedDelay = RECONNECT_BASE_MS;
    for (let i = 0; i < 6; i++) {
      FakeWebSocket.instances[FakeWebSocket.instances.length - 1].close();
      vi.advanceTimersByTime(expectedDelay);
      expectedDelay = Math.min(expectedDelay * 2, RECONNECT_MAX_MS);
    }
    expect(expectedDelay).toBe(RECONNECT_MAX_MS);

    // เปิดสำเร็จ แล้วปิดอีกครั้ง — backoff ต้องรีเซ็ตกลับไปที่ base ไม่ใช่ยังชนเพดานอยู่
    const lastIndex = FakeWebSocket.instances.length - 1;
    FakeWebSocket.instances[lastIndex].simulateOpen();
    FakeWebSocket.instances[lastIndex].close();

    vi.advanceTimersByTime(RECONNECT_BASE_MS - 1);
    expect(FakeWebSocket.instances).toHaveLength(lastIndex + 1);

    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(lastIndex + 2);
  });
});
