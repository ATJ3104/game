-- まいにちドリル 初期スキーマ（SPEC.md 8章 ＋ 実装計画での追加分）
-- 日時は ISO 8601 (UTC) の文字列、日付（study_date など）は日本時間 3:00 区切りの 'YYYY-MM-DD'

CREATE TABLE families (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- 家族ごとの設定（日の区切り時刻・進級／復習の判定値・当て推量の閾値など）を JSON で持つ
CREATE TABLE family_settings (
  family_id TEXT PRIMARY KEY REFERENCES families(id),
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE parents (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,                        -- 未設定なら NULL（初回ログイン時に設定）
  name TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  pin_failed_count INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_parents_family ON parents(family_id);

-- 親のログイン状態（Cookie のトークンはハッシュで保存）
CREATE TABLE parent_sessions (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  pin_unlocked_until TEXT              -- PIN 確認が有効な期限（操作のたびに延長）
);
CREATE INDEX idx_parent_sessions_parent ON parent_sessions(parent_id);

CREATE TABLE children (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  grade INTEGER NOT NULL,
  furigana_mode TEXT NOT NULL DEFAULT 'none',   -- none / furigana / hiragana
  allowance_amount INTEGER NOT NULL DEFAULT 0,
  minutes_math INTEGER NOT NULL DEFAULT 10,
  minutes_japanese INTEGER NOT NULL DEFAULT 10,
  minutes_english INTEGER NOT NULL DEFAULT 10,
  start_date TEXT NOT NULL,                     -- この日より前は判定対象外
  created_at TEXT NOT NULL
);
CREATE INDEX idx_children_family ON children(family_id);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_devices_child ON devices(child_id);

-- 端末登録コード（6桁・10分有効）。コードもハッシュで保存する
CREATE TABLE pairing_codes (
  code_hash TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE child_levels (
  child_id TEXT NOT NULL REFERENCES children(id),
  subject TEXT NOT NULL,                -- math / japanese / english
  level_code TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (child_id, subject)
);

CREATE TABLE level_history (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  subject TEXT NOT NULL,
  from_level TEXT,
  to_level TEXT NOT NULL,
  reason TEXT NOT NULL,                 -- initial / auto_up / auto_review / manual
  created_at TEXT NOT NULL
);
CREATE INDEX idx_level_history_child ON level_history(child_id, subject, created_at);

-- 1日・1教科につき1つ
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  study_date TEXT NOT NULL,
  subject TEXT NOT NULL,
  level_code TEXT NOT NULL,
  active_seconds REAL NOT NULL DEFAULT 0,
  target_seconds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'studying',  -- studying / retry / done
  is_review_mix INTEGER NOT NULL DEFAULT 0,
  current_question_json TEXT,              -- 出題中の問題（答えを含むのでサーバーだけが持つ）
  current_shown_at TEXT,
  current_retry_of TEXT,                   -- 間違い直しで出題中のとき、元の attempt id
  last_report_at TEXT,                     -- 時間の最終報告（経過時間の上限チェック用）
  eval_total INTEGER,                      -- 判定に使う回答数（完了時に確定）
  eval_correct INTEGER,
  eval_avg_ms INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (child_id, study_date, subject)
);
CREATE INDEX idx_sessions_child_subject ON sessions(child_id, subject, completed_at);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  question_json TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  response_ms INTEGER NOT NULL,
  is_guess INTEGER NOT NULL DEFAULT 0,
  is_retry INTEGER NOT NULL DEFAULT 0,
  retry_of TEXT,                           -- 間違い直しのとき、元の attempt id
  from_prev_level INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attempts_session ON attempts(session_id, created_at);

CREATE TABLE daily_completion (
  child_id TEXT NOT NULL REFERENCES children(id),
  study_date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (child_id, study_date)
);

-- 範囲指定で登録しても1日1行に展開して保存する
CREATE TABLE special_days (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  date TEXT NOT NULL,
  reason TEXT NOT NULL,                    -- sick / school / family / other
  memo TEXT,
  created_by_parent_id TEXT NOT NULL REFERENCES parents(id),
  created_at TEXT NOT NULL,
  UNIQUE (child_id, date)
);

CREATE TABLE monthly_results (
  child_id TEXT NOT NULL REFERENCES children(id),
  year_month TEXT NOT NULL,               -- 'YYYY-MM'
  achieved INTEGER NOT NULL,
  missed_days INTEGER NOT NULL,           -- やらなかった日（お休み券＋未達成）
  special_days_count INTEGER NOT NULL,
  finalized_at TEXT NOT NULL,
  paid_at TEXT,
  PRIMARY KEY (child_id, year_month)
);

-- ログイン・端末登録コード入力の総当たり対策
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);
