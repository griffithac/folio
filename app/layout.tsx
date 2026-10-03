import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Folio — A little order for your books",
  description: "Upload a PDF and let TypeSafe Jev find its genre, language, and reading level. Your next chapter, organized.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
