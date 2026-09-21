export type Provider = "offline" | "jev" | "ollama";
export type Dimension = { id: string; label: string; score: number; confidence: number; note: string };
export type RequirementAssessment = {
  requirement: string;
  importance: "required" | "preferred" | "general";
  status: "strong" | "partial" | "mentioned" | "missing";
  score: number;
  evidence?: string;
};
export type AnalysisResult = {
  provider: Provider;
  overall: number;
  recommendation: string;
  recommendationConfidence: number;
  dimensions: Dimension[];
  requirements: RequirementAssessment[];
  matchedTerms: string[];
  missingTerms: string[];
  evidence: { term: string; excerpt: string }[];
  source: { jobTitle?: string; jobUrl?: string; resumeName?: string };
  usage?: unknown;
};

export const DIMENSIONS = [
  { id: "core_skills", label: "Core skills", weight: 0.25, note: "Required technical and functional skills" },
  { id: "experience_relevance", label: "Relevant experience", weight: 0.2, note: "Similarity of prior work and responsibilities" },
  { id: "responsibility_fit", label: "Responsibilities", weight: 0.15, note: "Evidence of performing the work described" },
  { id: "seniority_fit", label: "Seniority and scope", weight: 0.15, note: "Leadership, ownership and organizational scope" },
  { id: "achievement_evidence", label: "Achievements", weight: 0.1, note: "Specific outcomes and measurable impact" },
  { id: "education_credentials", label: "Credentials", weight: 0.05, note: "Required education and certifications" },
  { id: "communication_clarity", label: "Evidence quality", weight: 0.1, note: "Clear, relevant and verifiable resume evidence" },
] as const;

const STOP = new Set(
  "a an and are as at be been being but by can company could did do does for from had has have having he her here hers herself him himself his how i if in into is it its itself job just me more most my myself no nor not of off on once only or other our ours ourselves out over own role same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves work working years year experience required preferred responsibilities qualifications including using use used ability strong excellent team teams skills skill candidate candidates position role must plus minimum".split(/\s+/)
);
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const sentences = (text: string) => text
  .split(/(?<=[.!?;:])\s+|\n+|\s+[\u2022\u25cf\u25aa]\s+/)
  .map((item) => item.replace(/^[\s\-\u2013\u2014\u2022\u25cf\u25aa]+/, "").trim())
  .filter((item) => item.length >= 24);

