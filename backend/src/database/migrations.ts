// ═══════════════════════════════════════════
// Migrations — รัน schema.sql ทีละคำสั่ง
// ทุกคำสั่งเป็น CREATE TABLE IF NOT EXISTS จึงรันซ้ำได้ปลอดภัย
// ═══════════════════════════════════════════

import { readFileSync } from 'fs';
import { join } from 'path';
import { query, close } from './connection';

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
