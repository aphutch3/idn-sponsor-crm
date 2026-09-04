import "./globals.css";
import type { Metadata } from "next";
import { SideRail } from "@/components/side-rail";

export const metadata: Metadata = {
  title: "IDN Sponsor CRM",
  description: "Agent-driven sponsor sales operating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <SideRail />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
