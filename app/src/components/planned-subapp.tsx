import Link from "next/link";
import { PageHeader, Card, Badge } from "@/components/ui";

export type PlannedFeature = {
  title: string;
  detail: string;
};

export function PlannedSubApp({
  eyebrow,
  title,
  subtitle,
  features,
  speedLinks,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  features: PlannedFeature[];
  speedLinks: { label: string; href: string }[];
}) {
  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-2 text-xs text-muted mb-3">
        <Link href="/engager" className="hover:text-strong">
          Engager
        </Link>
        <span>/</span>
        <span className="text-strong">{title}</span>
      </div>

      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        right={<Badge tone="muted">Planned</Badge>}
      />

      <div className="grid grid-cols-3 gap-4 mt-6">
        <Card className="col-span-2">
          <h3 className="text-sm uppercase tracking-wider text-muted mb-3">What will live here</h3>
          <ul className="flex flex-col gap-3">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span
                  className="mt-1"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "var(--tk-accent)",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div className="text-sm font-medium text-strong">{f.title}</div>
                  <div className="text-xs text-muted mt-0.5">{f.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="text-sm uppercase tracking-wider text-muted mb-3">Quick links</h3>
          <div className="flex flex-col gap-2">
            {speedLinks.map((s) => (
              <div
                key={s.href}
                className="text-sm text-muted"
                title="Route reserved — page not yet built"
              >
                → {s.label}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-4">
            Routes above are reserved. They will resolve when this sub-app ships.
          </p>
        </Card>
      </div>

      <p className="text-xs text-muted mt-8">
        Skeleton placeholder — nothing here fetches data yet. Ask me to build this sub-app when you are ready.
      </p>
    </div>
  );
}
