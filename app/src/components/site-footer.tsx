import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="tk-footer">
      <div className="tk-footer-inner">
        <div>
          <div className="tk-footer-brand">IDN · The Engager</div>
          <p className="text-sm" style={{ color: "#9ca3af" }}>
            Agent-driven sponsor pursuit for IDN summit programming. Companies, contacts, activity,
            and outreach in one governed workspace.
          </p>
        </div>
        <div>
          <h4>Focus</h4>
          <Link href="/priorities">Priorities</Link>
          <Link href="/taxonomy">Taxonomy</Link>
          <Link href="/pipeline">Pipeline</Link>
        </div>
        <div>
          <h4>Records</h4>
          <Link href="/companies">Companies</Link>
          <Link href="/contacts">Contacts</Link>
          <Link href="/segments">Segments</Link>
        </div>
        <div>
          <h4>Reach</h4>
          <Link href="/campaigns">Campaigns</Link>
          <Link href="/agents">Agents</Link>
          <Link href="/insights">Insights</Link>
        </div>
      </div>
    </footer>
  );
}
