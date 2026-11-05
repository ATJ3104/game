import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;

// `next dev` でも wrangler の設定（D1 のローカル DB）を使えるようにする
initOpenNextCloudflareForDev();
