-- LINE 通知（LINE Messaging API）
-- 親ごとに LINE のユーザーをひもづけ、通知の種類を選べる

CREATE TABLE line_links (
  parent_id TEXT PRIMARY KEY REFERENCES parents(id),
  line_user_id TEXT NOT NULL UNIQUE,
  -- 完了通知：each = 子どもが1人終わるたび / all = 全員終わったときだけ / off = 送らない
  notify_complete TEXT NOT NULL DEFAULT 'each',
  -- 決まった時刻（家族の設定 reminderHour、初期値 22時）に終わっていない子がいれば送る
  notify_reminder INTEGER NOT NULL DEFAULT 1,
  linked_at TEXT NOT NULL
);

-- LINE で送ってもらう連携コード（6桁・10分有効。ハッシュで保存）
CREATE TABLE line_link_codes (
  code_hash TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

-- 同じ通知を二度送らないための記録（key は 'complete:<child_id>' / 'all_complete' / 'reminder'）
CREATE TABLE notification_log (
  family_id TEXT NOT NULL REFERENCES families(id),
  study_date TEXT NOT NULL,
  key TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (family_id, study_date, key)
);
