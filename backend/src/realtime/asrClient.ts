// ═══════════════════════════════════════════
// ASR Client — คุยกับ sidecar ที่ถอดเสียงเท่านั้น ไม่มี business logic
//
// เปลี่ยนผู้ให้บริการถอดเสียง (เช่นย้ายไป ZegoCloud Cloud ASR) ให้แก้แค่ไฟล์นี้ไฟล์เดียว
// ═══════════════════════════════════════════

// ก้อนเสียง 3 วินาทีถอดเสร็จในราว 200 มิลลิวินาที ให้เวลา 10 วินาทีคือเผื่อไว้มากแล้ว
// เกินกว่านี้แปลว่า sidecar มีปัญหา ปล่อยให้ล้มเร็วดีกว่าค้างสะสม
const TIMEOUT_MS = 10_000;

export function asrBaseUrl(): string {
  return process.env.ASR_URL ?? 'http://localhost:8000';
}

/**
 * ความลับที่ sidecar ใช้ตรวจว่า request มาจาก backend ของเราจริง
 * จำเป็นเมื่อ sidecar อยู่บน public URL (เช่น Hugging Face Spaces) — ดู deploy/HUGGINGFACE.md
 * ไม่ตั้งค่าก็ยิงได้เหมือนเดิม สำหรับ docker compose ที่ sidecar อยู่ในเครือข่ายปิด
 */
function authHeaders(): Record<string, string> {
  const token = process.env.ASR_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function transcribePcm(pcm: Buffer): Promise<string> {
  const response = await fetch(`${asrBaseUrl()}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...authHeaders() },
    body: new Uint8Array(pcm),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`ASR sidecar ตอบกลับ ${response.status}`);
  }

  const body = (await response.json()) as { text?: unknown };
  if (typeof body.text !== 'string') {
    throw new Error('ASR sidecar ไม่ได้คืนข้อความ');
  }

  return body.text;
}
