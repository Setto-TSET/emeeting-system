-- ผู้ใช้ระบบ — รหัสผ่านเก็บเป็น bcrypt hash เท่านั้น ห้ามเก็บ plaintext
CREATE TABLE IF NOT EXISTS app_users (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  position      VARCHAR(255) NOT NULL DEFAULT '',
  department    VARCHAR(255) NOT NULL DEFAULT '',
  email         VARCHAR(255) NOT NULL UNIQUE,
  system_role   VARCHAR(32)  NOT NULL,
  room_id       VARCHAR(64)  NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- การประชุม — id เป็นสตริงของระบบเดิม เช่น MT-2569-007
CREATE TABLE IF NOT EXISTS meetings (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  title         VARCHAR(512) NOT NULL,
  organizer_id  VARCHAR(64)  NOT NULL,
  meeting_date  VARCHAR(16)  NOT NULL,
  start_time    VARCHAR(8)   NOT NULL,
  end_time      VARCHAR(8)   NOT NULL,
  status        VARCHAR(32)  NOT NULL,
  allow_guest_join TINYINT(1) NOT NULL DEFAULT 0,
  committee_id  VARCHAR(64)  NULL,
  created_at    BIGINT       NULL,
  -- ฟิลด์ที่เหลือของ Meeting (วาระ ไฟล์ กลุ่มลับ สิทธิ์ ฯลฯ) เก็บทั้งก้อนตรงนี้
  -- คอลัมน์ข้างบนมีไว้ query/เรียงเท่านั้น ค่าต้องตรงกับใน payload เสมอ
  payload       JSON         NULL,
  INDEX idx_meetings_organizer (organizer_id),
  INDEX idx_meetings_date (meeting_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ไฟล์เอกสารประกอบการประชุม — เก็บตัวไฟล์ไว้ในฐานข้อมูลเพื่อให้ deploy เป็น container เดียวจบ
-- ponytail: LONGBLOB ใน MySQL, ย้ายไป object storage เมื่อไฟล์รวมเกิน ~1GB
CREATE TABLE IF NOT EXISTS meeting_files (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  meeting_id  VARCHAR(64)  NOT NULL,
  name        VARCHAR(512) NOT NULL,
  mime_type   VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
  size_bytes  BIGINT       NOT NULL,
  visibility  VARCHAR(32)  NOT NULL DEFAULT 'all',
  uploaded_by VARCHAR(64)  NOT NULL,
  uploaded_at BIGINT       NOT NULL,
  content     LONGBLOB     NOT NULL,
  INDEX idx_meeting_files_meeting (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใครเข้าประชุมไหนได้ — WebSocket ใช้ตารางนี้ตัดสินตอนต่อห้อง
CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id VARCHAR(64) NOT NULL,
  user_id    VARCHAR(64) NOT NULL,
  role       VARCHAR(32) NOT NULL DEFAULT 'participant',
  PRIMARY KEY (meeting_id, user_id),
  INDEX idx_participants_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vote_topics (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  meeting_id      VARCHAR(64)  NOT NULL,
  title           VARCHAR(512) NOT NULL,
  description     TEXT         NULL,
  created_by      VARCHAR(64)  NOT NULL,
  created_by_name VARCHAR(255) NOT NULL,
  created_at      BIGINT       NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'open',
  INDEX idx_vote_topics_meeting (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vote_options (
  id         VARCHAR(64)  NOT NULL,
  topic_id   VARCHAR(64)  NOT NULL,
  label      VARCHAR(512) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (topic_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- กฎ "1 คน 1 เสียง" บังคับด้วย PRIMARY KEY — ไม่ใช่ด้วยโค้ดฝั่ง client เหมือนเดิม
CREATE TABLE IF NOT EXISTS vote_records (
  topic_id  VARCHAR(64)  NOT NULL,
  user_id   VARCHAR(64)  NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  option_id VARCHAR(64)  NOT NULL,
  voted_at  BIGINT       NOT NULL,
  PRIMARY KEY (topic_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hand_raises (
  meeting_id VARCHAR(64)  NOT NULL,
  user_id    VARCHAR(64)  NOT NULL,
  user_name  VARCHAR(255) NOT NULL,
  raised_at  BIGINT       NOT NULL,
  PRIMARY KEY (meeting_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transcript_segments (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  meeting_id   VARCHAR(64)  NOT NULL,
  speaker_id   VARCHAR(64)  NOT NULL,
  speaker_name VARCHAR(255) NOT NULL,
  -- ก้อนเสียงห่างกัน 2.5 วินาที offset จึงลงท้ายด้วย .5 เสมอ INT ตัดทศนิยมทิ้งแล้วคำบรรยาย
  -- คลาดจากเสียงจริงได้ถึงครึ่งวินาที DOUBLE คืนค่าเป็น number ให้ mysql2 ต่างจาก DECIMAL ที่คืนสตริง
  start_sec    DOUBLE       NOT NULL,
  text         TEXT         NOT NULL,
  created_at   BIGINT       NOT NULL,
  INDEX idx_transcript_meeting (meeting_id, start_sec)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แชร์เอกสารได้ทีละไฟล์ต่อห้อง — meeting_id เป็น primary key จึงทับของเดิมเสมอ
CREATE TABLE IF NOT EXISTS doc_shares (
  meeting_id  VARCHAR(64)  NOT NULL PRIMARY KEY,
  file_id     VARCHAR(64)  NOT NULL,
  file_name   VARCHAR(512) NOT NULL,
  page        INT          NOT NULL DEFAULT 1,
  shared_by   VARCHAR(64)  NOT NULL,
  shared_name VARCHAR(255) NOT NULL,
  updated_at  BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- จองห้องประชุม — normalize เต็มรูป (ทุกฟิลด์ถูก query จริง ไม่เหมือน meetings ที่เก็บเป็น JSON)
-- booking_date เก็บเป็นสตริง 'YYYY-MM-DD' ไม่ใช่ DATE เพราะ driver แปลง DATE เป็น Date object
-- แล้วเลื่อนวันตาม timezone ของ process — การจองวันที่ 1 กลายเป็นวันที่ 31 ของเดือนก่อน
CREATE TABLE IF NOT EXISTS room_bookings (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY,
  room_id      VARCHAR(64)  NOT NULL,
  room_name    VARCHAR(255) NOT NULL,
  title        VARCHAR(512) NOT NULL,
  booked_by_id VARCHAR(64)  NOT NULL,
  booked_by    VARCHAR(255) NOT NULL,
  department   VARCHAR(255) NOT NULL DEFAULT '',
  booking_date VARCHAR(10)  NOT NULL,
  start_time   VARCHAR(5)   NOT NULL,
  end_time     VARCHAR(5)   NOT NULL,
  attendees    INT          NOT NULL DEFAULT 1,
  purpose      TEXT         NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'confirmed',
  extra_rooms  JSON         NULL,
  created_at   BIGINT       NOT NULL,
  INDEX idx_bookings_room_date (room_id, booking_date, status),
  INDEX idx_bookings_owner (booked_by_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ลิงก์เชิญบุคคลภายนอก — เดิมเก็บใน localStorage ของผู้เชิญ คนรับลิงก์จึงเปิดไม่ได้เลย
-- ใช้ครั้งเดียว: used_at ว่างแปลว่ายังใช้ได้ ตัดสินด้วย UPDATE ... WHERE used_at IS NULL
-- ไม่ลบแถวเมื่อเพิกถอนหรือใช้แล้ว — ต้องตรวจย้อนหลังได้ว่าใครออกลิงก์ให้ใคร
CREATE TABLE IF NOT EXISTS meeting_invites (
  token        VARCHAR(64)  NOT NULL PRIMARY KEY,
  meeting_id   VARCHAR(64)  NOT NULL,
  guest_email  VARCHAR(255) NOT NULL,
  guest_name   VARCHAR(255) NULL,
  created_by   VARCHAR(64)  NOT NULL,
  created_by_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at   BIGINT       NOT NULL,
  expires_at   BIGINT       NOT NULL,
  used_at      BIGINT       NULL,
  used_by_name VARCHAR(255) NULL,
  revoked_at   BIGINT       NULL,
  INDEX idx_invites_meeting (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
