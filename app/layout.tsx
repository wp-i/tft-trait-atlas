import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '羁绊云图｜S18 纹章阵容解算器',
  description: '选择你拥有的纹章，计算 S18 最大非唯一羁绊阵容。',
  openGraph: {
    title: '羁绊云图｜S18 纹章阵容解算器',
    description: '选择你拥有的纹章，计算 8–11 人口最大非唯一羁绊阵容。',
    locale: 'zh_CN',
    type: 'website',
    images: [{
      url: '/og.png',
      width: 1733,
      height: 909,
      alt: '羁绊云图 S18 纹章阵容解算器',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '羁绊云图｜S18 纹章阵容解算器',
    description: '选择纹章，计算 8–11 人口非唯一羁绊上限。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
