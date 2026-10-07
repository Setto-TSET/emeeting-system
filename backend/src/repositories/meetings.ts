// ═══════════════════════════════════════════
// Meetings — ก้อนข้อมูลการประชุมเก็บเป็น JSON, ผู้เข้าร่วมแยกตาราง
//
// ทำไมแยก: WebSocket handshake และ authz ตัดสินสิทธิ์จาก meeting_participants
// การเขียนทั้งสองที่จึงต้องอยู่ในทรานแซกชันเดียวเสมอ ไม่งั้นรายชื่อสองที่จะเพี้ยนกัน
// ═══════════════════════════════════════════

import { query, queryOne, withTransaction } from '../database/connection';
import { Actor, canViewMeeting } from '../services/meetingAccess';

/** ผู้เข้าร่วมเท่าที่ backend ต้องรู้ — ฟิลด์ที่เหลืออยู่ใน payload */
export type MeetingParticipantInput = {
  userId: string;
  role?: string;
};

/** ก้อน Meeting ตามที่หน้าเว็บส่งมา — backend ไม่บังคับรูปร่างส่วนที่ไม่ได้ใช้ */
export type MeetingPayload = Record<string, unknown> & {
  id: string;
  name?: string;
  organizerId?: string | null;
  committeeId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  allowGuestJoin?: boolean;
  createdAt?: string;
  participants?: { userId?: string; id?: string; role?: string }[];
  permissions?: { userId: string; type: 'manager' | 'reader' }[];
};

type MeetingRow = {
  id: string;
  title: string;
  organizer_id: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  status: string;
  allow_guest_join: number;
  committee_id: string | null;
  created_at: number | null;
  payload: unknown;
};

export async function meetingExists(meetingId: string): Promise<boolean> {
  const row = await queryOne('SELECT id FROM meetings WHERE id = ?', [meetingId]);
  return Boolean(row);
}

/**
 * payload อาจกลับมาเป็น object (driver แปลง JSON ให้แล้ว) หรือสตริง แล้วแต่เวอร์ชัน mysql2
 * แถวเก่าที่ seed ไว้ก่อนมีคอลัมน์นี้จะเป็น null — ประกอบก้อนขั้นต่ำจากคอลัมน์แยกแทน
 */
function toMeeting(row: MeetingRow): MeetingPayload {
  if (row.payload) {
    const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    return parsed as MeetingPayload;
  }
  // ฟิลด์ที่เป็น array ต้องมีเสมอแม้จะว่าง — หน้าเว็บอ่าน .participants.length ตรงๆ
  // การคืน undefined ทำให้หน้ารายการประชุมพังทั้งหน้า
  return {
    id: row.id,
    name: row.title,
    organizerId: row.organizer_id,
    date: row.meeting_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    allowGuestJoin: Boolean(row.allow_guest_join),
    ...(row.committee_id ? { committeeId: row.committee_id } : {}),
    participants: [],
    files: [],
    agenda: [],
    permissions: [],
    secretGroups: [],
  };
}

/** ผู้เข้าร่วมใน payload ใช้ทั้ง userId และ id แล้วแต่ที่มา — รับทั้งสองแบบ */
function participantIds(payload: MeetingPayload): MeetingParticipantInput[] {
  const list = Array.isArray(payload.participants) ? payload.participants : [];
  const seen = new Set<string>();
  const out: MeetingParticipantInput[] = [];
  for (const p of list) {
    const userId = typeof p?.userId === 'string' ? p.userId : typeof p?.id === 'string' ? p.id : '';
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    out.push({ userId, ...(typeof p?.role === 'string' ? { role: p.role } : {}) });
  }
  return out;
}

export async function getMeeting(meetingId: string): Promise<MeetingPayload | null> {
  const row = (await queryOne('SELECT * FROM meetings WHERE id = ?', [meetingId])) as
    | MeetingRow
    | undefined;
  return row ? toMeeting(row) : null;
}

