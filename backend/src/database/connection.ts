// ═══════════════════════════════════════════
// Database Connection — MySQL
// ═══════════════════════════════════════════

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// connectTimeout ต้องมีเสมอ: ค่าดีฟอลต์ของ mysql2 คือรอได้ไม่จำกัด
// ถ้า host ปลายทางไม่ตอบ (firewall, URL ผิด, SSL ไม่ตรง) getConnection() จะค้างตลอดกาล
// โดยไม่มี error ออกมาเลย — บน host จริงแปลว่า process เงียบจนคน debug ไม่ได้
const CONNECT_TIMEOUT_MS = 15_000;

const pool = process.env.DATABASE_URL
  ? mysql.createPool({ uri: process.env.DATABASE_URL, connectTimeout: CONNECT_TIMEOUT_MS })
  : mysql.createPool({
      connectTimeout: CONNECT_TIMEOUT_MS,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'emeeting_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

export async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

export async function query(sql: string, values?: any[]) {
  const connection = await pool.getConnection();
  try {
    const [results] = await connection.execute(sql, values);
    return results;
  } finally {
    connection.release();
  }
}

export async function queryOne(sql: string, values?: any[]) {
  const results = await query(sql, values);
  return (results as any[])[0];
}

/**
 * รันหลายคำสั่งบน connection เดียวแบบ all-or-nothing
 * ใช้ตอนเขียน meetings + meeting_participants ที่ต้องตรงกันเสมอ —
 * ถ้าเขียนตารางหนึ่งสำเร็จอีกตารางพัง WebSocket จะเห็นรายชื่อไม่ตรงกับหน้าเว็บ
 */
export async function withTransaction<T>(
  fn: (run: (sql: string, values?: any[]) => Promise<any>) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const run = async (sql: string, values?: any[]) => {
      const [results] = await connection.execute(sql, values);
      return results;
    };
    const result = await fn(run);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function close() {
  await pool.end();
}

export default pool;
