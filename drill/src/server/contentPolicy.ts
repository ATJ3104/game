import type { LevelOptions } from "@/domain/levels";

/**
 * 未確認の教材を使うか。開発中（next dev）は使う。
 * 本番では環境変数 ALLOW_UNREVIEWED_CONTENT=1 のときだけ（親が確認するための一時的な設定）
 */
export function levelOptions(): LevelOptions {
  return {
    includeUnreviewed: process.env.NODE_ENV !== "production" || process.env.ALLOW_UNREVIEWED_CONTENT === "1",
  };
}