/**
 * รายการประชุมที่ผู้ใช้คนนี้มีสิทธิ์เห็น — ใช้กฎเดียวกับการเปิดดูทีละรายการ (canViewMeeting)
 *
 * เดิม query เองแค่ "ผู้จัดหรือผู้เข้าร่วม" ทำให้ผู้รับมอบสิทธิ์ ผู้บริหาร และจอหน้าห้อง
 * เปิดการประชุมทีละรายการได้ แต่ไม่เคยเห็นในรายการ — หน้าเว็บจึงขึ้นว่า "ไม่พบการประชุม"
 */
export async function listMeetingsForUser(actor: Actor): Promise<MeetingPayload[]> {
  // แขกเห็นเฉพาะการประชุมที่ token ผูกไว้
  if (actor.role === 'guest') {
    const meeting = actor.meetingId ? await getMeeting(actor.meetingId) : null;
    return meeting ? [meeting] : [];
  }
  // ponytail: อ่านทั้งตารางแล้วกรองในโค้ด พอสำหรับหน่วยงานเดียว ถ้าการประชุมเกินหลักหมื่นค่อยย้ายกฎไปเป็น SQL
  const rows = (await query('SELECT * FROM meetings ORDER BY meeting_date DESC')) as MeetingRow[];
  return rows.map(toMeeting).filter((m) => canViewMeeting(actor, m));
}

/**
 * หาการประชุมจากลิงก์เชิญบุคคลภายนอก — token เก็บใน payload.guestLinkToken
 * ponytail: ค้นจาก JSON ทั้งตาราง พอสำหรับหน่วยงานเดียว ถ้าการประชุมเกินหลักหมื่นค่อยแยกเป็นคอลัมน์ที่มี index
 */
export async function findMeetingByGuestToken(token: string): Promise<MeetingPayload | null> {
  if (!token) return null;
  const row = (await queryOne(
    "SELECT * FROM meetings WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.guestLinkToken')) = ? LIMIT 1",
    [token]
  )) as MeetingRow | undefined;
  return row ? toMeeting(row) : null;
}

/** ตั้งลิงก์เชิญใหม่ — ค่าเดิมถูกเขียนทับ ลิงก์เก่าจึงใช้ไม่ได้ทันที */
export async function setGuestLinkToken(meetingId: string, token: string): Promise<void> {
  await query("UPDATE meetings SET payload = JSON_SET(payload, '$.guestLinkToken', ?) WHERE id = ?", [token, meetingId]);
}

export type ChatMessage = { id: string; senderId: string; sender: string; text: string; time: string };

/**
 * ต่อท้ายข้อความแชทใน payload แบบ atomic ด้วย JSON_ARRAY_APPEND
 * ไม่อ่าน-แก้-เขียนทั้งก้อน — สองคนพิมพ์พร้อมกันข้อความต้องไม่หายไปข้างหนึ่ง
 */
export async function appendChatMessage(meetingId: string, message: ChatMessage): Promise<void> {
  await query(
    `UPDATE meetings
     SET payload = JSON_SET(payload, '$.chatMessages',
       JSON_ARRAY_APPEND(COALESCE(JSON_EXTRACT(payload, '$.chatMessages'), JSON_ARRAY()), '$', CAST(? AS JSON)))
     WHERE id = ?`,
    [JSON.stringify(message), meetingId]
  );
}

export type ConfidentialityAck = { userId: string; name: string; at: number };

/**
 * บันทึกว่าผู้ใช้กดยอมรับข้อตกลงรักษาความลับก่อนเข้าห้องประชุม — ต่อท้ายทุกครั้งที่เข้า (ไม่ทับของเดิม)
 * เป็นหลักฐานย้อนหลังว่าใครรับทราบเมื่อไร แบบ atomic เหมือนแชท
 */
