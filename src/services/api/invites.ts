// ═══════════════════════════════════════════
// Invites API — ลิงก์เชิญบุคคลภายนอกอยู่ที่ server แล้ว ไม่ใช่ localStorage
//
// สองฟังก์ชันแรกเรียกโดยคนที่ยังไม่ล็อกอิน (หน้า /join/[token])
// จึงยิงตรงด้วย fetch ไม่ผ่าน apiFetch ที่บังคับแนบ JWT
// ═══════════════════════════════════════════

import { apiBaseUrl, apiFetch, ApiError } from "./client";

export type Invite = {
  token: string;
  meetingId: string;
  guestEmail: string;
  guestName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  usedByName: string | null;
  revokedAt: number | null;
  status: "active" | "used" | "revoked" | "expired";
};

/** การประชุมเท่าที่หน้าเชิญเห็นได้ — ไม่มีวาระ ไฟล์ หรือรายชื่อผู้เข้าร่วม */
export type InviteMeetingView = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  organizer: string;
};

export type InviteView = {
  guestEmail: string;
  guestName: string | null;
  expiresAt: number;
  invitedBy: string;
};

export type InviteRejection = "not_found" | "expired" | "already_used" | "revoked" | "meeting_not_found";

export type OpenInviteResult =
  | { ok: true; invite: InviteView; meeting: InviteMeetingView }
  | { ok: false; reason: InviteRejection };

/** ยิงโดยไม่แนบ JWT — คนเปิดลิงก์ยังไม่มี token */
async function publicFetch(path: string, init: RequestInit = {}) {
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }
}

/** เปิดลิงก์เชิญ — คืนเหตุผลแทนการโยน error เพราะ "ลิงก์หมดอายุ" เป็นผลลัพธ์ปกติที่หน้าเว็บต้องแสดง */
export async function openInvite(token: string): Promise<OpenInviteResult> {
  const res = await publicFetch(`/api/invites/${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => ({}));

  if (res.ok) return { ok: true, invite: body.invite, meeting: body.meeting };
  return { ok: false, reason: (body.reason as InviteRejection) ?? "not_found" };
}

export type AcceptInviteResult =
  | { ok: true; token: string; user: { id: string; name: string; email: string; systemRole: string }; meeting: InviteMeetingView }
  | { ok: false; reason: InviteRejection };

/** ยอมรับคำเชิญ — สำเร็จแล้วได้ guest JWT ที่ผูกกับการประชุมนั้นห้องเดียว */
export async function acceptInvite(token: string, name: string, role?: string): Promise<AcceptInviteResult> {
  const res = await publicFetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: JSON.stringify({ name, role }),
  });
  const body = await res.json().catch(() => ({}));

  if (res.ok) return { ok: true, token: body.token, user: body.user, meeting: body.meeting };
  if (res.status === 400) throw new ApiError(400, body.error ?? "ข้อมูลไม่ครบ");
  return { ok: false, reason: (body.reason as InviteRejection) ?? "not_found" };
}

// ── ต้องล็อกอิน ─────────────────────────────────────────

export async function fetchInvites(meetingId: string): Promise<Invite[]> {
  const { invites } = await apiFetch<{ invites: Invite[] }>(`/api/meetings/${meetingId}/invites`);
  return invites;
}

export async function createInvite(
  meetingId: string,
  guestEmail: string,
  guestName?: string
): Promise<Invite> {
  const { invite } = await apiFetch<{ invite: Invite }>(`/api/meetings/${meetingId}/invites`, {
    method: "POST",
    body: JSON.stringify({ invite: { guestEmail, guestName } }),
  });
  return invite;
}

export async function revokeInvite(token: string): Promise<void> {
  await apiFetch(`/api/invites/${encodeURIComponent(token)}`, { method: "DELETE" });
}
