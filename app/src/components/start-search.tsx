"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Building2, User, FolderTree, Sparkles } from "lucide-react";

type Hit = {
  kind: "company" | "contact" | "taxonomy";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  meta?: string;
};

const KIND_LABEL: Record<Hit["kind"], string> = {
  company:  "Companies",
  contact:  "Contacts",
  taxonomy: "Marketplace",
};

function KindIcon({ kind }: { kind: Hit["kind"] }) {
  const cls = "w-3.5 h-3.5";
  if (kind === "company")  return <Building2 className={cls} />;
  if (kind === "contact")  return <User className={cls} />;
  return <FolderTree className={cls} />;
}

export function StartSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(0);

  // Debounced fetch.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seqRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (mine !== seqRef.current) return; // stale
        setHits(data.hits || []);
      } catch {
        if (mine === seqRef.current) setHits([]);
      } finally {
        if (mine === seqRef.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const grouped: Record<Hit["kind"], Hit[]> = { company: [], contact: [], taxonomy: [] };
  for (const h of hits) grouped[h.kind].push(h);

  const orderedKinds: Hit["kind"][] = ["company", "contact", "taxonomy"];
  const hasResults = hits.length > 0;

  const goFirst = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && hits[0]) {
      e.preventDefault();
      router.push(hits[0].href);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-3 border border-border rounded-lg bg-subtle/40 focus-within:bg-transparent focus-within:border-accent transition-colors px-4 py-3">
        <Search className="w-4 h-4 text-muted shrink-0" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={goFirst}
          placeholder="Search companies, contacts, marketplace…"
          className="flex-1 bg-transparent outline-none text-base placeholder:text-muted"
          aria-label="Global search"
        />
        <span className="hidden md:flex items-center gap-1.5 text-[11px] text-muted">
          <Sparkles className="w-3 h-3" /> agent hooks coming
        </span>
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute z-30 left-0 right-0 mt-2 border border-border rounded-lg bg-bg shadow-lg max-h-[420px] overflow-y-auto">
          {loading && !hasResults && (
            <div className="px-4 py-3 text-xs text-muted">Searching…</div>
          )}
          {!loading && !hasResults && (
            <div className="px-4 py-3 text-xs text-muted">No matches for “{q.trim()}”.</div>
          )}
          {orderedKinds.map(kind => grouped[kind].length > 0 && (
            <div key={kind}>
              <div className="px-3 pt-3 pb-1 text-[11px] uppercase text-muted tracking-wide">{KIND_LABEL[kind]}</div>
              {grouped[kind].map(hit => (
                <Link
                  key={`${hit.kind}:${hit.id}`}
                  href={hit.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-subtle/60 text-sm"
                >
                  <span className="text-muted"><KindIcon kind={hit.kind} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{hit.title}</div>
                    {hit.subtitle && <div className="truncate text-xs text-muted">{hit.subtitle}</div>}
                  </div>
                  {hit.meta && <span className="mono text-[11px] text-muted shrink-0">{hit.meta}</span>}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
