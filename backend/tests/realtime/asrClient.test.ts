import http from 'http';
import { AddressInfo } from 'net';
import { transcribePcm } from '../../src/realtime/asrClient';

let server: http.Server;
let received: Buffer[] = [];
let receivedAuth: (string | undefined)[] = [];
let respond: (res: http.ServerResponse) => void;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    receivedAuth.push(req.headers.authorization);
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      received.push(Buffer.concat(chunks));
      respond(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.ASR_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  receivedAuth = [];
  delete process.env.ASR_TOKEN;
  respond = (res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'สวัสดีครับ' }));
  };
});

test('ส่ง PCM ดิบไปที่ sidecar แล้วคืนข้อความที่ได้', async () => {
  const pcm = Buffer.from([0x01, 0x00, 0x02, 0x00]);
  const text = await transcribePcm(pcm);

  expect(text).toBe('สวัสดีครับ');
  expect(received).toHaveLength(1);
  expect(received[0].equals(pcm)).toBe(true);
});

test('sidecar ตอบ 500 แล้ว throw', async () => {
  respond = (res) => {
    res.writeHead(500);
    res.end('boom');
  };

  await expect(transcribePcm(Buffer.from([0x00, 0x00]))).rejects.toThrow();
});

test('sidecar คืน JSON ที่ไม่มี text แล้ว throw', async () => {
  respond = (res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ oops: true }));
  };

  await expect(transcribePcm(Buffer.from([0x00, 0x00]))).rejects.toThrow();
});

test('แนบ ASR_TOKEN เป็น Bearer เมื่อตั้งค่าไว้', async () => {
  process.env.ASR_TOKEN = 's3cr3t';
  await transcribePcm(Buffer.from([0x00, 0x00]));

  expect(receivedAuth[0]).toBe('Bearer s3cr3t');
});

test('ไม่แนบ Authorization เมื่อไม่ได้ตั้ง ASR_TOKEN', async () => {
  // sidecar ที่อยู่ในเครือข่ายปิดของ docker compose ไม่ได้ตั้งความลับไว้
  await transcribePcm(Buffer.from([0x00, 0x00]));

  expect(receivedAuth[0]).toBeUndefined();
});
