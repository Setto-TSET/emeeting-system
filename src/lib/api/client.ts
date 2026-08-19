// ═══════════════════════════════════════════
// fetch helper ฝั่ง client — จุดเดียวที่แนบ session และแปลง error เป็น exception
// ใช้ร่วมกันทุก service (voting, booking, ...) จะได้ไม่ต้องเขียน try/catch ซ้ำทุกไฟล์
// ═══════════════════════════════════════════

import { authHeaders } from "@/lib/session";

export class ApiClientError extends Error {
  /** status 0 = ต่อเซิร์ฟเวอร์ไม่ติด (ไม่ใช่ error จาก server) */
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
    });
  } catch {
    throw new ApiClientError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }

  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new ApiClientError(response.status, data?.error ?? `เรียก API ไม่สำเร็จ (${response.status})`);
  }
  return data as T;
}
