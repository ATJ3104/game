import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/ui/RegisterSW";

export const metadata: Metadata = {
  title: "まいにちドリル",
  description: "まいにち すこしずつ。家庭用の学習アプリ",
  applicationName: "まいにちドリル",
  appleWebApp: { capable: true, title: "ドリル", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f59e0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
