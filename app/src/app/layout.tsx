import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "IDN · The Engager",
  description: "Agent-driven sponsor pursuit — companies, contacts, and outreach for IDN summits.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <TopNav />
          <main style={{ flex: 1 }}>{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
