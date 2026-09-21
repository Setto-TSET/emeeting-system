// Reset ALL users' password to $SEED_PASSWORD. Demo/dev only.
// seed.ts skips users that already exist by id and never touches the password,
// so this is how you rotate every seeded account to a known password.
import bcrypt from 'bcryptjs';
import { query } from './connection';

async function main() {
  const pw = process.env.SEED_PASSWORD;
  if (!pw) throw new Error('SEED_PASSWORD not set');
  const hash = await bcrypt.hash(pw, 10);
  const res: any = await query('UPDATE app_users SET password_hash = ?', [hash]);
  console.log(`✅ reset password for ${res.affectedRows} users`);
  process.exit(0);
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
