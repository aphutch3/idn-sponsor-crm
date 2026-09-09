import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

/**
 * PERPLEXITY_API_KEY diagnostic.
 *
 * Reports safe fingerprint info about the runtime key: length, prefix,
 * whether there's trailing/leading whitespace, and a SHA-256 hash the
 * user can compare against on their end. Also does a live 1-token ping
 * to api.perplexity.ai to surface the exact error.
 *
 * Guarded by CRON_SECRET.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = process.env.PERPLEXITY_API_KEY;
  if (!raw) {
    return NextResponse.json({ ok: false, reason: "PERPLEXITY_API_KEY not set in this env" });
  }

  const trimmed = raw.trim();
  const info = {
    raw_length: raw.length,
    trimmed_length: trimmed.length,
    has_leading_space: raw.length !== raw.trimStart().length,
    has_trailing_space: raw.length !== raw.trimEnd().length,
    has_newline: /[\r\n]/.test(raw),
    has_quote_wrapping: raw.startsWith('"') && raw.endsWith('"'),
    starts_with_pplx_prefix: trimmed.startsWith("pplx-"),
    prefix: trimmed.slice(0, 7),
    suffix: trimmed.slice(-4),
    sha256_prefix: crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 12),
  };

  // Live 1-token ping to the API
  let ping: unknown;
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trimmed}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
    const text = await res.text();
    ping = {
      http_status: res.status,
      ok: res.ok,
      response_head: text.slice(0, 300),
    };
  } catch (e) {
    ping = { error: String((e as Error)?.message ?? e) };
  }

  return NextResponse.json({ ok: true, info, ping });
}