export async function appendConfidentialityAck(meetingId: string, ack: ConfidentialityAck): Promise<void> {
  await query(
    `UPDATE meetings
     SET payload = JSON_SET(payload, '$.confidentialityAcks',
       JSON_ARRAY_APPEND(COALESCE(JSON_EXTRACT(payload, '$.confidentialityAcks'), JSON_ARRAY()), '$', CAST(? AS JSON)))
     WHERE id = ?`,
    [JSON.stringify(ack), meetingId]
  );
}

export type AgendaComment = { by: string; byId: string; text: string; time: string };

/** ต่อท้ายความคิดเห็นในวาระ — คืน false ถ้าไม่มีวาระนี้ */
export async function appendAgendaComment(
  meetingId: string,
  agendaId: string,
  comment: AgendaComment
): Promise<boolean> {
  const meeting = await getMeeting(meetingId);
  const agenda = Array.isArray(meeting?.agenda) ? (meeting!.agenda as { id?: string }[]) : [];
  const index = agenda.findIndex((a) => a?.id === agendaId);
  if (index < 0) return false;
  // ponytail: index มาจากการอ่านก่อนเขียน ถ้ามีคนลบ/สลับวาระในเสี้ยววินาทีเดียวกัน ความคิดเห็นจะไปผิดวาระ
  await query(
    `UPDATE meetings
     SET payload = JSON_SET(payload, '$.agenda[${index}].comments',
       JSON_ARRAY_APPEND(COALESCE(JSON_EXTRACT(payload, '$.agenda[${index}].comments'), JSON_ARRAY()), '$', CAST(? AS JSON)))
     WHERE id = ?`,
    [JSON.stringify(comment), meetingId]
  );
  return true;
}

/**
 * ฟิลด์ที่หน้าเว็บอ่านเป็น array ตรงๆ (เช่น m.participants.length) ต้องมีเสมอ
 * ผู้เรียก API อาจส่งไม่ครบ — เติมให้ตรงนี้ที่เดียว ไม่ปล่อยให้ทุกหน้าต้องกัน undefined เอง
 */
const ARRAY_FIELDS = ['participants', 'files', 'agenda', 'permissions', 'secretGroups'] as const;

function withArrayDefaults(payload: MeetingPayload): MeetingPayload {
  const filled: MeetingPayload = { ...payload };
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(filled[field])) filled[field] = [];
  }
  return filled;
}

/**
 * เติมข้อมูลผู้เข้าร่วมจากตาราง app_users ให้ครบก่อนเก็บ
 *
 * ผู้เรียก API ส่งมาแค่ userId ได้ (และควรส่งแค่นั้น — ชื่อ/ตำแหน่ง/อีเมลของจริงอยู่ที่ server)
 * แต่หน้าเว็บอ่าน p.name / p.position / p.email ตรงๆ หลายจุด ถ้าปล่อยว่างหน้ารายละเอียด
 * ประชุมจะพังทั้งหน้า เติมที่นี่จุดเดียวดีกว่าไล่ใส่ ?? "" ทุกจุดที่เรนเดอร์
 *
 * แขกภายนอก (userId = null) ไม่มีแถวใน app_users — ใช้ค่าที่ส่งมาตามเดิม
 */
