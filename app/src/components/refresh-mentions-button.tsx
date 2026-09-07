"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ButtonState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; upserted: number; queries: number; ms: number }
  | { kind: "error"; message: string };

export function RefreshMentionsButton() {
  const router = useRouter();
  const [state, setState] = useState<ButtonState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/socializers/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data.errors?.[0]?.detail || `HTTP ${res.status}`;
        setState({ kind: "error", message: msg.length > 140 ? msg.slice(0, 140) + "…" : msg });
        return;
      }
      setState({
        kind: "success",
        upserted: data.posts_upserted ?? 0,
        queries: data.queries_run ?? 0,
        ms: data.duration_ms ?? 0,
      });
      // Re-render the server component to pick up the new rows.
      startTransition(() => router.refresh());
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const busy = state.kind === "loading" || isPending;
  const label =
    state.kind === "loading" ? "Refreshing…" :
    isPending               ? "Reloading…"   :
    "Refresh now";

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={busy}
        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
          busy
            ? "bg-subtle text-muted border-border cursor-wait"
            : "bg-accent text-accentfg border-accent hover:opacity-90"
        }`}
      >
        {label}
      </button>
      {state.kind === "success" && (
        <span className="text-xs text-muted">
          Upserted <span className="mono text-fg">{state.upserted}</span> · {state.queries} queries · {(state.ms / 1000).toFixed(1)}s
        </span>
      )}
      {state.kind === "error" && (
        <span className="text-xs text-danger" title={state.message}>
          {state.message.includes("X_BEARER_TOKEN")
            ? "X_BEARER_TOKEN not set in Vercel"
            : `Failed: ${state.message.slice(0, 60)}${state.message.length > 60 ? "…" : ""}`}
        </span>
      )}
    </div>
  );
}
