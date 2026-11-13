import type { ExecStatus } from "../types";

export const NODE_LABEL: Record<string, string> = {
  validate_input: "Check question",
  retrieve: "Retrieve",
  grade_relevance: "Grade relevance",
  generate: "Write answer",
  critique: "Verify",
  rewrite_query: "Rewrite search",
  finalize: "Deliver",
  abstain: "Withhold",
  handle_error: "Service error",
};

export const STATUS_META: Record<ExecStatus, { label: string; fg: string; bg: string; dot: string }> = {
  accepted: { label: "Verified", fg: "text-accepted", bg: "bg-accepted-soft", dot: "bg-accepted" },
  answered: { label: "Unverified", fg: "text-cyan", bg: "bg-cyan-soft", dot: "bg-cyan" },
  abstained: { label: "Withheld", fg: "text-withheld", bg: "bg-withheld-soft", dot: "bg-withheld" },
  error: { label: "Service error", fg: "text-error", bg: "bg-error-soft", dot: "bg-error" },
  running: { label: "Working", fg: "text-indigo", bg: "bg-indigo-soft", dot: "bg-indigo" },
};

export const REASON_LABEL: Record<string, string> = {
  missing_information: "Answer missed part of the question",
  unsupported_claims: "Answer had unsupported claims",
  irrelevant_evidence: "First search was off-target",
  empty_retrieval: "First search found nothing",
  no_relevant_evidence: "No relevant evidence",
  no_new_evidence: "Retry found nothing new",
  repeated_query: "Search couldn't be reformulated",
  retry_budget_exhausted: "Retry budget used up",
  critic_abstained: "Verifier judged it unanswerable",
  critic_output_invalid: "Verifier output invalid",
  provider_error: "Model service failed",
  no_documents: "No documents selected",
  missing_column: "Data has no matching column",
  out_of_range: "Asked about dates outside the data",
  pipeline_error: "Pipeline error",
};

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(digits)}%`;

export const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);

export const bytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const pageLabel = (a: number | null, b: number | null) =>
  a == null ? "" : a === b || b == null ? `p. ${a}` : `pp. ${a}–${b}`;
