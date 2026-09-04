"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Star, FolderTree, Building2, Users, Kanban, Filter, Send, Sparkles, BarChart3 } from "lucide-react";

const NAV = [
  { section: "Focus", items: [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/priorities", label: "Priorities", icon: Star },
    { href: "/taxonomy", label: "Taxonomy", icon: FolderTree },
  ]},
  { section: "Records", items: [
    { href: "/companies", label: "Companies", icon: Building2 },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/pipeline", label: "Pipeline", icon: Kanban },
  ]},
  { section: "Reach", items: [
    { href: "/segments", label: "Segments", icon: Filter },
    { href: "/campaigns", label: "Campaigns", icon: Send },
    { href: "/agents", label: "Agents", icon: Sparkles },
    { href: "/insights", label: "Insights", icon: BarChart3 },
  ]},
];

export function SideRail() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 w-56 border-r border-border bg-surface/60 backdrop-blur flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label="IDN Sponsor CRM">
            <rect x="2" y="2" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.9" />
            <rect x="13" y="2" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="2" y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="13" y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.9" />
          </svg>
          <div>
            <div className="text-sm font-semibold tracking-tight leading-none">Sponsor CRM</div>
            <div className="text-[10px] text-muted mt-0.5 uppercase tracking-wider">IDN · 2026</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV.map(section => (
          <div key={section.section} className="mb-5 px-3">
            <div className="text-[10px] uppercase tracking-wider text-muted px-2 mb-1.5 font-medium">{section.section}</div>
            {section.items.map(item => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    active ? "bg-accent/15 text-accent" : "text-fg/80 hover:bg-subtle hover:text-fg"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-border text-[10px] text-muted mono">
        <div>Agent-driven · Read-only</div>
        <div className="mt-0.5">Supabase · Vercel</div>
      </div>
    </aside>
  );
}
