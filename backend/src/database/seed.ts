// ═══════════════════════════════════════════
// Seed — ย้ายผู้ใช้/การประชุมจาก mock data ฝั่งหน้าเว็บเข้า MySQL
//
// ⚠️ รหัสผ่านตั้งต้นเป็นค่าเดียวกันทุกบัญชี ใช้เฉพาะตอนพัฒนา/สาธิต
//    ก่อนใช้งานจริงต้องบังคับเปลี่ยนรหัสผ่านทุกบัญชี
// ═══════════════════════════════════════════

import bcrypt from 'bcryptjs';
import { query, queryOne } from './connection';
import { users, meetings } from '../../../src/data/index';

export type SeedResult = { users: number; meetings: number; participants: number };

export async function seedFromMockData(defaultPassword: string): Promise<SeedResult> {
  const now = Date.now();
  let userCount = 0;

  for (const user of users) {
    const existing = await queryOne('SELECT id FROM app_users WHERE id = ?', [user.id]);
    if (existing) {
      userCount += 1;
      continue;
    }
    const hash = await bcrypt.hash(defaultPassword, 10);
    await query(
      `INSERT INTO app_users (id, name, position, department, email, system_role, room_id, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.position,
        user.department,
        user.email,
        user.systemRole,
        user.roomId ?? null,
        hash,
        now,
      ]
    );
    userCount += 1;
  }

  let meetingCount = 0;
  let participantCount = 0;

  for (const meeting of meetings) {
    // schema.sql กำหนด meetings.organizer_id เป็น NOT NULL แต่ type ฝั่งหน้าเว็บอนุญาต null ได้
    // (กรณียังไม่ระบุผู้จัด) — ข้ามการประชุมนั้นทั้งรายการแทนที่จะปล่อยให้ query ล้มกลางคัน
    // ไม่ใช้ throw เพราะการประชุมอื่นที่ข้อมูลถูกต้องควร seed ต่อได้ตามปกติ
    if (!meeting.organizerId) {
      console.warn(`⚠️ ข้าม meeting ${meeting.id} — ไม่มี organizerId (organizer_id เป็น NOT NULL)`);
      continue;
    }

    // หมายเหตุ: mock data ฝั่งหน้าเว็บใช้ฟิลด์ `name` ไม่ใช่ `title` — ตาราง meetings ใช้คอลัมน์ title
    await query(
      `INSERT INTO meetings (id, title, organizer_id, meeting_date, start_time, end_time, status, allow_guest_join)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), status = VALUES(status),
         allow_guest_join = VALUES(allow_guest_join)`,
      [
        meeting.id,
        meeting.name,
        meeting.organizerId,
        meeting.date,
        meeting.startTime,
        meeting.endTime,
        meeting.status,
        meeting.allowGuestJoin ? 1 : 0,
      ]
    );
    meetingCount += 1;

    for (const participant of meeting.participants) {
      if (!participant.userId) continue;
      await query(
        `INSERT INTO meeting_participants (meeting_id, user_id, role)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        [meeting.id, participant.userId, participant.role ?? 'participant']
      );
      participantCount += 1;
    }

    // ผู้จัดต้องเข้าห้องได้เสมอ แม้ไม่ได้อยู่ในรายชื่อผู้เข้าร่วม
    // (ถึงจุดนี้ meeting.organizerId การันตีว่าไม่ใช่ null แล้วจากการ guard ด้านบน)
    await query(
      `INSERT INTO meeting_participants (meeting_id, user_id, role)
       VALUES (?, ?, 'organizer')
       ON DUPLICATE KEY UPDATE role = 'organizer'`,
      [meeting.id, meeting.organizerId]
    );
  }

  return { users: userCount, meetings: meetingCount, participants: participantCount };
}

if (require.main === module) {
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    console.error('❌ SEED_PASSWORD is required');
    process.exit(1);
  }
  seedFromMockData(password)
    .then((result) => {
      console.log(`✅ Seeded ${result.users} users, ${result.meetings} meetings`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}
