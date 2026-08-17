import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTransport } from './channel';
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
});
