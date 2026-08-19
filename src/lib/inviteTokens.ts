/**
 * Magic Link — ลิงก์เชิญบุคคลภายนอกเข้าประชุม
 *
 * เดิมเก็บใน localStorage ซึ่งแปลว่าลิงก์ใช้ได้เฉพาะบนเบราว์เซอร์ที่สร้างมันขึ้นมา
 * — ส่งให้คนอื่นแล้วเปิดไม่ได้เลย ตอนนี้ทุกอย่างอยู่ในตาราง InviteToken ฝั่ง server
 */

import { apiCall } from "@/lib/api/client";
import { storeSessionToken } from "@/lib/session";
import type { MeetingParticipant } from "@/data";

export interface InviteToken {
  token: string;
  meetingId: string;
  guestEmail: string;
  guestName?: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedAt?: string;
  createdBy: string;
}

/** ข้อมูลการประชุมเท่าที่หน้า /join ต้องแสดงก่อนแขกกดเข้าร่วม */
export type InviteMeetingPreview = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  organizer: string;
};

export async function createInviteToken(
  meetingId: string,
  guestEmail: string,
  guestName?: string,
  expiresInHours = 48
): Promise<InviteToken> {
  const data = await apiCall<{ invite: InviteToken }>(`/api/meetings/${meetingId}/invites`, {
    method: "POST",
    body: JSON.stringify({ guestEmail, guestName, expiresInHours }),
  });
  return data.invite;
}

export async function getTokensForMeeting(meetingId: string): Promise<InviteToken[]> {
  const data = await apiCall<{ invites: InviteToken[] }>(`/api/meetings/${meetingId}/invites`);
  return data.invites;
}

export async function revokeToken(meetingId: string, tokenId: string): Promise<void> {
  await apiCall(`/api/meetings/${meetingId}/invites/${tokenId}`, { method: "DELETE" });
}

export type VerifyResult =
  | { ok: true; invite: InviteToken; meeting: InviteMeetingPreview }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

export async function verifyToken(tokenId: string): Promise<VerifyResult> {
  try {
    return await apiCall<VerifyResult & { ok: true }>(`/api/invite/${tokenId}`);
  } catch (e) {
    const reason = (e as { message?: string }).message ?? "";
    if (reason.includes("already_used")) return { ok: false, reason: "already_used" };
    // API ตอบ 404 = ไม่มีลิงก์นี้, 410 = หมดอายุหรือถูกใช้แล้ว
    const status = (e as { status?: number }).status;
    if (status === 410) return { ok: false, reason: "expired" };
    return { ok: false, reason: "not_found" };
  }
}

/**
 * ใช้ลิงก์เชิญเข้าประชุม — server จะทำเครื่องหมายว่าใช้แล้ว เพิ่มชื่อเข้าองค์ประชุม
 * และเปิด session ให้แขก (ไม่งั้นแขกเรียก API โหวต/แชท/ขอ token วิดีโอไม่ได้เลย)
 */
export async function joinWithToken(
  tokenId: string,
  name: string,
  role: string
): Promise<{ meetingId: string; participant: MeetingParticipant }> {
  const data = await apiCall<{
    token: string;
    meetingId: string;
    participant: MeetingParticipant;
  }>(`/api/invite/${tokenId}/join`, { method: "POST", body: JSON.stringify({ name, role }) });

  storeSessionToken(data.token);
  return { meetingId: data.meetingId, participant: data.participant };
}

export function buildJoinUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://emeeting.org";
  return `${origin}/join/${token}`;
}
