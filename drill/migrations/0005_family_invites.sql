-- 家族アカウントをまとめるための招待コード（8けた・30分有効。ハッシュで保存）
-- 別の家族アカウントを作ってしまったおうちの人が、このコードで同じ家族に入る
CREATE TABLE family_invites (
  code_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  created_by_parent_id TEXT NOT NULL REFERENCES parents(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
