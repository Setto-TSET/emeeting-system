// ═══════════════════════════════════════════
// Routes — การประชุมและไฟล์เอกสาร
//
// สิทธิ์ทุกข้อตัดสินที่นี่จาก JWT + ข้อมูลใน DB เท่านั้น
// ไม่เชื่อ payload ที่ client ส่งมาว่าตัวเองเป็นใครหรือมีสิทธิ์อะไร
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware, asyncHandler } from '../middleware';
import {
  getMeeting,
  listMeetingsForUser,
  saveMeeting,
  deleteMeeting,
  appendAgendaComment,
  appendConfidentialityAck,
  MeetingPayload,
} from '../repositories/meetings';
import * as files from '../repositories/meetingFiles';
import {
  canCreateMeeting,
  canEditMeeting,
  canViewFile,
  canViewMeeting,
  findFileEntry,
  Actor,
  actorFrom,
} from '../services/meetingAccess';

const router = Router();

router.use(authMiddleware);

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function actorOf(req: Request): Actor {
  return actorFrom(req.user!);
}

/**
 * ลิงก์เชิญบุคคลภายนอก (guestLinkToken) เห็นได้เฉพาะคนที่จัดการการประชุมได้
 * ผู้เข้าร่วมทั่วไปและแขกไม่ต้องรู้ — ไม่งั้นลิงก์หลุดต่อออกไปได้โดยผู้จัดไม่รู้ตัว
 */
function viewFor(actor: Actor, meeting: MeetingPayload): MeetingPayload {
  if (canEditMeeting(actor, meeting)) return meeting;
  // รายชื่อผู้ยอมรับข้อตกลงรักษาความลับก็เป็นข้อมูลของผู้จัด — ผู้เข้าร่วมและแขกไม่ต้องเห็นของกันและกัน
  const { guestLinkToken: _token, confidentialityAcks: _acks, ...rest } = meeting;
  void _token;
  void _acks;
  return rest as MeetingPayload;
}

/** โหลดการประชุมพร้อมเช็คสิทธิ์ดู — คืน null แล้วตอบไปแล้วถ้าไม่ผ่าน */
async function loadViewable(req: Request, res: Response): Promise<MeetingPayload | null> {
  const meeting = await getMeeting(req.params.id);
  if (!meeting) {
    res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    return null;
  }
  if (!canViewMeeting(actorOf(req), meeting)) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงการประชุมนี้' });
    return null;
  }
  return meeting;
}

/** GET /api/meetings — เฉพาะที่ผู้ใช้คนนี้เห็นได้ */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = actorOf(req);
    const meetings = await listMeetingsForUser(actor);
    res.json({ meetings: meetings.map((m) => viewFor(actor, m)) });
  })
);

/** GET /api/meetings/:id */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadViewable(req, res);
    if (meeting) res.json({ meeting: viewFor(actorOf(req), meeting) });
  })
);

/** POST /api/meetings — สร้างใหม่ ผู้สร้างเป็นผู้จัดเสมอ */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = actorOf(req);
    if (!canCreateMeeting(actor)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์สร้างการประชุม' });
    }

    const payload = req.body?.meeting as MeetingPayload | undefined;
    if (!payload || typeof payload.id !== 'string' || !payload.id) {
      return res.status(400).json({ error: 'ข้อมูลการประชุมไม่ครบ' });
    }
    if (await getMeeting(payload.id)) {
      return res.status(409).json({ error: 'มีการประชุมรหัสนี้อยู่แล้ว' });
    }

    // ผู้จัดมาจาก token ไม่ใช่จาก body — กันคนสร้างประชุมสวมชื่อคนอื่นเป็นเจ้าของ
    // ลิงก์เชิญออกโดย server เท่านั้น (POST /guest-link) — ถ้ารับจาก body จะตั้งลิงก์ที่เดาได้
    const { guestLinkToken: _ignored, confidentialityAcks: _ignoredAcks, ...input } = payload;
    void _ignored;
    void _ignoredAcks;
    const saved = await saveMeeting({ ...input, id: payload.id, organizerId: actor.id });
    res.status(201).json({ meeting: saved });
  })
);

