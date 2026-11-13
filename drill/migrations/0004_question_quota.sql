-- 教科の完了を「時間」ではなく「解いた問題数」で決める
-- target_questions: その教科で解く問題数（目標時間とレベルから決める）。answered: 数えた回答数
ALTER TABLE sessions ADD COLUMN target_questions INTEGER;
ALTER TABLE sessions ADD COLUMN answered INTEGER NOT NULL DEFAULT 0;
