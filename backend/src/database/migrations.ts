// ═══════════════════════════════════════════
// Database Migrations
// ═══════════════════════════════════════════
// Run: npm run migrate

import { query } from './connection';

async function runMigrations() {
  try {
    console.log('🚀 Running migrations...');

    // ─── Table: transcriptions ───
    // NOTE: ไม่มีตาราง room mapping แยกแล้ว — ZegoCloud token ออกจาก Next.js API route
    // แบบ stateless (roomKey มาจาก meeting.conferenceRoomKey ตรงๆ ไม่ต้อง persist)
    await query(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        meeting_id VARCHAR(50) UNIQUE NOT NULL,
        transcript_status ENUM('none', 'processing', 'ready', 'failed') DEFAULT 'none',
        segments JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_meeting_id (meeting_id),
        INDEX idx_status (transcript_status)
      );
    `);
    console.log('✅ transcriptions table created');

    // ─── Table: summaries ───
    await query(`
      CREATE TABLE IF NOT EXISTS summaries (
        id INT PRIMARY KEY AUTO_INCREMENT,
        meeting_id VARCHAR(50) UNIQUE NOT NULL,
        summary_json JSON,
        is_draft BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_meeting_id (meeting_id),
        INDEX idx_is_draft (is_draft)
      );
    `);
    console.log('✅ summaries table created');

    // ─── Table: audit_logs (ทำจริงเมื่อต้อง) ───
    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id VARCHAR(50),
        action VARCHAR(100),
        meeting_id VARCHAR(50),
        resource VARCHAR(100),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_meeting_id (meeting_id),
        INDEX idx_created_at (created_at)
      );
    `);
    console.log('✅ audit_logs table created');

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations().then(() => process.exit(0));
}

export { runMigrations };