/** PUT /api/meetings/:id — แก้ทั้งก้อน */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await getMeeting(req.params.id);
    if (!existing) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    if (!canEditMeeting(actorOf(req), existing)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขการประชุมนี้' });
    }

    const payload = req.body?.meeting as MeetingPayload | undefined;
    if (!payload) return res.status(400).json({ error: 'ข้อมูลการประชุมไม่ครบ' });

    // id กับผู้จัดยึดของเดิม — เปลี่ยนเจ้าของผ่าน PUT ไม่ได้
    // แชทเป็นของ server (เขียนผ่าน WebSocket) — ก้อนที่หน้าเว็บส่งมาอาจเก่ากว่า ถ้ารับไว้ข้อความที่เพิ่งส่งจะหาย
    const saved = await saveMeeting({
      ...payload,
      id: req.params.id,
      organizerId: existing.organizerId ?? null,
      chatMessages: existing.chatMessages ?? [],
      // ลิงก์เชิญเปลี่ยนได้ทาง POST /guest-link เท่านั้น — ก้อนจากหน้าเว็บอาจเก่าหรือไม่มีค่านี้
      guestLinkToken: existing.guestLinkToken,
      // หลักฐานการยอมรับข้อตกลงรักษาความลับ — server เขียนเท่านั้น ห้ามให้ PUT ลบหรือแก้ย้อนหลัง
      confidentialityAcks: existing.confidentialityAcks ?? [],
    });
    res.json({ meeting: saved });
  })
);

/** DELETE /api/meetings/:id — ลบทั้งการประชุม เฉพาะผู้จัด/ผู้จัดการประชุม (หรือ admin) */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await getMeeting(req.params.id);
    if (!existing) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    if (!canEditMeeting(actorOf(req), existing)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบการประชุมนี้' });
    }
    await deleteMeeting(req.params.id);
    res.status(204).end();
  })
);

/**
 * POST /api/meetings/:id/agenda/:agendaId/comments — แสดงความคิดเห็นในวาระ
 * ผู้เข้าร่วมทั่วไปแก้ทั้งการประชุมไม่ได้ (PUT ต้องเป็นผู้จัดการ) เดิมความคิดเห็นจึงโดน 403 แล้วหายเงียบ
 */
router.post(
  '/:id/agenda/:agendaId/comments',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadViewable(req, res);
    if (!meeting) return;

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'กรุณาพิมพ์ความคิดเห็น' });
    if (text.length > 2000) return res.status(400).json({ error: 'ความคิดเห็นยาวเกิน 2,000 ตัวอักษร' });

    const comment = {
      by: req.user!.name,
      byId: req.user!.id,
      text,
      time: new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }),
    };
    if (!(await appendAgendaComment(meeting.id, req.params.agendaId, comment))) {
      return res.status(404).json({ error: 'ไม่พบวาระนี้' });
    }
    res.status(201).json({ comment });
  })
);

/**
 * POST /api/meetings/:id/confidentiality-ack — ยอมรับข้อตกลงรักษาความลับก่อนเข้าห้องประชุม
 * ทุกคนที่เข้าห้องได้ (รวมแขกจากลิงก์เชิญ) ต้องกดยอมรับ ชื่อและเวลามาจาก token และนาฬิกาของ server
 */
router.post(
  '/:id/confidentiality-ack',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadViewable(req, res);
    if (!meeting) return;
    if (req.body?.accepted !== true) return res.status(400).json({ error: 'ต้องยอมรับข้อตกลงก่อนเข้าห้องประชุม' });

    const ack = { userId: req.user!.id, name: req.user!.name, at: Date.now() };
    await appendConfidentialityAck(meeting.id, ack);
    res.status(201).json({ ack });
  })
);

// ───────── ไฟล์เอกสาร ─────────

/** GET /api/meetings/:id/files — metadata เฉพาะไฟล์ที่ผู้ใช้เห็นได้ */
router.get(
  '/:id/files',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadViewable(req, res);
    if (!meeting) return;

    const actor = actorOf(req);
    const all = await files.listFiles(meeting.id);
    const visible = all.filter((f) => canViewFile(actor, meeting, findFileEntry(meeting, f.id)));
    res.json({ files: visible });
  })
);

