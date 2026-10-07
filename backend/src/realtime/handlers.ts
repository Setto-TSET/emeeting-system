// ═══════════════════════════════════════════
// Signal Handlers — เขียน MySQL ก่อน แล้วค่อยกระจายผลที่ยืนยันแล้วออกไป
//
// ผู้ส่งมาจาก client.userId (ซึ่งมาจาก JWT) เสมอ
// ไม่เคยอ่าน senderId จาก message ที่ client ส่งมา
// ═══════════════════════════════════════════

import { randomUUID } from 'crypto';
import type { RoomClient } from './rooms';
import { send, broadcast } from './server';
import * as votes from '../repositories/votes';
import * as hands from '../repositories/handRaises';
import * as docShare from '../repositories/docShare';
import { appendChatMessage, getMeeting } from '../repositories/meetings';
import { clientsIn } from './rooms';

const MAX_CHAT_LENGTH = 1000;

function envelope(client: RoomClient, type: string, payload: unknown) {
  return { type, senderId: client.userId, senderName: client.userName, timestamp: Date.now(), payload };
}

function fail(client: RoomClient, reason: string) {
  send(client.socket, envelope(client, 'signal_error', { reason }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export async function handleSignal(client: RoomClient, message: unknown): Promise<void> {
  const { type, payload } = asRecord(message);
  const data = asRecord(payload);

  switch (type) {
    case 'vote_create': {
      if (!client.canManage) return fail(client, 'ไม่มีสิทธิ์สร้างโหวต');
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      const rawOptions = Array.isArray(data.options) ? data.options : [];
      const options = rawOptions
        .map((o) => asRecord(o))
        .filter((o) => typeof o.id === 'string' && typeof o.label === 'string')
        .map((o) => ({ id: o.id as string, label: o.label as string }));

      if (!title || options.length < 1) return fail(client, 'หัวข้อและตัวเลือกไม่ครบ');

      const topic = await votes.createTopic({
        id: `vote-${Date.now()}-${randomUUID().slice(0, 8)}`,
        meetingId: client.meetingId,
        title,
        ...(typeof data.description === 'string' && data.description ? { description: data.description } : {}),
        options,
        createdBy: client.userId,
        createdByName: client.userName,
      });

      return broadcast(client.meetingId, envelope(client, 'vote_state', { topic }));
    }

    case 'vote_cast': {
      const topicId = typeof data.topicId === 'string' ? data.topicId : '';
      const optionId = typeof data.optionId === 'string' ? data.optionId : '';
      if (!topicId || !optionId) return fail(client, 'ข้อมูลโหวตไม่ครบ');
      // หัวข้อต้องเป็นของห้องที่ socket นี้ต่ออยู่ ไม่งั้นคนจากห้องอื่นที่รู้ topicId ลงคะแนนข้ามห้องได้
      const target = await votes.getTopic(topicId);
      if (!target || target.meetingId !== client.meetingId) return fail(client, 'ไม่พบหัวข้อโหวตนี้');

      const topic = await votes.castVote(topicId, client.userId, client.userName, optionId);
      if (!topic) return fail(client, 'โหวตไม่สำเร็จ — หัวข้อปิดแล้วหรือไม่มีตัวเลือกนี้');

      return broadcast(client.meetingId, envelope(client, 'vote_state', { topic }));
    }

    case 'vote_close': {
      const topicId = typeof data.topicId === 'string' ? data.topicId : '';
      if (!topicId) return fail(client, 'ไม่ระบุหัวข้อ');

      const existing = await votes.getTopic(topicId);
      if (!existing || existing.meetingId !== client.meetingId) return fail(client, 'ไม่พบหัวข้อโหวตนี้');
      if (existing.createdBy !== client.userId && !client.canManage) {
        return fail(client, 'ไม่มีสิทธิ์ปิดโหวตนี้');
      }

      const topic = await votes.closeTopic(topicId);
      return broadcast(client.meetingId, envelope(client, 'vote_state', { topic }));
    }

    case 'hand_raise': {
      // lastAction บอกว่า "มือของใคร" เปลี่ยน และ "ใครเป็นคนทำ" — ที่นี่ทั้งสองคือผู้ส่งเอง
      // (ยกมือ/ลดมือของตัวเอง) เพื่อให้ frontend แยกออกจาก echo ที่มาช้าได้
      if (data.raised === true) await hands.raiseHand(client.meetingId, client.userId, client.userName);
      else await hands.lowerHand(client.meetingId, client.userId);

      const raised = await hands.listRaised(client.meetingId);
      return broadcast(
        client.meetingId,
        envelope(client, 'hand_state', {
          raised,
          lastAction: { userId: client.userId, byUserId: client.userId },
        })
      );
    }

    case 'hand_lower': {
      // ประธาน/เลขาเอามือคนอื่นลงได้ คนทั่วไปลงได้เฉพาะของตัวเอง
      const targetUserId = typeof data.targetUserId === 'string' ? data.targetUserId : '';
      if (!targetUserId) return fail(client, 'ไม่ระบุผู้ใช้');
      if (targetUserId !== client.userId && !client.canManage) {
        return fail(client, 'ไม่มีสิทธิ์เอามือผู้อื่นลง');
      }

      await hands.lowerHand(client.meetingId, targetUserId);
      const raised = await hands.listRaised(client.meetingId);
      // lastAction: userId คือมือของใครที่ถูกลด, byUserId คือผู้ส่งที่ยืนยันตัวตนผ่าน JWT เสมอ
      return broadcast(
        client.meetingId,
        envelope(client, 'hand_state', {
          raised,
          lastAction: { userId: targetUserId, byUserId: client.userId },
        })
      );
    }

    case 'doc_share': {
      const fileId = typeof data.fileId === 'string' ? data.fileId : '';
      const fileName = typeof data.fileName === 'string' ? data.fileName : '';
      if (!fileId || !fileName) return fail(client, 'ข้อมูลไฟล์ไม่ครบ');

      // กติกาความเป็นเจ้าของเดียวกันกับ doc_share_page/doc_share_stop ด้านล่าง: ไม่มีคนแชร์อยู่ —
      // ใครก็เริ่มแชร์ได้, มีคนแชร์อยู่แล้วแต่เป็นตัวเอง — เปลี่ยนไฟล์ได้ (ไปเอกสารถัดไป),
      // มีคนอื่นแชร์อยู่ — เริ่มแชร์ทับไม่ได้เว้นแต่เป็น manager ห้ามแยกกฎนี้ออกจากกันอีก
      const current = await docShare.getShare(client.meetingId);
      if (current && current.sharedBy !== client.userId && !client.canManage) {
        return fail(client, `ไม่มีสิทธิ์เริ่มแชร์ทับ — ${current.sharedName} กำลังแชร์เอกสารอยู่`);
      }

      await docShare.setShare(client.meetingId, {
        fileId,
        fileName,
        sharedBy: client.userId,
        sharedName: client.userName,
        page: 1,
      });
      const share = await docShare.getShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share }));
    }

    case 'doc_share_page': {
      const page = typeof data.page === 'number' ? data.page : 0;
      if (page < 1) return fail(client, 'เลขหน้าไม่ถูกต้อง');

      const current = await docShare.getShare(client.meetingId);
      if (!current) return fail(client, 'ยังไม่มีเอกสารที่แชร์อยู่');
      if (current.sharedBy !== client.userId && !client.canManage) {
        return fail(client, 'ไม่มีสิทธิ์เปลี่ยนหน้าเอกสารของผู้อื่น');
      }

      await docShare.setPage(client.meetingId, page);
      const share = await docShare.getShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share }));
    }

    case 'doc_share_stop': {
      const current = await docShare.getShare(client.meetingId);
      if (!current) return;
      if (current.sharedBy !== client.userId && !client.canManage) {
        return fail(client, 'ไม่มีสิทธิ์หยุดแชร์ของผู้อื่น');
      }

      await docShare.clearShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share: null }));
    }

    case 'chat_send': {
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text) return;
      if (text.length > MAX_CHAT_LENGTH) return fail(client, `ข้อความยาวเกิน ${MAX_CHAT_LENGTH} ตัวอักษร`);

      // ผู้ส่งและเวลามาจาก server — client ปลอมชื่อหรือย้อนเวลาข้อความไม่ได้
      const message = {
        id: `msg-${Date.now()}-${randomUUID().slice(0, 8)}`,
        senderId: client.userId,
        sender: client.userName,
        text,
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }),
      };
      await appendChatMessage(client.meetingId, message);
      return broadcast(client.meetingId, envelope(client, 'chat_message', { message }));
    }

    // ผู้จัดเปลี่ยนวาระที่กำลังพูดหรือจบการประชุมผ่าน REST แล้ว ขอให้ server ประกาศสถานะล่าสุดจาก DB
    // ใครส่งก็ได้ เพราะ server อ่านของจริงเอง ไม่เชื่อค่าใน payload
    case 'meeting_refresh':
      return broadcastRoomState(client.meetingId);

    // subtitle_text ไม่รับจาก client อีกแล้ว — คำบรรยายมาจาก ASR ฝั่ง server (audio.ts) เท่านั้น
    // ถ้ารับไว้ ใครในห้องก็พิมพ์ "มติ" ปลอมลง transcript ที่ใช้ทำร่างรายงานได้
    default:
      // สัญญาณที่ไม่รู้จัก — ปล่อยผ่าน ไม่ปิด socket เพื่อให้ deploy คนละเวอร์ชันอยู่ร่วมกันได้
      return;
  }
}

/**
 * ประกาศสถานะห้องจาก DB + คนที่ต่ออยู่จริงให้ทุกคน — เรียกตอนมีคนเข้า/ออก และเมื่อผู้จัดขอ refresh
 * รายชื่อ "ในสาย" มาจาก socket ที่ต่ออยู่ ไม่ต้องให้ผู้เข้าร่วมเขียน present ลงการประชุมเอง (ซึ่งโดน 403)
 */
export async function broadcastRoomState(meetingId: string): Promise<void> {
  // คนสุดท้ายออกแล้วไม่มีใครให้แจ้ง — ไม่ต้อง query DB
  if (clientsIn(meetingId).length === 0) return;
  const meeting = await getMeeting(meetingId);
  if (!meeting) return;
  const connectedUserIds = Array.from(new Set(clientsIn(meetingId).map((c) => c.userId)));
  broadcast(meetingId, {
    type: 'room_state',
    senderId: 'server',
    senderName: 'server',
    timestamp: Date.now(),
    payload: {
      status: meeting.status ?? null,
      activeAgendaId: (meeting.activeAgendaId as string | null | undefined) ?? null,
      connectedUserIds,
    },
  });
}