async function withParticipantProfiles(payload: MeetingPayload): Promise<MeetingPayload> {
  const list = Array.isArray(payload.participants) ? payload.participants : [];
  const ids = list
    .map((p) => (typeof p?.userId === "string" ? p.userId : typeof p?.id === "string" ? p.id : ""))
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return payload;

  const rows = (await query(
    `SELECT id, name, position, department, email FROM app_users WHERE id IN (${ids
      .map(() => '?')
      .join(',')})`,
    ids
  )) as { id: string; name: string; position: string; department: string; email: string }[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const participants = list.map((p) => {
    const userId = typeof p?.userId === 'string' ? p.userId : typeof p?.id === 'string' ? p.id : '';
    const profile = byId.get(userId);
    if (!profile) return p;
    const current = p as Record<string, unknown>;
    return {
      // ค่าที่ผู้เรียกตั้งใจกำหนดเอง (เช่น position ในที่ประชุม = "ประธาน") ต้องชนะข้อมูลโปรไฟล์
      id: current.id ?? userId,
      userId,
      name: current.name || profile.name,
      position: current.position || profile.position,
      role: current.role || profile.position,
      department: current.department || profile.department,
      email: current.email || profile.email,
      inSystem: true,
      ...(current.attendance ? { attendance: current.attendance } : {}),
      ...(current.present !== undefined ? { present: current.present } : {}),
    };
  });

  return { ...payload, participants } as MeetingPayload;
}

/** เขียนก้อน meeting + ผู้เข้าร่วมพร้อมกัน ใช้ทั้งตอนสร้างและตอนแก้ */
export async function saveMeeting(input: MeetingPayload): Promise<MeetingPayload> {
  const payload = await withParticipantProfiles(withArrayDefaults(input));
  const participants = participantIds(payload);
  const createdAt = payload.createdAt ? Date.parse(payload.createdAt) || Date.now() : Date.now();

  await withTransaction(async (run) => {
    await run(
      `INSERT INTO meetings
         (id, title, organizer_id, meeting_date, start_time, end_time, status,
          allow_guest_join, committee_id, created_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), organizer_id = VALUES(organizer_id),
         meeting_date = VALUES(meeting_date), start_time = VALUES(start_time),
         end_time = VALUES(end_time), status = VALUES(status),
         allow_guest_join = VALUES(allow_guest_join), committee_id = VALUES(committee_id),
         payload = VALUES(payload)`,
      [
        payload.id,
        payload.name ?? '',
        payload.organizerId ?? '',
        payload.date ?? '',
        payload.startTime ?? '',
        payload.endTime ?? '',
        payload.status ?? 'draft',
        payload.allowGuestJoin ? 1 : 0,
        payload.committeeId ?? null,
        createdAt,
        JSON.stringify(payload),
      ]
    );

    // ลบแล้วใส่ใหม่ทั้งชุด — รายชื่อในตารางต้องสะท้อน payload ล่าสุดเป๊ะ
    // ถ้าค่อยๆ diff จะเหลือคนที่ถูกถอดชื่อออกแล้วค้างอยู่ในห้อง realtime
    await run('DELETE FROM meeting_participants WHERE meeting_id = ?', [payload.id]);
    for (const p of participants) {
      await run(
        'INSERT INTO meeting_participants (meeting_id, user_id, role) VALUES (?, ?, ?)',
        [payload.id, p.userId, p.role ?? 'participant']
      );
    }
  });

  const saved = await getMeeting(payload.id);
  if (!saved) throw new Error('บันทึกการประชุมไม่สำเร็จ');
  return saved;
}

/**
 * ลบการประชุมและทุกอย่างที่ผูกกับมัน — schema ไม่มี ON DELETE CASCADE จึงต้องกวาดเอง
 * ลูกก่อนแม่ในทรานแซกชันเดียว ไม่งั้นเหลือแถวกำพร้า (ไฟล์ BLOB กินโควตา, คำเชิญค้าง ฯลฯ)
 * vote_options / vote_records ผูกกับ topic_id จึงลบผ่าน subquery ของ vote_topics ห้องนี้
 */
export async function deleteMeeting(meetingId: string): Promise<boolean> {
  return withTransaction(async (run) => {
    const topicScope = 'topic_id IN (SELECT id FROM vote_topics WHERE meeting_id = ?)';
    await run(`DELETE FROM vote_records WHERE ${topicScope}`, [meetingId]);
    await run(`DELETE FROM vote_options WHERE ${topicScope}`, [meetingId]);
    for (const table of [
      'vote_topics',
      'hand_raises',
      'transcript_segments',
      'doc_shares',
      'meeting_files',
      'meeting_participants',
    ]) {
      await run(`DELETE FROM ${table} WHERE meeting_id = ?`, [meetingId]);
    }
    const res = (await run('DELETE FROM meetings WHERE id = ?', [meetingId])) as {
      affectedRows?: number;
    };
    return (res.affectedRows ?? 0) > 0;
  });
}
