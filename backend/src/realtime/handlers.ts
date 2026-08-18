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
import * as transcript from '../repositories/transcript';
import * as docShare from '../repositories/docShare';

const MANAGER_ROLES = new Set(['admin', 'secretary', 'executive']);

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
      if (!MANAGER_ROLES.has(client.role)) return fail(client, 'ไม่มีสิทธิ์สร้างโหวต');
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

      const topic = await votes.castVote(topicId, client.userId, client.userName, optionId);
      if (!topic) return fail(client, 'โหวตไม่สำเร็จ — หัวข้อปิดแล้วหรือไม่มีตัวเลือกนี้');

      return broadcast(client.meetingId, envelope(client, 'vote_state', { topic }));
    }

    case 'vote_close': {
      const topicId = typeof data.topicId === 'string' ? data.topicId : '';
      if (!topicId) return fail(client, 'ไม่ระบุหัวข้อ');

      const existing = await votes.getTopic(topicId);
      if (!existing) return fail(client, 'ไม่พบหัวข้อโหวตนี้');
      if (existing.createdBy !== client.userId && !MANAGER_ROLES.has(client.role)) {
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
      if (targetUserId !== client.userId && !MANAGER_ROLES.has(client.role)) {
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

    case 'subtitle_text': {
      const text = typeof data.text === 'string' ? data.text : '';
      const isFinal = data.isFinal === true;
      const lang = typeof data.lang === 'string' ? data.lang : 'th-TH';
      if (!text) return;

      // ข้อความระหว่างพูดกระจายอย่างเดียว ไม่บันทึก — บันทึกเฉพาะประโยคที่จบแล้ว
      if (isFinal) {
        await transcript.appendSegment(client.meetingId, {
          speakerId: client.userId,
          speakerName: client.userName,
          startSec: typeof data.startSec === 'number' ? data.startSec : 0,
          text,
        });
      }

      return broadcast(client.meetingId, envelope(client, 'subtitle_text', { text, isFinal, lang }), client.userId);
    }

    case 'doc_share': {
      const fileId = typeof data.fileId === 'string' ? data.fileId : '';
      const fileName = typeof data.fileName === 'string' ? data.fileName : '';
      if (!fileId || !fileName) return fail(client, 'ข้อมูลไฟล์ไม่ครบ');

      // กติกาความเป็นเจ้าของเดียวกันกับ doc_share_page/doc_share_stop ด้านล่าง: ไม่มีคนแชร์อยู่ —
      // ใครก็เริ่มแชร์ได้, มีคนแชร์อยู่แล้วแต่เป็นตัวเอง — เปลี่ยนไฟล์ได้ (ไปเอกสารถัดไป),
      // มีคนอื่นแชร์อยู่ — เริ่มแชร์ทับไม่ได้เว้นแต่เป็น manager ห้ามแยกกฎนี้ออกจากกันอีก
      const current = await docShare.getShare(client.meetingId);
      if (current && current.sharedBy !== client.userId && !MANAGER_ROLES.has(client.role)) {
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
      if (current.sharedBy !== client.userId && !MANAGER_ROLES.has(client.role)) {
        return fail(client, 'ไม่มีสิทธิ์เปลี่ยนหน้าเอกสารของผู้อื่น');
      }

      await docShare.setPage(client.meetingId, page);
      const share = await docShare.getShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share }));
    }

    case 'doc_share_stop': {
      const current = await docShare.getShare(client.meetingId);
      if (!current) return;
      if (current.sharedBy !== client.userId && !MANAGER_ROLES.has(client.role)) {
        return fail(client, 'ไม่มีสิทธิ์หยุดแชร์ของผู้อื่น');
      }

      await docShare.clearShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share: null }));
    }

    default:
      // สัญญาณที่ไม่รู้จัก — ปล่อยผ่าน ไม่ปิด socket เพื่อให้ deploy คนละเวอร์ชันอยู่ร่วมกันได้
      return;
  }
}
