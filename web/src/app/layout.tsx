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

const navItems = [
  { href: '/simulate', label: '配合シミュレータ' },
  { href: '/auto', label: '自動チャート生成' },
  { href: '/editor', label: '手動エディタ' },
];

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
          <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
              <Link href="/" className="text-base font-bold sm:text-lg">
                配合チャートメーカー
              </Link>
              <TitleSwitcher />
            </div>
            {/* スマホでは横スクロールするタブ、画面が広ければ通常のナビ */}
            <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-1 sm:px-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-11 shrink-0 items-center rounded px-3 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:py-6">{children}</main>
        </TitleProvider>
      </body>
    </html>
  );
}
