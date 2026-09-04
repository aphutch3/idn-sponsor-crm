import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, right, eyebrow }: { title: string; subtitle?: string; right?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="tk-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h1 className="tk-editorial" style={{ fontSize: 34, margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ color: "var(--tk-text-muted)", marginTop: 8, fontSize: 14 }}>{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Card({ children, className, flat, padded }: { children: React.ReactNode; className?: string; flat?: boolean; padded?: boolean }) {
  return <div className={cn(flat ? "tk-card-flat" : "tk-card", padded && "p-4", className)}>{children}</div>;
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="tk-card" style={{ padding: 18, borderColor: accent ? "var(--tk-lime)" : undefined, background: accent ? "rgba(212,255,90,.08)" : undefined }}>
      <div className="flex items-center gap-1.5 tk-eyebrow" style={{ fontSize: 11 }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontFamily: "var(--tk-font-serif)", fontWeight: 500, letterSpacing: "-0.02em", marginTop: 6, color: "var(--tk-text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = "default", className }: { children: React.ReactNode; tone?: "default"|"accent"|"success"|"warn"|"danger"|"muted"|"teal"; className?: string }) {
  const map: Record<string, string> = {
    default: "tk-badge",
    accent: "tk-badge tk-badge-lime",
    teal: "tk-badge tk-badge-teal",
    success: "tk-badge tk-badge-success",
    warn: "tk-badge",
    danger: "tk-badge tk-badge-danger",
    muted: "tk-badge",
  };
  const extra = tone === "warn" ? { background: "#fef3c7", color: "#92400e" } : undefined;
  return <span className={cn(map[tone], className)} style={extra}>{children}</span>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ border: "1px dashed var(--tk-border-strong)", borderRadius: 12, padding: 48, textAlign: "center", background: "white" }}>
      <div style={{ fontFamily: "var(--tk-font-serif)", fontSize: 18 }}>{title}</div>
      {hint && <div style={{ fontSize: 13, color: "var(--tk-text-muted)", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tk-card" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="tk-table">{children}</table>
      </div>
    </div>
  );
}
