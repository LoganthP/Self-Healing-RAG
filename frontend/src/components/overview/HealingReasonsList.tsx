import {
  AlertTriangle,
  FileQuestion,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Meter } from "../ui";
import { REASON_LABEL } from "../../lib/format";

export const REASON_HINT: Record<string, string> = {
  missing_information: "Retrieved chunks lacked key details required by the prompt.",
  unsupported_claims: "Drafted statement could not be strictly proven by citations.",
  irrelevant_evidence: "First-pass search returned chunks with low relevance scores.",
  empty_retrieval: "Initial query matched zero passages in the index.",
  no_relevant_evidence: "All candidate passages were filtered out by the relevance grader.",
  no_new_evidence: "Follow-up retrieval returned the same passages as before.",
  repeated_query: "Query rewrite produced identical search text, halting loop.",
  retry_budget_exhausted: "Maximum allowed corrective attempts was reached.",
  critic_abstained: "Verifier concluded documents cannot answer the question.",
  critic_output_invalid: "Verification step returned malformed or unparseable output.",
  provider_error: "Upstream LLM or embedding service returned an error.",
  no_documents: "No documents are currently indexed or in active scope.",
  missing_column: "Structured query referenced a column missing from the table.",
  out_of_range: "Queried dates fell outside the range of loaded records.",
  pipeline_error: "An unexpected exception occurred during execution.",
};

const REASON_ICON: Record<string, LucideIcon> = {
  missing_information: FileQuestion,
  unsupported_claims: ShieldAlert,
  irrelevant_evidence: Search,
  empty_retrieval: Search,
  no_relevant_evidence: Search,
  no_new_evidence: RefreshCw,
  repeated_query: RefreshCw,
  retry_budget_exhausted: RefreshCw,
  critic_abstained: ShieldAlert,
  critic_output_invalid: ShieldAlert,
  provider_error: AlertTriangle,
  no_documents: AlertTriangle,
  missing_column: FileQuestion,
  out_of_range: AlertTriangle,
  pipeline_error: AlertTriangle,
};

interface HealingReasonItem {
  reason: string;
  count: number;
}

interface HealingReasonsListProps {
  reasons: HealingReasonItem[];
  avgAttempts: number;
}

export function HealingReasonsList({ reasons, avgAttempts }: HealingReasonsListProps) {
  const max = Math.max(...reasons.map((x) => x.count), 1);

  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Why healing was needed</h2>
          <span className="text-xs text-muted">Ranked triggers</span>
        </div>

        {reasons.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/40 p-6 text-center">
            <Wrench className="mb-2 size-5 text-healing" />
            <p className="text-sm font-medium text-ink">No repairs needed yet</p>
            <p className="mt-1 text-xs text-muted max-w-xs">
              The self-healing loop triggers automatically when citations are missing, claims are unsupported, or search results need refinement.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {reasons.map((r, i) => {
              const Icon = REASON_ICON[r.reason] || Wrench;
              const title = REASON_LABEL[r.reason] ?? r.reason;
              const hint = REASON_HINT[r.reason] ?? "Corrective trigger invoked during answer verification.";

              return (
                <li
                  key={r.reason}
                  className="rounded-xl border border-line/60 bg-white/70 p-3 shadow-xs transition-colors hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-healing-soft text-healing text-[11px] font-bold">
                        #{i + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-sm text-ink">
                          <Icon className="size-3.5 text-healing shrink-0" />
                          <span>{title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{hint}</p>
                      </div>
                    </div>

                    <span className="num shrink-0 rounded-full bg-white border border-line px-2 py-0.5 text-xs font-semibold text-ink shadow-2xs">
                      {r.count} {r.count === 1 ? "time" : "times"}
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <Meter value={r.count / max} tone="healing" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-white/70 px-3.5 py-2 text-xs text-muted border border-line/50">
        <span>Average searches per question:</span>
        <span className="num font-semibold text-ink">{avgAttempts.toFixed(2)}</span>
      </div>
    </div>
  );
}

