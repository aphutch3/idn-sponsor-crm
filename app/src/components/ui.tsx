import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface border border-border rounded-lg", className)}>{children}</div>;
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={cn("p-4", accent && "border-accent/30 bg-accent/5")}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn("text-2xl font-semibold mt-1", accent && "text-accent")}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </Card>
  );
}

export function Badge({ children, tone = "default", className }: { children: React.ReactNode; tone?: "default"|"accent"|"success"|"warn"|"danger"|"muted"; className?: string }) {
  const tones: Record<string,string> = {
    default: "bg-subtle text-fg border-border",
    accent: "bg-accent/15 text-accent border-accent/30",
    success: "bg-success/15 text-success border-success/30",
    warn: "bg-warn/15 text-warn border-warn/30",
    danger: "bg-danger/15 text-danger border-danger/30",
    muted: "bg-transparent text-muted border-border",
  };
  return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border", tones[tone], className)}>{children}</span>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-border rounded-lg p-12 text-center">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </Card>
  );
}
