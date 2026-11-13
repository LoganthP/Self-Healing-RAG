import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Cpu,
  FileCheck2,
  FileSpreadsheet,
  FlaskConical,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { Panel, Tag } from "../ui";

export function LandingFeatures() {
  return (
    <section id="features" className="relative scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan/20 bg-cyan-soft/80 px-3 py-1 text-xs font-semibold text-cyan shadow-xs">
            <Sparkles className="size-3.5" />
            Core Capabilities
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Engineered for high-stakes accuracy
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Every feature was built to replace blind generation with deterministic,
            verifiable truth.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Card 1: Verified Citations (Col Span 2) */}
          <motion.div
            className="md:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <Panel className="group relative flex h-full flex-col justify-between p-7 shadow-sm lift">
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-indigo-soft text-indigo border border-indigo/20">
                    <FileCheck2 className="size-5" />
                  </div>
                  <Tag tone="indigo">Exact attribution</Tag>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-ink">
                  Verified Citations with Exact Spans
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Every delivered sentence maps directly to a chunk, document page, or raw SQL row.
                  No hallucinated citations or generic references—click any citation to view the
                  underlying source passage.
                </p>

                {/* Visual Preview */}
                <div className="mt-5 rounded-2xl border border-line/60 bg-white/70 p-3.5 text-xs">
                  <div className="flex items-center gap-2 font-mono text-[11px] text-muted mb-1.5">
                    <span className="font-semibold text-indigo">Source match:</span>
                    <span>security_handbook.md · Section 4.2 · p. 18</span>
                  </div>
                  <div className="rounded-xl bg-glacier/80 p-2.5 text-xs text-ink border border-cyan/20 italic">
                    "All production tokens must be rotated every 90 days with zero grace period."
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                <span className="text-xs font-semibold text-muted">Explorable in Documents</span>
                <Link
                  to="/documents"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo hover:underline"
                >
                  Browse documents <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Panel>
          </motion.div>

          {/* Card 2: Bounded Self-Healing (Col Span 1) */}
          <motion.div
            className="md:col-span-1"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Panel className="group relative flex h-full flex-col justify-between p-7 shadow-sm lift">
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-healing-soft text-healing border border-healing/20">
                    <RefreshCw className="size-5" />
                  </div>
                  <Tag tone="healing">Loop protection</Tag>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-ink">
                  Bounded Self-Healing
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  The healing loop operates within strict deterministic limits: max 3 retrieval attempts
                  and 1 query rewrite. This prevents runaway latency, token spikes, and infinite loops.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                <span className="text-xs font-semibold text-muted">Configurable in Settings</span>
                <Link
                  to="/monitor"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo hover:underline"
                >
                  Open monitor <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Panel>
          </motion.div>

          {/* Card 3: Withholds Instead of Guessing (Col Span 1) */}
          <motion.div
            className="md:col-span-1"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <Panel className="group relative flex h-full flex-col justify-between p-7 shadow-sm lift">
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-withheld-soft text-withheld border border-withheld/20">
                    <CircleSlash className="size-5" />
                  </div>
                  <Tag tone="neutral">Truth first</Tag>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-ink">
                  Honest Abstention
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  When a question asks for a time period, column, or fact that doesn't exist in the data,
                  the system clearly declines and explains why—never fabricating estimates.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                <span className="text-xs font-semibold text-muted">Try in Ask interface</span>
                <Link
                  to="/chat"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo hover:underline"
                >
                  Ask a question <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Panel>
          </motion.div>

          {/* Card 4: Any Data Format + Auto-Cleaning (Col Span 2) */}
          <motion.div
            className="md:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Panel className="group relative flex h-full flex-col justify-between p-7 shadow-sm lift">
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-cyan-soft text-cyan border border-cyan/20">
                    <FileSpreadsheet className="size-5" />
                  </div>
                  <Tag tone="cyan">Fast DuckDB Ingest</Tag>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-ink">
                  Multi-Format Ingestion & Automated Cleaning
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Upload PDF, Word, Excel, CSV, JSON, HTML, Markdown, and ZIP archives up to 16 GB.
                  DuckDB bulk-loads tables in parallel in seconds (1.1M rows in ~11s). Ingestion
                  automatically removes duplicate rows, blank columns, and repeated boilerplate.
                </p>

                {/* Formats Badges */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {["CSV", "PDF", "XLSX", "DOCX", "JSON", "HTML", "Markdown", "ZIP (up to 16 GB)"].map(
                    (fmt) => (
                      <span
                        key={fmt}
                        className="rounded-lg bg-white/90 border border-line px-2.5 py-1 text-[11px] font-mono font-semibold text-ink shadow-2xs"
                      >
                        {fmt}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                <span className="text-xs font-semibold text-muted">Upload & Manage Datasets</span>
                <Link
                  to="/documents"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo hover:underline"
                >
                  Open documents <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Panel>
          </motion.div>

          {/* Card 5: Local or Hosted Models (Col Span 1) */}
          <motion.div
            className="md:col-span-1"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <Panel className="group relative flex h-full flex-col justify-between p-7 shadow-sm lift">
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-white text-ink border border-line">
                    <Cpu className="size-5" />
                  </div>
                  <Tag tone="neutral">Privacy-first</Tag>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-ink">
                  Local or Hosted Models
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Run 100% offline with deterministic extraction, run locally via Ollama, or connect
                  hosted Groq & OpenAI.
                </p>
                <div className="mt-3 rounded-xl bg-accepted-soft/60 border border-accepted/20 p-2.5 text-[11px] text-ink flex items-start gap-2">
                  <Lock className="size-3.5 text-accepted shrink-0 mt-0.5" />
                  <span>
                    <strong>Privacy note:</strong> API keys stay strictly on your local backend and are never sent to the browser.
                  </span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                <span className="text-xs font-semibold text-muted">Configure providers</span>
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo hover:underline"
                >
                  View settings <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Panel>
          </motion.div>

          {/* Card 6: Side-by-Side Evaluation Lab (Col Span 2) */}
          <motion.div
            className="md:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Panel className="group relative flex h-full flex-col justify-between p-7 shadow-sm lift">
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-indigo-soft text-indigo border border-indigo/20">
                    <FlaskConical className="size-5" />
                  </div>
                  <Tag tone="indigo">Side-by-side benchmark</Tag>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-ink">
                  Built-In Evaluation Lab
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Test your actual documents with golden benchmark questions generated from your data.
                  Run baseline RAG vs Self-Healing RAG side by side to compare groundedness, citation validity,
                  and correct refusals.
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/80 border border-line px-2.5 py-1 text-ink">
                    <CheckCircle2 className="size-3.5 text-accepted" /> Groundedness scoring
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/80 border border-line px-2.5 py-1 text-ink">
                    <CheckCircle2 className="size-3.5 text-accepted" /> Citation validity check
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/80 border border-line px-2.5 py-1 text-ink">
                    <CheckCircle2 className="size-3.5 text-accepted" /> Exportable JSON runs
                  </span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                <span className="text-xs font-semibold text-muted">Benchmark your corpus</span>
                <Link
                  to="/evaluation"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo hover:underline"
                >
                  Open evaluation lab <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Panel>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
