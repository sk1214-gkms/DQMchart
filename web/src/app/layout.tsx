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
  { href: '/monster', label: 'モンスターを調べる', icon: '🔍' },
  { href: '/simulate', label: '配合シミュレータ', icon: '⚗' },
  { href: '/auto', label: '配合チャート', icon: '✦' },
  { href: '/editor', label: '手動エディタ', icon: '✎' },
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
      <body className="flex min-h-full flex-col">
        <TitleProvider>
          <header className="sticky top-0 z-20 shadow-md">
            <div className="bg-[linear-gradient(120deg,var(--brand-900),var(--brand-700))]">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
                <Link href="/" className="flex items-center gap-2 text-white">
                  <span
                    aria-hidden
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 text-base"
                  >
                    ⚗
                  </span>
                  <span className="text-base font-bold tracking-wide sm:text-lg">
                    配合チャートメーカー
                  </span>
                </Link>
                <TitleSwitcher />
              </div>
            </div>
            {/* スマホでは横スクロールするタブ、画面が広ければ通常のナビ */}
            <nav className="border-b bg-white" style={{ borderColor: 'var(--border)' }}>
              <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-t px-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[#f2f5fc] hover:text-[var(--brand-700)]"
                  >
                    <span aria-hidden className="text-[var(--brand-500)]">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-7">{children}</main>
        </TitleProvider>
      </body>
    </html>
  );
}
