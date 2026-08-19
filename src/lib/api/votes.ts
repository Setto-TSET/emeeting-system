// ═══════════════════════════════════════════
// แปลง row ของ Prisma เป็นรูปแบบ VoteTopic ที่ฝั่ง UI ใช้อยู่แล้ว
//
// เก็บรูปแบบ response ให้ตรงกับ src/services/voting/types.ts เป๊ะ เพื่อให้ VotePanel
// เปลี่ยนจาก IndexedDB มาเรียก API ได้โดยไม่ต้องแก้ component
// (createdAt/timestamp เป็น epoch milliseconds เหมือนเดิม ไม่ใช่ ISO string)
// ═══════════════════════════════════════════

import type { Prisma } from "@prisma/client";
import type { VoteTopic } from "@/services/voting/types";

export const voteTopicInclude = {
  options: { orderBy: { sortOrder: "asc" } },
  votes: { include: { user: { select: { name: true } } } },
  creator: { select: { name: true } },
} satisfies Prisma.VoteTopicInclude;

type VoteTopicRow = Prisma.VoteTopicGetPayload<{ include: typeof voteTopicInclude }>;

export function toVoteTopic(row: VoteTopicRow): VoteTopic {
  return {
    id: row.id,
    meetingId: row.meetingId,
    title: row.title,
    description: row.description ?? undefined,
    options: row.options.map((o) => ({ id: o.id, label: o.label })),
    createdBy: row.createdBy,
    createdByName: row.creator.name,
    createdAt: row.createdAt.getTime(),
    status: row.status,
    votes: row.votes.map((v) => ({
      userId: v.userId,
      userName: v.userName,
      optionId: v.optionId,
      timestamp: v.updatedAt.getTime(),
    })),
  };
}
