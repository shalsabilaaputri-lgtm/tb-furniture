import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "@/app/pwa-register";

export const metadata: Metadata = {
  title: "TB Permata Keramik ERP",
  description: "ERP dan POS toko bahan bangunan multi-cabang.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/pwa-192.png",
  },
  manifest: "/manifest.webmanifest",
  applicationName: "TB Permata Keramik ERP",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "TB Permata" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}<PwaRegister /></body>
    </html>
  );
}
