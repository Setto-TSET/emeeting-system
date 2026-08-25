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
  allow_guest_join TINYINT(1) NOT NULL DEFAULT 0
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
