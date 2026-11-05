-- Phase 2: 国語の聞き取り問題のため、端末で読み上げが使えるかを学習ごとに持つ
ALTER TABLE sessions ADD COLUMN can_speak INTEGER NOT NULL DEFAULT 0;
