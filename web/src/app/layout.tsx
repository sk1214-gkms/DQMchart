import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { TitleProvider, TitleSwitcher } from "@/components/TitleProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "配合チャートメーカー",
  description: "ドラゴンクエストモンスターズの配合チャート作成ツール",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <TitleProvider>
          <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-lg font-bold">
                配合チャートメーカー
              </Link>
              <nav className="flex gap-4 text-sm text-zinc-600">
                <Link href="/simulate" className="hover:text-zinc-900">
                  配合シミュレータ
                </Link>
                <Link href="/auto" className="hover:text-zinc-900">
                  自動チャート生成
                </Link>
                <Link href="/editor" className="hover:text-zinc-900">
                  手動チャートエディタ
                </Link>
              </nav>
              <div className="ml-auto">
                <TitleSwitcher />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </TitleProvider>
      </body>
    </html>
  );
}
