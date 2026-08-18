// ═══════════════════════════════════════════
// ZegoCloud Server API — ตัวเซ็น signature กลาง ใช้ร่วมกันทุก ZegoCloud Server API
// (ASR, และในอนาคตตัวอื่นถ้าเพิ่ม) — ไม่ใช้กับ video token04 (คนละ signing scheme, ดู src/lib/zegoToken.ts)
//
// อ้างอิง: https://docs.zegocloud.com/article/9781
// Signature = md5(AppId + SignatureNonce + ServerSecret + Timestamp), hex lowercase 32 ตัว
// ═══════════════════════════════════════════

import { createHash, randomBytes } from "node:crypto";

export type ZegoServerApiResponse<T> = {
  Code: number;
  Message: string;
  RequestId: string;
  Data?: T;
};

export function computeSignature(
  appId: number,
  nonce: string,
  serverSecret: string,
  timestamp: number
): string {
  return createHash("md5")
    .update(`${appId}${nonce}${serverSecret}${timestamp}`)
    .digest("hex");
}

function signatureNonce(): string {
  // 16-bit hexadecimal random string ตามที่เอกสารระบุ
  return randomBytes(8).toString("hex");
}

/**
 * เรียก ZegoCloud Server API ตัวใดก็ได้ที่ใช้ signing scheme นี้
 * public params (Action/AppId/SignatureNonce/Timestamp/SignatureVersion/Signature) ไปใน query string
 * business params (เช่น RoomId, TaskId) ไปใน JSON body — ตามตัวอย่างจริงใน ZegoCloud docs
 */
export async function callZegoServerApi<T>(
  baseUrl: string,
  action: string,
  appId: number,
  serverSecret: string,
  params: Record<string, unknown>
): Promise<ZegoServerApiResponse<T>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = signatureNonce();
  const signature = computeSignature(appId, nonce, serverSecret, timestamp);

  const query = new URLSearchParams({
    Action: action,
    AppId: String(appId),
    SignatureNonce: nonce,
    Timestamp: String(timestamp),
    SignatureVersion: "2.0",
    Signature: signature,
  });

  const res = await fetch(`${baseUrl}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return (await res.json()) as ZegoServerApiResponse<T>;
}