/**
 * POST /api/meetings/:id/files — อัปโหลดเป็น base64 ใน JSON
 * ponytail: base64 บวม 33% แลกกับไม่ต้องเพิ่ม multer — เปลี่ยนเป็น multipart ถ้าไฟล์ใหญ่กว่านี้
 */
router.post(
  '/:id/files',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await getMeeting(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    if (!canEditMeeting(actorOf(req), meeting)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์อัปโหลดไฟล์เข้าการประชุมนี้' });
    }

    const { name, mimeType, contentBase64, visibility } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'ไม่ระบุชื่อไฟล์' });
    }
    if (typeof contentBase64 !== 'string' || !contentBase64) {
      return res.status(400).json({ error: 'ไม่มีข้อมูลไฟล์' });
    }

    const content = Buffer.from(contentBase64, 'base64');
    if (content.length === 0) return res.status(400).json({ error: 'ไฟล์ว่าง' });
    if (content.length > MAX_FILE_BYTES) {
      return res.status(413).json({ error: 'ไฟล์ใหญ่เกิน 20MB' });
    }

    const meta = await files.putFile({
      id: `file-${Date.now()}-${randomUUID().slice(0, 8)}`,
      meetingId: meeting.id,
      name: name.trim(),
      mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'application/octet-stream',
      visibility: typeof visibility === 'string' && visibility ? visibility : 'participants',
      uploadedBy: req.user!.id,
      content,
    });

    res.status(201).json({ file: meta });
  })
);

/** GET /api/meetings/:id/files/:fileId — ตัวไฟล์จริง */
router.get(
  '/:id/files/:fileId',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadViewable(req, res);
    if (!meeting) return;

    const meta = await files.getFileMeta(req.params.fileId);
    if (!meta || meta.meetingId !== meeting.id) {
      return res.status(404).json({ error: 'ไม่พบไฟล์นี้' });
    }
    if (!canViewFile(actorOf(req), meeting, findFileEntry(meeting, meta.id))) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เปิดไฟล์นี้' });
    }

    const content = await files.getFileContent(meta.id);
    if (!content) return res.status(404).json({ error: 'ไม่พบไฟล์นี้' });

    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', String(content.length));
    // filename* รองรับชื่อไฟล์ภาษาไทย — filename เฉยๆ ต้องเป็น ASCII
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`
    );
    res.send(content);
  })
);

/** DELETE /api/meetings/:id/files/:fileId */
router.delete(
  '/:id/files/:fileId',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await getMeeting(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    if (!canEditMeeting(actorOf(req), meeting)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบไฟล์ของการประชุมนี้' });
    }

    const meta = await files.getFileMeta(req.params.fileId);
    if (!meta || meta.meetingId !== meeting.id) {
      return res.status(404).json({ error: 'ไม่พบไฟล์นี้' });
    }

    await files.deleteFile(meta.id);
    res.json({ ok: true });
  })
);

// ───────── เปิดไฟล์ด้วย id อย่างเดียว ─────────
//
// หน้าเว็บมีแต่ storageKey ตอนจะเปิดเอกสาร (คอมโพเนนต์ตัวอ่านไม่รู้ว่าไฟล์อยู่ประชุมไหน)
// เส้นทางนี้จึงหาการประชุมจากตัวไฟล์เอง แล้วเช็คสิทธิ์ชุดเดียวกับด้านบนทุกข้อ
export const filesRouter = Router();

filesRouter.use(authMiddleware);

filesRouter.get(
  '/:fileId',
  asyncHandler(async (req: Request, res: Response) => {
    const meta = await files.getFileMeta(req.params.fileId);
    if (!meta) return res.status(404).json({ error: 'ไม่พบไฟล์นี้' });

    const meeting = await getMeeting(meta.meetingId);
    if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมของไฟล์นี้' });

    const actor = actorOf(req);
    if (!canViewMeeting(actor, meeting)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงการประชุมนี้' });
    }
    if (!canViewFile(actor, meeting, findFileEntry(meeting, meta.id))) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เปิดไฟล์นี้' });
    }

    const content = await files.getFileContent(meta.id);
    if (!content) return res.status(404).json({ error: 'ไม่พบไฟล์นี้' });

    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', String(content.length));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`
    );
    res.send(content);
  })
);

export default router;
