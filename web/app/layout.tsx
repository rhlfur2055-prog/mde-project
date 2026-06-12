import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "posera — 황금비율 체형·자세 분석",
  description:
    "사진/영상으로 실제 자세를 보고, 황금비율 체형 점수와 10일 전후 진척을 추적하는 셀프 자세코칭.",
  appleWebApp: { capable: true, title: "posera", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="px-6 py-4 text-center text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
          posera는 자세·체형 셀프 코칭을 돕는 웰니스 도구입니다. 의료 진단이 아니며, 통증·질환이
          의심되면 의사·물리치료사와 상담하세요.
        </footer>
      </body>
    </html>
  );
}
