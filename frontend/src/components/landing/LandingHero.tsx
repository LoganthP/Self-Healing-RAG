import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight, BookOpen, CheckCircle2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../../lib/api";
import { Button, ErrorNote, Panel, Tag } from "../ui";
import { GraphLegend, HealingGraph } from "../workflow/HealingGraph";

const HERO_LOOP_PATH = [
  "validate_input",
  "retrieve",
  "grade_relevance",
  "generate",
  "critique",
  "finalize",
];

const STEP_EXPLANATIONS: Record<string, string> = {
  validate_input: "Validating question premises & routing engine…",
  retrieve: "Retrieving grounded context from DuckDB & vector store…",
  grade_relevance: "Grading passage relevance against query intent…",
  generate: "Drafting answer with token-exact citations…",
  critique: "Verifier checking claims & recounting numbers…",
  finalize: "Claims 100% verified. Ready for delivery.",
};

export function LandingHero({ down }: { down: boolean }) {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [loadingSample, setLoadingSample] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-playing loop for hero visual
  const [stepIdx, setStepIdx] = useState(shouldReduceMotion ? HERO_LOOP_PATH.length : 1);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (shouldReduceMotion) {
      setStepIdx(HERO_LOOP_PATH.length);
      return;
    }

    if (isPaused) return;

    const interval = setInterval(() => {
      setStepIdx((prev) => {
        if (prev >= HERO_LOOP_PATH.length) {
          return 1; // Restart loop
        }
        return prev + 1;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [shouldReduceMotion, isPaused]);

  const currentPath = HERO_LOOP_PATH.slice(0, stepIdx);
  const currentNode = currentPath[currentPath.length - 1] ?? "validate_input";
  const isComplete = stepIdx === HERO_LOOP_PATH.length;

  const handleLoadSample = async () => {
    setErrorMsg(null);
    setLoadingSample(true);
    try {
      await api.loadSample();
      navigate("/chat");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load sample handbook.";
      setErrorMsg(msg);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleScrollToWorks = () => {
    const el = document.getElementById("how-it-works");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative overflow-hidden pt-8 pb-16 lg:pt-14 lg:pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Headlines & Call to Actions */}
          <motion.div
            className="flex flex-col lg:col-span-7"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {/* Pill Tag */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo/20 bg-indigo-soft/80 px-3 py-1 text-xs font-semibold text-indigo shadow-xs">
                <Sparkles className="size-3.5" />
                Verified, Grounded RAG Architecture
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accepted/20 bg-accepted-soft/80 px-3 py-1 text-xs font-semibold text-accepted">
                <ShieldCheck className="size-3.5" />
                Zero Hallucinations
              </span>
            </div>

            {/* Headline */}
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-[54px] lg:leading-[1.12]">
              Answers you can verify.{" "}
              <span className="bg-gradient-to-r from-indigo via-cyan to-accepted bg-clip-text text-transparent">
                Grounded, checked, and repaired
              </span>{" "}
              before you see them.
            </h1>

            {/* Sub-paragraph */}
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              Traditional RAG guesses when searches are fuzzy and hallucinates counts.
              Self-Healing RAG validates questions, executes SQL for exact numbers,
              cross-checks every claim with an independent critic, and repairs drafts before delivery.
            </p>

            {/* Offline notice banner if backend is unreachable */}
            {down && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-2xl border border-error/25 bg-error-soft/90 p-3.5 text-xs text-error"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <span className="size-2 rounded-full bg-error" />
                  Backend currently offline
                </div>
                <p className="mt-1 text-muted">
                  Interactive actions run once the server is started in <code className="font-mono text-ink">/backend</code>:
                </p>
                <code className="mt-1.5 block rounded-lg bg-white/80 p-2 font-mono text-[11px] text-ink select-all">
                  python -m uvicorn app.main:app --port 8000
                </code>
              </motion.div>
            )}

            {/* Error Message if Sample Loading Fails */}
            {errorMsg && (
              <div className="mt-5">
                <ErrorNote message={errorMsg} onDismiss={() => setErrorMsg(null)} />
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={handleLoadSample}
                loading={loadingSample}
                icon={<BookOpen className="size-4" />}
                className="h-11 px-5 text-sm font-semibold shadow-lg hover:shadow-indigo/25"
              >
                Try with the sample handbook
              </Button>

              <Button
                variant="soft"
                onClick={handleScrollToWorks}
                icon={<ArrowDown className="size-4 text-muted" />}
                className="h-11 px-4 text-sm font-semibold"
              >
                See how it works
              </Button>

              <Link to="/overview">
                <Button variant="ghost" className="h-11 px-3.5 text-sm font-medium">
                  <span>Explore overview</span>
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>

            {/* Value checklist */}
            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-line/60 pt-6 sm:grid-cols-3">
              <div className="flex items-center gap-2 text-xs font-medium text-ink">
                <CheckCircle2 className="size-4 text-accepted shrink-0" />
                <span>Exact SQL table recounts</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-ink">
                <CheckCircle2 className="size-4 text-accepted shrink-0" />
                <span>Independent critic check</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-ink">
                <CheckCircle2 className="size-4 text-accepted shrink-0" />
                <span>Honest abstention mode</span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Hero Visual - Self-Healing Loop Simulation */}
          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          >
            <Panel
              strong
              className="relative overflow-hidden p-5 shadow-2xl transition hover:shadow-indigo/10"
            >
              {/* Card Header with Status Tag & Loop Toggle */}
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-line/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold text-ink">
                    Live Execution Graph
                  </span>
                  <Tag tone={isComplete ? "neutral" : "healing"}>
                    {isComplete ? "Verified" : "Simulated run"}
                  </Tag>
                </div>

                <div className="flex items-center gap-2">
                  {!shouldReduceMotion && (
                    <button
                      onClick={() => setIsPaused((p) => !p)}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted transition hover:bg-white/80 hover:text-ink"
                      title={isPaused ? "Resume visual animation" : "Pause visual animation"}
                    >
                      {isPaused ? "Resume" : "Pause"}
                    </button>
                  )}
                  <button
                    onClick={() => setStepIdx(1)}
                    className="flex size-7 items-center justify-center rounded-lg text-muted transition hover:bg-white/80 hover:text-ink"
                    title="Replay graph traversal"
                    aria-label="Replay graph traversal"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Active Step Banner */}
              <div className="mb-3 rounded-xl bg-white/70 px-3.5 py-2.5 shadow-2xs border border-line/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-indigo animate-pulse" />
                    Step {stepIdx} of {HERO_LOOP_PATH.length}
                  </span>
                  <span className="text-[11px] text-muted capitalize font-mono">
                    {currentNode.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink font-medium leading-relaxed">
                  {STEP_EXPLANATIONS[currentNode]}
                </p>
              </div>

              {/* The Graph Canvas */}
              <div className="rounded-xl border border-line/50 bg-white/50 p-1">
                <HealingGraph
                  path={currentPath}
                  running={!isComplete}
                  height={280}
                />
              </div>

              {/* Legend Footer */}
              <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2.5">
                <GraphLegend />
                <Link
                  to="/monitor"
                  className="text-xs font-semibold text-indigo hover:underline"
                >
                  View monitor →
                </Link>
              </div>
            </Panel>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
