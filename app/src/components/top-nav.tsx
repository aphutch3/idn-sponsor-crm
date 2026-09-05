"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppSwitcher } from "./app-switcher";

// Matches the .tk-nav bar from idn-skill-platform.
const NAV = [
  { href: "/", label: "Overview" },
  { href: "/priorities", label: "Priorities" },
  { href: "/taxonomy", label: "Taxonomy" },
  { href: "/companies", label: "Companies" },
  { href: "/contacts", label: "Contacts" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/campaigns", label: "Campaigns" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="tk-nav">
      <div className="flex items-center gap-8">
        <Link href="/" className="tk-editorial text-white" style={{ fontSize: 22 }}>
          IDN Sponsor CRM
        </Link>
        <div className="hidden md:flex gap-6">
          {NAV.map(item => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link className="tk-btn tk-btn-sm tk-btn-accent" href="/agents" style={{ color: "#111318" }}>Agents</Link>
        <Link className="tk-btn tk-btn-sm tk-btn-ghost" style={{ borderColor: "#374151", color: "white" }} href="/insights">
          Insights
        </Link>
        <AppSwitcher />
      </div>
    </nav>
  );
}
