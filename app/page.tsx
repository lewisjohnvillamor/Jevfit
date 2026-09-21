"use client";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Upload,
} from "lucide-react";

type Dimension = {
  id: string;
  label: string;
  score: number;
  confidence: number;
  note: string;
};
type Result = {
  overall: number;
  recommendation: string;
  recommendationConfidence: number;
  dimensions: Dimension[];
  matchedTerms: string[];
  missingTerms: string[];
  evidence: { term: string; excerpt: string }[];
  source: { jobTitle?: string; jobUrl?: string; resumeName?: string };
};
const scoreTone = (n: number) =>
  n >= 80 ? "text-emerald-700" : n >= 60 ? "text-amber-700" : "text-rose-700";

export default function Home() {
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [resume, setResume] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [apiKey, setApiKey] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = useMemo(
    () =>
      Boolean(
        (jobUrl.trim() || jobText.trim().length > 120) &&
          resumeText.trim().length > 120
      ),
    [jobUrl, jobText, resumeText]
  );
  async function readPdf(file: File) {
    setExtracting(true);
    setError("");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      }).promise;
      const pages: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const c = await page.getTextContent();
        pages.push(c.items.map((i) => ("str" in i ? i.str : "")).join(" "));
      }
      const text = pages.join("\n").replace(/\s+/g, " ").trim();
      if (text.length < 120)
        throw new Error("This PDF does not contain enough selectable text.");
      setResume(file);
      setResumeText(text);
    } catch (e) {
      setResume(null);
      setResumeText("");
      setError(e instanceof Error ? e.message : "We could not read this PDF.");
    } finally {
      setExtracting(false);
    }
  }
  async function analyze() {
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey.trim() ? { "x-jev-api-key": apiKey.trim() } : {}),
        },
        body: JSON.stringify({
          jobUrl: jobUrl.trim(),
          jobText: jobText.trim(),
          resumeText,
          resumeName: resume?.name,
        }),
      });
      const b = await r.json();
      if (!r.ok)
        throw new Error(b.error || "The analysis could not be completed.");
      setResult(b);
      requestAnimationFrame(() =>
        document
          .getElementById("results")
          ?.scrollIntoView({ behavior: "smooth" })
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The analysis could not be completed."
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              <Sparkles size={18} />
            </span>
            <span className="text-[17px] font-bold tracking-[-.02em]">
              Jev Resume Fit
            </span>
            <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 sm:inline">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LockKeyhole size={14} /> Your resume stays private
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-9 max-w-2xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[.14em] text-blue-600">
            Job match analysis
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-[-.045em] text-slate-950 sm:text-5xl">
            Know how well your resume fits before you apply.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-7 text-slate-600">
            Add the job posting and your PDF resume. Get a competency breakdown,
            missing requirements, and evidence in seconds.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_50px_rgba(15,23,42,.06)] sm:p-7">
            <div className="mb-6 flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <BriefcaseBusiness size={20} />
              </span>
              <div>
                <p className="font-bold text-slate-950">
                  1. Add the job posting
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Paste a public job listing URL.
                </p>
              </div>
            </div>
            <label
              className="mb-2 block text-sm font-semibold text-slate-700"
              htmlFor="job-url"
            >
              Job posting URL
            </label>
            <div className="relative">
              <Link2
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                id="job-url"
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://company.com/jobs/role"
                className="h-13 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-[16px] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              {showPaste
                ? "Hide pasted description"
                : "Job site blocks access? Paste the description"}
              <ChevronDown
                size={16}
                className={showPaste ? "rotate-180" : ""}
              />
            </button>
            {showPaste && (
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={7}
                placeholder="Paste the full job description here…"
                className="mt-4 w-full resize-y rounded-xl border border-slate-300 p-4 text-[16px] leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            )}
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_50px_rgba(15,23,42,.06)] sm:p-7">
            <div className="mb-6 flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <FileText size={20} />
              </span>
              <div>
                <p className="font-bold text-slate-950">
                  2. Upload your resume
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  PDF only, up to 10 MB.
                </p>
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 10 * 1024 * 1024)
                    setError("The resume must be smaller than 10 MB.");
                  else readPdf(f);
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="group flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-5 text-center transition hover:border-blue-400 hover:bg-blue-50/50"
            >
              {extracting ? (
                <LoaderCircle
                  className="animate-spin text-blue-600"
                  size={28}
                />
              ) : resume ? (
                <>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check size={22} />
                  </span>
                  <span className="mt-3 max-w-full truncate font-semibold text-slate-900">
                    {resume.name}
                  </span>
                  <span className="mt-1 text-sm text-slate-500">
                    {Math.ceil(resume.size / 1024)} KB · Ready
                  </span>
                </>
              ) : (
                <>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-blue-700 shadow-sm">
                    <Upload size={21} />
                  </span>
                  <span className="mt-3 font-semibold text-slate-900">
                    Choose your resume PDF
                  </span>
                  <span className="mt-1 text-sm text-slate-500">
                    PDFs with selectable text work best
                  </span>
                </>
              )}
            </button>
          </section>
        </div>
        <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
          <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold text-slate-900">
            <KeyRound size={18} className="text-blue-700" />
            Use your own Jev API key (optional)
          </summary>
          <div className="mt-4">
            <label
              htmlFor="jev-api-key"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Jev API key
            </label>
            <input
              id="jev-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="apikey_…"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-[16px] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Kept only in this browser tab and sent only with an analysis. It
              is never saved by Jev Resume Fit.
            </p>
          </div>
        </details>
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <CircleAlert className="mt-.5 shrink-0" size={18} />
            {error}
          </div>
        )}
        <div className="mt-7 flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={!ready || loading}
            onClick={analyze}
            className="inline-flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-blue-600 px-7 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" size={19} /> Comparing
                your fit…
              </>
            ) : (
              <>
                Analyze my match <ArrowRight size={19} />
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-500">
            Scores reflect the evidence in your resume, not an employer’s hiring
            decision.
          </p>
        </div>
        {result && <Results result={result} />}
      </section>
    </main>
  );
}

