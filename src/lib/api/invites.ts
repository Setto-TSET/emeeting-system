// แปลง row ของ Prisma เป็น InviteToken รูปแบบที่ UI ใช้ (src/lib/inviteTokens.ts)

import type { InviteToken as InviteTokenRow } from "@prisma/client";
import type { InviteToken } from "@/lib/inviteTokens";

export function toInvite(row: InviteTokenRow): InviteToken {
  return {
    token: row.token,
    meetingId: row.meetingId,
    guestEmail: row.guestEmail,
    guestName: row.guestName ?? undefined,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    used: row.used,
    usedAt: row.usedAt?.toISOString(),
    createdBy: row.createdBy,
  };
}
