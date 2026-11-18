import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "CourtBase 管理", template: "%s | CourtBase 管理" }, robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
