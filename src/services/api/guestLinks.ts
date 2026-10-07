// ═══════════════════════════════════════════
// Guest Links API — ลิงก์เดียวต่อการประชุมสำหรับบุคคลภายนอก
//
// สองฟังก์ชันแรกเรียกโดยคนที่ยังไม่ล็อกอิน (หน้า /join/[token]) จึงยิงตรงด้วย fetch
// ไม่ผ่าน apiFetch — ถ้าผ่าน apiFetch แล้ว server ตอบ 401 จะถูกพาไปหน้า login
// ═══════════════════════════════════════════

import { apiBaseUrl, apiFetch, ApiError } from "./client";

/** การประชุมเท่าที่หน้าเชิญเห็นได้ — ไม่มีวาระ ไฟล์ หรือรายชื่อผู้เข้าร่วม */
export type GuestLinkMeeting = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  organizer: string;
};

export type GuestLinkRejection =
  | "not_found"
  | "guest_join_disabled"
  // server ล่มหรือเน็ตหลุด — ไม่ใช่ลิงก์ผิด ต้องบอกให้ลองใหม่ ไม่ใช่ให้ไปขอลิงก์ใหม่
  | "unavailable";

export type OpenGuestLinkResult = { ok: true; meeting: GuestLinkMeeting } | { ok: false; reason: GuestLinkRejection };

export type JoinGuestLinkResult =
  | { ok: true; token: string; user: { id: string; name: string; email: string; systemRole: string }; meeting: GuestLinkMeeting }
  | { ok: false; reason: GuestLinkRejection };

async function publicFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    return null;
  }
}

function rejectionOf(res: Response, body: { reason?: unknown }): GuestLinkRejection {
  if (res.status >= 500) return "unavailable";
  return body.reason === "guest_join_disabled" ? "guest_join_disabled" : "not_found";
}

/** เปิดลิงก์ — คืนเหตุผลแทนการโยน error เพราะ "ลิงก์ถูกปิด" เป็นผลลัพธ์ปกติที่หน้าเว็บต้องแสดง */
export async function openGuestLink(token: string): Promise<OpenGuestLinkResult> {
  const res = await publicFetch(`/api/guest-links/${encodeURIComponent(token)}`);
  if (!res) return { ok: false, reason: "unavailable" };
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, meeting: body.meeting };
  return { ok: false, reason: rejectionOf(res, body) };
}

/** ใส่ชื่อแล้วเข้าร่วม — สำเร็จแล้วได้ guest JWT ที่ผูกกับการประชุมนี้ห้องเดียว */
export async function joinGuestLink(token: string, name: string): Promise<JoinGuestLinkResult> {
  const res = await publicFetch(`/api/guest-links/${encodeURIComponent(token)}/join`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res) return { ok: false, reason: "unavailable" };
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, token: body.token, user: body.user, meeting: body.meeting };
  if (res.status === 400) throw new ApiError(400, body.error ?? "ข้อมูลไม่ครบ");
  return { ok: false, reason: rejectionOf(res, body) };
}

// ── ต้องล็อกอินและจัดการการประชุมได้ ─────────────────────────

/** ลิงก์ปัจจุบันของการประชุม — null คือยังไม่เคยสร้าง */
export async function fetchGuestLink(meetingId: string): Promise<string | null> {
  const { token } = await apiFetch<{ token: string | null }>(`/api/meetings/${meetingId}/guest-link`);
  return token;
}

/** สร้างลิงก์ใหม่ — ลิงก์เดิมใช้ไม่ได้ทันที */
export async function rotateGuestLink(meetingId: string): Promise<string> {
  const { token } = await apiFetch<{ token: string }>(`/api/meetings/${meetingId}/guest-link`, { method: "POST" });
  return token;
}

/** URL เต็มที่ใช้แชร์ — ประกอบจาก origin ของเบราว์เซอร์ */
export function guestLinkUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join/${token}`;
}
