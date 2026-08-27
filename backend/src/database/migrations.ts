// ═══════════════════════════════════════════
// Migrations — รัน schema.sql ทีละคำสั่ง
// ทุกคำสั่งเป็น CREATE TABLE IF NOT EXISTS จึงรันซ้ำได้ปลอดภัย
// ═══════════════════════════════════════════

import { readFileSync } from 'fs';
import { join } from 'path';
import { query, queryOne, close } from './connection';

/**
 * คอลัมน์ที่เพิ่มทีหลัง — ฐานข้อมูลที่สร้างไว้ก่อนหน้าไม่มี และ MySQL ไม่รองรับ
 * `ADD COLUMN IF NOT EXISTS` จึงต้องเช็ค information_schema เองก่อน ALTER
 * ไม่งั้น migrate รอบสองจะพังด้วย ER_DUP_FIELDNAME
 */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: 'meetings', column: 'committee_id', definition: 'VARCHAR(64) NULL' },
  { table: 'meetings', column: 'created_at', definition: 'BIGINT NULL' },
  { table: 'meetings', column: 'payload', definition: 'JSON NULL' },
];

async function ensureColumns(): Promise<void> {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const existing = await queryOne(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [table, column]
    );
    if (existing) continue;
    await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => {
      // ตัดคอมเมนต์ทิ้งก่อนเช็คว่าเหลือคำสั่ง SQL จริงหรือไม่
      // (ไม่ใช้ startsWith('--') เพราะบางคำสั่งมีคอมเมนต์นำหน้า CREATE TABLE)
      const withoutComments = s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      return withoutComments.length > 0;
    });

  for (const statement of statements) {
    await query(statement);
  }

  await ensureColumns();
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('✅ Migrations complete');
      return close();
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
