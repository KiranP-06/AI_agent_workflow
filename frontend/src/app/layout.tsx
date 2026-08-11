import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NhostProvider } from "@/lib/nhost";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Agent Workflow Builder",
  description: "Mini n8n for chaining AI agent steps",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NhostProvider>
          {children}
        </NhostProvider>
      </body>
    </html>
  );
}