export function keywords(text: string, max = 35) {
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#./-]{2,}/g) || [];
  const counts = new Map<string, number>();
  for (const raw of words) {
    const word = raw.replace(/^[./-]+|[./-]+$/g, "");
    if (word.length < 3 || STOP.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([word]) => word);
}

function requirementCandidates(job: string) {
  const cues = /\b(must|required|requirement|qualification|responsib|minimum|preferred|proficien|knowledge|ability|degree|certif|experience with|experience in|years of)\b/i;
  const items = sentences(job);
  const selected = items.filter((item) => cues.test(item) && item.length <= 420);
  const fallback = items.filter((item) => item.length <= 300).sort((a, b) => keywords(b).length - keywords(a).length);
  return [...new Set([...selected, ...fallback])].slice(0, 14);
}
function importance(requirement: string): RequirementAssessment["importance"] {
  if (/\b(preferred|nice to have|plus|desirable)\b/i.test(requirement)) return "preferred";
  if (/\b(must|required|minimum|mandatory|need to)\b/i.test(requirement)) return "required";
  return "general";
}
function assessRequirement(requirement: string, resumeSentences: string[]): RequirementAssessment {
  const terms = keywords(requirement, 16);
  let best = { coverage: 0, evidence: "" };
  for (const item of resumeSentences) {
    const lower = item.toLowerCase();
    const coverage = terms.length ? terms.filter((term) => lower.includes(term)).length / terms.length : 0;
    if (coverage > best.coverage) best = { coverage, evidence: item.slice(0, 320) };
  }
  const status = best.coverage >= 0.68 ? "strong" : best.coverage >= 0.4 ? "partial" : best.coverage >= 0.18 ? "mentioned" : "missing";
  const score = status === "strong" ? 100 : status === "partial" ? 65 : status === "mentioned" ? 35 : 0;
  return { requirement: requirement.slice(0, 360), importance: importance(requirement), status, score, ...(status !== "missing" && best.evidence ? { evidence: best.evidence } : {}) };
}
function scoreForTerms(resume: string, terms: string[]) {
  if (!terms.length) return 50;
  const lower = resume.toLowerCase();
  return clamp((terms.filter((term) => lower.includes(term)).length / terms.length) * 100);
}

export function offlineAnalysis(job: string, resume: string): Omit<AnalysisResult, "source"> {
  const resumeSentences = sentences(resume);
  const requirements = requirementCandidates(job).map((item) => assessRequirement(item, resumeSentences));
  const jobTerms = keywords(job);
  const resumeLower = resume.toLowerCase();
  const matchedTerms = jobTerms.filter((term) => resumeLower.includes(term)).slice(0, 18);
  const missingTerms = jobTerms.filter((term) => !resumeLower.includes(term)).slice(0, 14);
  const weights = requirements.map((item) => item.importance === "required" ? 1.35 : item.importance === "preferred" ? 0.75 : 1);
  const requirementScore = requirements.length
    ? requirements.reduce((sum, item, index) => sum + item.score * weights[index], 0) / weights.reduce((sum, weight) => sum + weight, 0)
    : scoreForTerms(resume, jobTerms);
  const seniorityText = job.match(/[^.!?]*(?:lead|leader|manage|director|executive|strategy|budget|stakeholder|governance|ownership)[^.!?]*/gi)?.join(" ") || "";
  const credentialText = job.match(/[^.!?]*(?:degree|certif|license|education|bachelor|master)[^.!?]*/gi)?.join(" ") || "";
  const seniorityTerms = keywords(seniorityText, 15);
  const credentialTerms = keywords(credentialText, 12);
  const achievementScore = clamp(Math.min(100, (resume.match(/\b\d+(?:[.,]\d+)?%?|\$\s?\d+/g)?.length || 0) * 12 + 35));
  const clarityScore = clamp(45 + Math.min(35, resumeSentences.filter((item) => item.length <= 240).length * 2) + Math.min(20, achievementScore / 5));
  const dimensions: Dimension[] = [
    { ...DIMENSIONS[0], score: scoreForTerms(resume, jobTerms.slice(0, 18)), confidence: 0.72 },
    { ...DIMENSIONS[1], score: clamp(requirementScore), confidence: 0.7 },
    { ...DIMENSIONS[2], score: clamp(requirementScore), confidence: 0.7 },
    { ...DIMENSIONS[3], score: scoreForTerms(resume, seniorityTerms), confidence: seniorityTerms.length ? 0.68 : 0.45 },
    { ...DIMENSIONS[4], score: achievementScore, confidence: 0.78 },
    { ...DIMENSIONS[5], score: credentialTerms.length ? scoreForTerms(resume, credentialTerms) : 70, confidence: credentialTerms.length ? 0.65 : 0.35 },
    { ...DIMENSIONS[6], score: clarityScore, confidence: 0.72 },
  ];
  const overall = clamp(dimensions.reduce((sum, item, index) => sum + item.score * DIMENSIONS[index].weight, 0));
  const recommendation = overall >= 80 ? "Strong alignment - apply" : overall >= 65 ? "Good alignment - apply" : overall >= 48 ? "Possible alignment - tailor first" : "Low demonstrated alignment";
  const evidence = matchedTerms.slice(0, 8).flatMap((term) => {
    const excerpt = resumeSentences.find((item) => item.toLowerCase().includes(term));
    return excerpt ? [{ term, excerpt: excerpt.slice(0, 280) }] : [];
  });
  return { provider: "offline", overall, recommendation, recommendationConfidence: 0.68, dimensions, requirements, matchedTerms, missingTerms, evidence };
}

export function mergeModelScores(base: Omit<AnalysisResult, "source">, provider: Provider, scores: Record<string, { score?: number; confidence?: number }>, recommendation?: { choice?: string; confidence?: number }, usage?: unknown): Omit<AnalysisResult, "source"> {
  const dimensions = base.dimensions.map((dimension) => {
    const model = scores[dimension.id];
    return model ? { ...dimension, score: clamp(Number(model.score ?? dimension.score)), confidence: Math.max(0, Math.min(1, Number(model.confidence ?? dimension.confidence))) } : dimension;
  });
  const overall = clamp(dimensions.reduce((sum, item, index) => sum + item.score * DIMENSIONS[index].weight, 0));
  return { ...base, provider, overall, dimensions, recommendation: recommendation?.choice || base.recommendation, recommendationConfidence: Number(recommendation?.confidence ?? base.recommendationConfidence), usage };
}
