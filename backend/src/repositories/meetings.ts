// ═══════════════════════════════════════════
// Meetings — ก้อนข้อมูลการประชุมเก็บเป็น JSON, ผู้เข้าร่วมแยกตาราง
//
// ทำไมแยก: WebSocket handshake และ authz ตัดสินสิทธิ์จาก meeting_participants
// การเขียนทั้งสองที่จึงต้องอยู่ในทรานแซกชันเดียวเสมอ ไม่งั้นรายชื่อสองที่จะเพี้ยนกัน
// ═══════════════════════════════════════════

import { query, queryOne, withTransaction } from '../database/connection';

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

/** admin เข้าได้ทุกห้องอยู่แล้ว — ตรงกับ can() ฝั่งหน้าเว็บ */
export async function isMeetingMember(meetingId: string, userId: string): Promise<boolean> {
  const row = await queryOne(
    'SELECT user_id FROM meeting_participants WHERE meeting_id = ? AND user_id = ?',
    [meetingId, userId]
  );
  return Boolean(row);
}

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
 * รายการประชุมที่ผู้ใช้คนนี้มีสิทธิ์เห็น
 * admin เห็นทั้งหมด คนอื่นเห็นเฉพาะที่ตัวเองเป็นผู้จัดหรือถูกใส่ชื่อไว้
 * (สิทธิ์รายชิ้นที่ละเอียดกว่านี้ตัดสินอีกทีที่ route ด้วย authz)
 */
export async function listMeetingsForUser(
  userId: string,
  role: string,
  guestMeetingId?: string
): Promise<MeetingPayload[]> {
  // แขกเห็นเฉพาะการประชุมที่ token ผูกไว้ — ไม่มีแถวใน meeting_participants ให้ JOIN
  if (role === 'guest') {
    if (!guestMeetingId) return [];
    const rows = (await query('SELECT * FROM meetings WHERE id = ?', [guestMeetingId])) as MeetingRow[];
    return rows.map(toMeeting);
  }

  const rows =
    role === 'admin'
      ? ((await query('SELECT * FROM meetings ORDER BY meeting_date DESC')) as MeetingRow[])
      : ((await query(
          `SELECT m.* FROM meetings m
           LEFT JOIN meeting_participants p ON p.meeting_id = m.id AND p.user_id = ?
           WHERE m.organizer_id = ? OR p.user_id IS NOT NULL
           ORDER BY m.meeting_date DESC`,
          [userId, userId]
        )) as MeetingRow[]);

  return rows.map(toMeeting);
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
