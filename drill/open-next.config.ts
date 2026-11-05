import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 全ページが動的（ログイン状態で内容が変わる）なので、ISR 用のキャッシュ（R2 等）は使わない
export default defineCloudflareConfig({});
