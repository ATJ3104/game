// wrangler の secret / vars で設定する値（`npm run cf-typegen` では出てこないので、ここで型を足す）
interface CloudflareEnv {
  /** LINE Messaging API のチャネルアクセストークン（長期） */
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  /** LINE Messaging API のチャネルシークレット（Webhook の署名の確認に使う） */
  LINE_CHANNEL_SECRET?: string;
  /** LINE 公式アカウントのベーシックID（例：@123abcde）。友だち追加のリンクに使う */
  LINE_BOT_ID?: string;
  /** テスト用：LINE API の送り先を差しかえる */
  LINE_API_BASE?: string;
  /** 毎時の cron から内部の API を呼ぶときの合言葉（デプロイのたびに作り直す） */
  CRON_SECRET?: string;
}
