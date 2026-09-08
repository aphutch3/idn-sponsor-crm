// LinkedIn post relevance scorer.
//
// Pipeline: keyword pre-filter → LLM classifier.
// The pre-filter narrows the 951-tag taxonomy to <=10 candidates that
// actually appear in the post text. The LLM then scores overall
// relevance to IDN's audience (enterprise IT decision-makers) and
// picks the top matching topics.
//
// LLM: Perplexity Sonar (cheapest tier). Falls back to a keyword-only
// heuristic score if PERPLEXITY_API_KEY is missing so the pipeline
// never hard-fails.

import { loadTopicTags, matchKeywords, type TopicTag } from "./tags";

export type PostToScore = {
  readonly text: string;
  readonly url?: string;
  readonly author_context?: string; // e.g. "IBM" or "Ben Thompson, Stratechery"
};

export type RelevanceResult = {
  readonly score: number;                    // 0-100
  readonly topics: readonly string[];        // tag slugs, ordered by confidence
  readonly reason: string;                   // one-sentence justification
  readonly keyword_hits: readonly string[];  // tag slugs from pre-filter
  readonly scorer_model: string;             // e.g. "sonar" or "keyword-fallback"
};

const PPLX_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const MODEL = process.env.LINKEDIN_RELEVANCE_MODEL ?? "sonar";
const MAX_CANDIDATES = 12;

const SYSTEM_PROMPT = `You are an editorial classifier for IDN, an enterprise IT media brand covering AI, cloud, security, data, and developer tools for CxO and technical decision-makers.

You will be given the text of a LinkedIn post and a shortlist of candidate topic tags with descriptions. Your job:
1. Judge how important the post is for IDN's audience on a 0-100 scale where:
   - 0-30: personal update, hiring pitch, generic thought-leader fluff, event promo with no substance
   - 30-60: relevant industry commentary but not a must-read
   - 60-80: notable product announcement, benchmark, adoption pattern, or executive perspective worth flagging
   - 80-100: high-signal news our editors should respond to today (major release, incident, funding, acquisition, market inflection)
2. Pick 1-4 tag slugs from the candidate list that best describe the post. Only use slugs from the provided list.
3. Give a one-sentence reason (max 30 words) explaining the score.

Respond ONLY with strict JSON in this exact shape:
{"score": <int>, "topics": ["slug1","slug2"], "reason": "<one sentence>"}`;

export async function scorePostRelevance(
  post: PostToScore,
  opts?: { tags?: readonly TopicTag[] },
): Promise<RelevanceResult> {
  const text = (post.text ?? "").trim();
  if (!text) {
    return { score: 0, topics: [], reason: "empty post text", keyword_hits: [], scorer_model: "empty" };
  }

  const tags = opts?.tags ?? await loadTopicTags();
  const keyword_hits = matchKeywords(text, tags);

  // No pre-filter hits → skip LLM. This is the main cost lever.
  if (keyword_hits.length === 0) {
    return {
      score: 0,
      topics: [],
      reason: "no IDN topic keywords in post",
      keyword_hits: [],
      scorer_model: "prefilter",
    };
  }

  // Build shortlist of candidates for the LLM (cap to keep prompt tight)
  const bySlug = new Map(tags.map((t) => [t.slug, t] as const));
  const candidates = keyword_hits
    .slice(0, MAX_CANDIDATES)
    .map((s) => bySlug.get(s))
    .filter((t): t is TopicTag => t !== undefined);

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    // Keyword-only fallback: score based on hit count + tag article volume.
    const heur = Math.min(100, Math.round(30 + keyword_hits.length * 10));
    return {
      score: heur,
      topics: keyword_hits.slice(0, 3),
      reason: `heuristic — ${keyword_hits.length} keyword hits, LLM disabled`,
      keyword_hits,
      scorer_model: "keyword-fallback",
    };
  }

  const candList = candidates
    .map((t) => `- ${t.slug} (${t.category ?? "n/a"}): ${t.description ?? t.name}`)
    .join("\n");

  const userPrompt = [
    post.author_context ? `Author: ${post.author_context}` : "",
    `Post text:\n${text.slice(0, 4000)}`,
    "",
    `Candidate topic tags:\n${candList}`,
  ].filter(Boolean).join("\n\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(PPLX_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return heuristicFallback(keyword_hits, `pplx http ${res.status}: ${body.slice(0, 120)}`);
    }
    const j = await res.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJson(content);
    if (!parsed) return heuristicFallback(keyword_hits, "pplx returned unparseable json");

    const score = clampInt(parsed.score, 0, 100);
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((s): s is string => typeof s === "string" && bySlug.has(s)).slice(0, 4)
      : [];
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 240) : "";

    return {
      score,
      topics: topics.length > 0 ? topics : keyword_hits.slice(0, 3),
      reason: reason || "scored via LLM",
      keyword_hits,
      scorer_model: MODEL,
    };
  } catch (e) {
    return heuristicFallback(keyword_hits, `pplx exception: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
}

function heuristicFallback(keyword_hits: readonly string[], reason: string): RelevanceResult {
  const heur = Math.min(100, Math.round(30 + keyword_hits.length * 10));
  return {
    score: heur,
    topics: keyword_hits.slice(0, 3),
    reason,
    keyword_hits,
    scorer_model: "keyword-fallback",
  };
}

function parseJson(s: string): { score?: unknown; topics?: unknown; reason?: unknown } | null {
  const trimmed = s.trim();
  // Strip common ```json fences
  const cleaned = trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  // Extract first {...} block if the model added prose
  const m = cleaned.match(/\{[\s\S]*\}/);
  const candidate = m ? m[0] : cleaned;
  try { return JSON.parse(candidate); } catch { return null; }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
