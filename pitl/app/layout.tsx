import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PITL - 아이디어 기획 서비스",
  description: "아이디어 하나를 입력받아 3C 분석 → 4P 전략 → HTML 기획서를 한 번에 생성합니다",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
