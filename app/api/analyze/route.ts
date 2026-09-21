import { NextResponse } from "next/server";
import { offlineAnalysis } from "@/lib/resume-analysis";

type JevAnswer = { score?: number; confidence?: number; choice?: string };
type JevResponse = {
  answers?: Record<string, JevAnswer>;
  detail?: string;
  message?: string;
  usage?: unknown;
};

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 6;
const MAX_GLOBAL_IN_FLIGHT = 8;
const MAX_IP_IN_FLIGHT = 2;
const MAX_TRACKED_CLIENTS = 5_000;
const buckets = new Map<string, { count: number; resetAt: number }>();
const activeByClient = new Map<string, number>();
let activeRequests = 0;

function clientId(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function allowRequest(id: string) {
  const now = Date.now();
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_TRACKED_CLIENTS && !buckets.has(id)) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (oldest) buckets.delete(oldest);
  }
  const current = buckets.get(id);
  if (!current || current.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function apiKey(request: Request) {
  const supplied = request.headers.get("x-jev-api-key")?.trim();
  const key = supplied || process.env.TYPESAFE_API_KEY?.trim();
  if (!key) return null;
  if (key.length < 20 || key.length > 256 || /\s/.test(key)) return null;
  return key;
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
const D = [
  {
    id: "core_skills",
    label: "Core skills",
    weight: 0.3,
    note: "Required technical and functional skills",
  },
  {
    id: "experience_relevance",
    label: "Relevant experience",
    weight: 0.24,
    note: "Similarity of prior work and responsibilities",
  },
  {
    id: "seniority_fit",
    label: "Seniority fit",
    weight: 0.16,
    note: "Scope, ownership, and leadership level",
  },
  {
    id: "achievement_evidence",
    label: "Achievement evidence",
    weight: 0.14,
    note: "Specific outcomes and measurable impact",
  },
  {
    id: "education_credentials",
    label: "Education & credentials",
    weight: 0.08,
    note: "Required education and certifications",
  },
  {
    id: "communication_clarity",
    label: "Resume clarity",
    weight: 0.08,
    note: "Clear, relevant, and easy-to-verify evidence",
  },
] as const;
const LEVELS = [
  "No relevant evidence in the resume.",
  "Weak or indirect evidence; major requirements are unsupported.",
  "Partial evidence; some requirements are supported and important gaps remain.",
  "Strong evidence; most requirements are clearly supported.",
  "Excellent direct evidence; requirements are comprehensively supported with specific examples.",
];
const STOP = new Set(
  "a an and are as at be been being but by can company could did do does for from had has have having he her here hers herself him himself his how i if in into is it its itself job just me more most my myself no nor not of off on once only or other our ours ourselves out over own role same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves work working years year experience required preferred responsibilities qualifications including using use used ability strong excellent team teams skills skill".split(
    /\s+/
  )
);
function stripHtml(h: string) {
  return h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function publicUrl(raw: string) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol))
    throw new Error("Use an HTTP or HTTPS job URL.");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "::1"
  )
    throw new Error("Use a publicly accessible job URL.");
  return u;
}
async function fetchJob(raw: string) {
  const u = publicUrl(raw);
  const r = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; JevFit/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok && u.hostname.toLowerCase().includes("jobstreet"))
    throw new Error(
      "JobStreet blocks automated access. Paste the job description below."
    );
  if (!r.ok)
    throw new Error(
      `The job page returned ${r.status}. Paste the description instead.`
    );
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("text/html") && !ct.includes("text/plain"))
    throw new Error(
      "That URL is not a readable job page. Paste the description instead."
    );
  const html = (await r.text()).slice(0, 300000);
  const title = html
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return { text: stripHtml(html).slice(0, 45000), title };
}
function keywords(text: string, max = 30) {
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#.\/-]{2,}/g) || [];
  const c = new Map<string, number>();
  for (const raw of words) {
    const w = raw.replace(/^[./-]+|[./-]+$/g, "");
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    c.set(w, (c.get(w) || 0) + 1);
  }
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}
function evidence(resume: string, terms: string[]) {
  const sentences = resume
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return terms.slice(0, 6).flatMap((term) => {
    const found = sentences.find((s) =>
      s.toLowerCase().includes(term.toLowerCase())
    );
    return found ? [{ term, excerpt: found.slice(0, 260) }] : [];
  });
}
export async function POST(request: Request) {
  const id = clientId(request);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 120_000)
    return json({ error: "The request is too large." }, 413);
  if (!allowRequest(id))
    return json(
      { error: "Too many analyses. Please wait a minute and try again." },
      429,
      { "Retry-After": "60" }
    );
  if (
    activeRequests >= MAX_GLOBAL_IN_FLIGHT ||
    (activeByClient.get(id) || 0) >= MAX_IP_IN_FLIGHT
  )
    return json(
      { error: "The analyzer is busy. Please try again shortly." },
      503,
      { "Retry-After": "10" }
    );

  activeRequests += 1;
  activeByClient.set(id, (activeByClient.get(id) || 0) + 1);
  try {
    const b = (await request.json()) as {
      jobUrl?: string;
      jobText?: string;
      resumeText?: string;
      resumeName?: string;
    };
    const resume = (b.resumeText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 45000);
    if (resume.length < 120)
      return json(
        { error: "The resume does not contain enough readable text." },
        400
      );
    let job = (b.jobText || "").replace(/\s+/g, " ").trim().slice(0, 45000);
    let jobTitle: string | undefined;
    if (!job && b.jobUrl) {
      const f = await fetchJob(b.jobUrl);
      job = f.text;
      jobTitle = f.title;
    }
    if (job.length < 120)
      return json(
        {
          error:
            "The job posting does not contain enough readable text. Paste the full description instead.",
        },
        400
      );
    const key = apiKey(request);
    const source = { jobTitle, jobUrl: b.jobUrl, resumeName: b.resumeName };
    if (!key) return json({ ...offlineAnalysis(job, resume), source });
    const questions: Record<string, unknown> = {};
    for (const d of D)
      questions[d.id] = {
        type: "score",
        instructions: `How strongly does the evidence in \`resume\` satisfy the job's ${d.label.toLowerCase()} requirements in \`job_posting\`? Judge only evidence stated in the resume. Do not infer unstated experience.`,
        criteria: LEVELS,
      };
    questions.recommendation = {
      type: "choice",
      instructions:
        "Based only on the evidence in `resume` compared with `job_posting`, what is the most defensible application recommendation?",
      criteria: {
        "Strong match — apply":
          "The resume clearly supports nearly all critical requirements.",
        "Good match — apply":
          "The resume supports most important requirements with manageable gaps.",
        "Possible match — tailor first":
          "The candidate may fit, but the resume needs clearer evidence or has several gaps.",
        "Weak match — build experience":
          "The resume lacks evidence for multiple critical requirements.",
      },
    };
    const jr = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: { job_posting: job, resume },
        questions,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const jev = (await jr.json()) as JevResponse;
    if (!jr.ok)
      return json(
        {
          error:
            jev?.detail ||
            jev?.message ||
            "The Jev analysis service returned an error.",
        },
        502
      );
    const dimensions = D.map((d) => {
      const a = jev.answers?.[d.id] || {};
      return {
        id: d.id,
        label: d.label,
        score: Math.round((Number(a.score || 0) / 4) * 100),
        confidence: Number(a.confidence || 0),
        note: d.note,
      };
    });
    const overall = Math.round(
      dimensions.reduce((sum, item, i) => sum + item.score * D[i].weight, 0)
    );
    const jobTerms = keywords(job),
      lower = resume.toLowerCase(),
      matchedTerms = jobTerms.filter((t) => lower.includes(t)).slice(0, 16),
      missingTerms = jobTerms.filter((t) => !lower.includes(t)).slice(0, 12),
      rec = jev.answers?.recommendation || {};
    return json({
      overall,
      recommendation: rec.choice || "Review the detailed match",
      recommendationConfidence: Number(rec.confidence || 0),
      dimensions,
      matchedTerms,
      missingTerms,
      evidence: evidence(resume, matchedTerms),
      provider: "jev",
      source,
      usage: jev.usage,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error
            ? e.message
            : "The analysis could not be completed.",
      },
      400
    );
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    const remaining = Math.max(0, (activeByClient.get(id) || 1) - 1);
    if (remaining === 0) activeByClient.delete(id);
    else activeByClient.set(id, remaining);
  }
}
