import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Telar",
  description: "A friendly local-first AI UI workspace with live preview.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
