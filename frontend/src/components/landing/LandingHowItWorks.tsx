import { Database, Filter, RefreshCw, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { Panel } from "../ui";

const STEPS = [
  {
    num: "01",
    icon: Database,
    title: "Dual-Engine Retrieval",
    subtitle: "DuckDB SQL for tables + BM25/MiniLM for prose",
    description:
      "Tabular data is never embedded row-by-row into noisy text passages. Questions requiring aggregation or counts run as exact SQL over every row in DuckDB. Policy and technical documents are searched via hybrid BM25 and dense MiniLM vectors.",
    badge: "Full-dataset coverage",
    tone: "cyan",
  },
  {
    num: "02",
    icon: Filter,
    title: "Relevance Grading",
    subtitle: "Precision assessment before generation",
    description:
      "Retrieved passages and table records are evaluated for topical relevance. If coverage is incomplete or ambiguous, the query is immediately reformulated with vocabulary drawn directly from the corpus, preventing hallucinations before generation begins.",
    badge: "Threshold gate",
    tone: "indigo",
  },
  {
    num: "03",
    icon: ShieldCheck,
    title: "Independent Verification",
    subtitle: "Ground-truth checks & number recounts",
    description:
      "A dedicated critic checks the drafted response against source evidence. Aggregation numbers are independently recomputed via SQL. Every factual sentence is validated against the raw document passages it cites.",
    badge: "Critic certification",
    tone: "accepted",
  },
  {
    num: "04",
    icon: RefreshCw,
    title: "Targeted Repair or Abstain",
    subtitle: "Bounded loop or honest withhold",
    description:
      "When a check fails, the critic diagnoses the exact discrepancy (e.g. unsupported claim, misidentified column) and initiates a targeted repair (bounded to 3 attempts). If the data simply cannot answer the question, it honestly withholds.",
    badge: "Bounded self-healing",
    tone: "healing",
  },
];

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo/20 bg-indigo-soft/80 px-3 py-1 text-xs font-semibold text-indigo shadow-xs">
            Architectural Pipeline
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            How Self-Healing RAG works
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg leading-relaxed">
            A closed-loop verification pipeline that prevents silent hallucinations
            before answers reach your users.
          </p>
        </div>

        {/* 4 Steps with connecting timeline */}
        <div className="relative mt-14">
          {/* Animated SVG connecting line on desktop */}
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 hidden -translate-y-12 lg:block" aria-hidden="true">
            <svg className="w-full h-8" preserveAspectRatio="none" viewBox="0 0 1000 30">
              <motion.path
                d="M 50 15 L 950 15"
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2.5"
                strokeDasharray="6 6"
                initial={{ pathLength: 0, opacity: 0.2 }}
                whileInView={{ pathLength: 1, opacity: 0.8 }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, ease: "easeInOut" }}
              />
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0891b2" />
                  <stop offset="35%" stopColor="#4f46e5" />
                  <stop offset="70%" stopColor="#059669" />
                  <stop offset="100%" stopColor="#c26a05" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: idx * 0.12 }}
                >
                  <Panel className="relative flex h-full flex-col p-6 shadow-sm lift">
                    {/* Step badge & Icon */}
                    <div className="flex items-center justify-between">
                      <span className="font-display text-2xl font-black text-indigo/30 num">
                        {step.num}
                      </span>
                      <div className="grid size-11 place-items-center rounded-2xl bg-white text-indigo shadow-xs border border-line">
                        <Icon className="size-5" />
                      </div>
                    </div>

                    <h3 className="mt-5 font-display text-lg font-bold text-ink">
                      {step.title}
                    </h3>
                    <div className="text-xs font-semibold text-indigo mt-0.5">
                      {step.subtitle}
                    </div>

                    <p className="mt-3 text-xs text-muted leading-relaxed flex-1">
                      {step.description}
                    </p>

                    <div className="mt-5 border-t border-line/60 pt-3">
                      <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-ink border border-line shadow-2xs">
                        {step.badge}
                      </span>
                    </div>
                  </Panel>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
