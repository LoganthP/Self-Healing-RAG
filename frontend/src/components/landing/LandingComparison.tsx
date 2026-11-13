import { Check, X } from "lucide-react";

interface ComparisonRow {
  dimension: string;
  traditional: string;
  selfHealing: string;
}

const COMPARISONS: ComparisonRow[] = [
  {
    dimension: "Tabular Aggregation & Counting",
    traditional:
      "Embeds rows as text strings; asks LLM to guess sums, averages, or counts. Fails on tables with more than a few dozen rows.",
    selfHealing:
      "Direct DuckDB SQL execution. Accurately counts, groups, and sums over millions of rows in milliseconds.",
  },
  {
    dimension: "Hallucination Defense",
    traditional:
      "Zero post-generation verification. Models produce fluent, confident hallucinations on unfamiliar or dense material.",
    selfHealing:
      "Dedicated critic node verifies every single factual claim and recount against retrieved ground truth before delivery.",
  },
  {
    dimension: "Fuzzy or Off-Target Searches",
    traditional:
      "Sends whatever top-K passages scored highest into the prompt, even when topical relevance is low.",
    selfHealing:
      "Relevance grading gate. If coverage is inadequate, query is automatically rewritten with corpus vocabulary.",
  },
  {
    dimension: "Out-of-Scope / Missing Data",
    traditional:
      "Fabricates plausible estimates or extrapolates unknown historical years without signaling data absence.",
    selfHealing:
      "Honest abstention. Detects date or column boundary violations and explains why data cannot answer the question.",
  },
  {
    dimension: "Citation Integrity",
    traditional:
      " часто produces hallucinated citation markers, broken brackets, or points broadly to whole files.",
    selfHealing:
      "Token-exact citations mapped to specific document chunks, section headings, and table rows.",
  },
  {
    dimension: "Failure Mode",
    traditional:
      "Silent failure: delivers incorrect answers wrapped in convincing, professional-sounding prose.",
    selfHealing:
      "Safe, transparent failure: surfaces diagnostic reasons (e.g. out-of-range dates, missing information).",
  },
];

export function LandingComparison() {
  return (
    <section id="comparison" className="relative scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo/20 bg-indigo-soft/80 px-3 py-1 text-xs font-semibold text-indigo shadow-xs">
            Architectural Comparison
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Traditional RAG vs Self-Healing RAG
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Why simple vector similarity retrieval falls short on real-world enterprise documents and spreadsheets.
          </p>
        </div>

        {/* Comparison Table / Grid */}
        <div className="mt-12 overflow-hidden rounded-[24px] border border-line glass shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-line/60 bg-white/70">
            {/* Header / Column Labels on md+ */}
            <div className="p-5 font-display text-sm font-bold text-muted md:col-span-4 bg-glacier/40">
              Capability & Architecture
            </div>
            <div className="p-5 font-display text-sm font-bold text-ink md:col-span-4 flex items-center gap-2 bg-error-soft/30 text-error">
              <span className="flex size-5 items-center justify-center rounded-full bg-error text-white">
                <X className="size-3.5" />
              </span>
              Traditional Baseline RAG
            </div>
            <div className="p-5 font-display text-sm font-bold md:col-span-4 flex items-center gap-2 bg-accepted-soft/40 text-accepted">
              <span className="flex size-5 items-center justify-center rounded-full bg-accepted text-white">
                <Check className="size-3.5" />
              </span>
              Self-Healing RAG
            </div>
          </div>

          <div className="divide-y divide-line/60 bg-white/40">
            {COMPARISONS.map((row) => (
              <div
                key={row.dimension}
                className="grid grid-cols-1 md:grid-cols-12 transition-colors hover:bg-white/60"
              >
                {/* Dimension Title */}
                <div className="p-5 font-display text-sm font-semibold text-ink md:col-span-4 bg-glacier/20 flex items-center">
                  {row.dimension}
                </div>

                {/* Traditional Approach */}
                <div className="p-5 text-xs text-muted leading-relaxed md:col-span-4 border-t md:border-t-0 md:border-l border-line/50">
                  <div className="mb-1 text-[11px] font-bold text-error md:hidden">
                    Traditional Baseline:
                  </div>
                  {row.traditional}
                </div>

                {/* Self-Healing Approach */}
                <div className="p-5 text-xs text-ink leading-relaxed md:col-span-4 border-t md:border-t-0 md:border-l border-line/50 bg-accepted-soft/10 font-medium">
                  <div className="mb-1 text-[11px] font-bold text-accepted md:hidden">
                    Self-Healing RAG:
                  </div>
                  {row.selfHealing}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