function Results({ result }: { result: Result }) {
  return (
    <section
      id="results"
      className="mt-16 scroll-mt-8 border-t border-slate-200 pt-12"
    >
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-semibold text-slate-400">Overall match</p>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-7xl font-bold tracking-[-.07em]">
              {result.overall}
            </span>
            <span className="mb-2 text-xl text-slate-400">/100</span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${result.overall}%` }}
            />
          </div>
          <p className="mt-6 text-xl font-bold">{result.recommendation}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Recommendation confidence:{" "}
            {Math.round(result.recommendationConfidence * 100)}%
          </p>
          <div className="mt-7 border-t border-slate-800 pt-5 text-sm text-slate-400">
            {result.source.jobTitle || "Job posting"}
            <br />
            {result.source.resumeName || "Resume PDF"}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">
            Competency breakdown
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Each dimension is judged independently.
          </p>
          <div className="mt-3 divide-y divide-slate-100">
            {result.dimensions.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 py-5 sm:grid-cols-[1fr_180px_58px] sm:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.note} · {Math.round(item.confidence * 100)}%
                    confidence
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                <span
                  className={`text-right text-lg font-bold ${scoreTone(
                    item.score
                  )}`}
                >
                  {item.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TermCard
          title="Matched requirements"
          sub="Terms supported by both documents."
          terms={result.matchedTerms}
          tone="green"
        />
        <TermCard
          title="Missing or unclear"
          sub="Requirements that need evidence or clarification."
          terms={result.missingTerms}
          tone="amber"
        />
      </div>
      {result.evidence.length > 0 && (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-950">Resume evidence</h2>
          <p className="mt-1 text-sm text-slate-500">
            Text from your resume that supports the match.
          </p>
          <div className="mt-5 grid gap-3">
            {result.evidence.map((item, i) => (
              <blockquote
                key={`${item.term}-${i}`}
                className="rounded-2xl bg-slate-50 p-4"
              >
                <span className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  {item.term}
                </span>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  “{item.excerpt}”
                </p>
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
function TermCard({
  title,
  sub,
  terms,
  tone,
}: {
  title: string;
  sub: string;
  terms: string[];
  tone: "green" | "amber";
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {terms.length ? (
          terms.map((t) => (
            <span
              key={t}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                tone === "green"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-900"
              }`}
            >
              {t}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-500">No major terms found.</span>
        )}
      </div>
    </div>
  );
}
