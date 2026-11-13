import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Info,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ExecStatus } from "../../types";
import { Button, Panel, StatusPill, Tag } from "../ui";
import { GraphLegend, HealingGraph } from "../workflow/HealingGraph";

interface StepDetail {
  node: string;
  name: string;
  tone: ExecStatus | "healing";
  title: string;
  explanation: string;
  evidenceSnippet?: string;
}

interface Scenario {
  id: "A" | "B" | "C" | "D";
  label: string;
  badge: string;
  query: string;
  finalVerdict: "accepted" | "withheld";
  path: string[];
  steps: StepDetail[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "A",
    label: "A · Verified first try",
    badge: "Clean Pass",
    query: "Which township reported the most emergency calls in 2023?",
    finalVerdict: "accepted",
    path: ["validate_input", "retrieve", "grade_relevance", "generate", "critique", "finalize"],
    steps: [
      {
        node: "validate_input",
        name: "Check question",
        tone: "running",
        title: "Question validation passed",
        explanation: "Input matches known tabular schema. Routing directly to DuckDB SQL aggregation engine.",
      },
      {
        node: "retrieve",
        name: "Retrieve",
        tone: "running",
        title: "DuckDB SQL Scan",
        explanation: "Scanned 663,522 rows in 42 ms: SELECT township, count(*) FROM data GROUP BY township ORDER BY 2 DESC.",
        evidenceSnippet: "Top row: Lower Merion (8,421 calls). Second: Abington (6,110 calls).",
      },
      {
        node: "grade_relevance",
        name: "Grade relevance",
        tone: "running",
        title: "Relevance score: 1.0",
        explanation: "All requested aggregation dimensions ('township', 'call count') are completely present.",
      },
      {
        node: "generate",
        name: "Write answer",
        tone: "running",
        title: "Drafting answer",
        explanation: "Drafted: 'Lower Merion had the most calls with 8,421 occurrences in 2023.'",
      },
      {
        node: "critique",
        name: "Verify",
        tone: "accepted",
        title: "Critic verification: Certified",
        explanation: "Independent recount over raw table confirms Lower Merion = 8,421 calls. 100% accurate.",
      },
      {
        node: "finalize",
        name: "Deliver",
        tone: "accepted",
        title: "Verified delivery",
        explanation: "Status: Verified. Answer delivered with direct SQL aggregation proofs.",
      },
    ],
  },
  {
    id: "B",
    label: "B · Weak search then rewrite",
    badge: "Self-Healed",
    query: "What is the policy for infected employee laptops?",
    finalVerdict: "accepted",
    path: [
      "validate_input",
      "retrieve",
      "grade_relevance",
      "rewrite_query",
      "retrieve",
      "grade_relevance",
      "generate",
      "critique",
      "finalize",
    ],
    steps: [
      {
        node: "validate_input",
        name: "Check question",
        tone: "running",
        title: "Routing to handbook prose",
        explanation: "Identified security handbook inquiry. Activating hybrid BM25 and dense embeddings.",
      },
      {
        node: "retrieve",
        name: "First retrieve",
        tone: "running",
        title: "Passage search: 'infected laptops'",
        explanation: "Initial retrieval matched general asset handling and hardware return policies.",
      },
      {
        node: "grade_relevance",
        name: "Grade relevance",
        tone: "healing",
        title: "Low relevance score: 0.32",
        explanation: "Missing specific malware isolation procedures. Threshold 0.50 not met. Triggering repair loop.",
      },
      {
        node: "rewrite_query",
        name: "Rewrite search",
        tone: "healing",
        title: "Query reformulation",
        explanation: "Self-healing rewriter transforms query using corpus vocabulary: 'quarantine endpoint isolation malware incident response'.",
      },
      {
        node: "retrieve",
        name: "Second retrieve",
        tone: "running",
        title: "Second passage search",
        explanation: "Retrieved Section 4.2: 'Immediate Endpoint Isolation and Token Revocation Protocols'.",
        evidenceSnippet: "'Immediately disconnect host from Wi-Fi/Ethernet; revoke SSO session; alert CSIRT within 15 minutes.'",
      },
      {
        node: "grade_relevance",
        name: "Grade relevance",
        tone: "running",
        title: "Relevance score: 0.95",
        explanation: "High confidence match. Procedural requirements and timelines discovered.",
      },
      {
        node: "generate",
        name: "Write answer",
        tone: "running",
        title: "Drafting answer",
        explanation: "Generated answer with Section 4.2 citations.",
      },
      {
        node: "critique",
        name: "Verify",
        tone: "accepted",
        title: "Critic verification: Passed",
        explanation: "All procedural steps verified against handbook Section 4.2 text.",
      },
      {
        node: "finalize",
        name: "Deliver",
        tone: "accepted",
        title: "Verified delivery",
        explanation: "Status: Verified after 1 query rewrite and 2 retrieval iterations.",
      },
    ],
  },
  {
    id: "C",
    label: "C · Fabricated claim caught",
    badge: "Repair Triggered",
    query: "What are password requirements and what is the fine for non-compliance?",
    finalVerdict: "accepted",
    path: [
      "validate_input",
      "retrieve",
      "grade_relevance",
      "generate",
      "critique",
      "generate",
      "critique",
      "finalize",
    ],
    steps: [
      {
        node: "validate_input",
        name: "Check question",
        tone: "running",
        title: "Input validated",
        explanation: "Valid query regarding password management policy.",
      },
      {
        node: "retrieve",
        name: "Retrieve",
        tone: "running",
        title: "Handbook Section 2.1 Retrieved",
        explanation: "Retrieved authentication standards and hashing requirements.",
      },
      {
        node: "grade_relevance",
        name: "Grade relevance",
        tone: "running",
        title: "Relevance score: 0.88",
        explanation: "Passages cover complexity and hashing, but no financial penalty found.",
      },
      {
        node: "generate",
        name: "Write answer (Draft 1)",
        tone: "running",
        title: "Initial draft generated",
        explanation: "LLM drafted: 'Passwords require 14 chars with Argon2id. Non-compliance incurs a $50 payroll deduction.'",
      },
      {
        node: "critique",
        name: "Verify (Critique 1)",
        tone: "error",
        title: "HALLUCINATION DETECTED",
        explanation: "Critic flags unsupported claim: '$50 payroll deduction' does not exist anywhere in Section 2.1.",
      },
      {
        node: "generate",
        name: "Repair draft",
        tone: "healing",
        title: "Targeted regeneration",
        explanation: "Redrafting with strict constraint: strip unsupported monetary claim and ground solely in Section 2.1.",
      },
      {
        node: "critique",
        name: "Verify (Critique 2)",
        tone: "accepted",
        title: "Second check passed",
        explanation: "Repaired draft: 14+ characters, Argon2id, lockout after 5 tries. 100% grounded.",
      },
      {
        node: "finalize",
        name: "Deliver",
        tone: "accepted",
        title: "Verified delivery",
        explanation: "Status: Verified. Hallucinated penalty prevented from reaching user.",
      },
    ],
  },
  {
    id: "D",
    label: "D · Unanswerable then withheld",
    badge: "Honest Withhold",
    query: "What was the total operating budget in fiscal year 2011?",
    finalVerdict: "withheld",
    path: ["validate_input", "retrieve", "grade_relevance", "abstain"],
    steps: [
      {
        node: "validate_input",
        name: "Check question",
        tone: "running",
        title: "Analyzing premise & temporal scope",
        explanation: "Target year: 2011. Querying system metadata for table boundaries.",
      },
      {
        node: "retrieve",
        name: "Retrieve",
        tone: "running",
        title: "Metadata scan",
        explanation: "Retrieved financial ledger metadata: Recorded range is strictly 2018 to 2024.",
      },
      {
        node: "grade_relevance",
        name: "Grade relevance",
        tone: "abstained",
        title: "Out-of-range premise",
        explanation: "No records exist for year 2011. Available data begins January 2018.",
      },
      {
        node: "abstain",
        name: "Withhold",
        tone: "abstained",
        title: "Declined with diagnostic reason",
        explanation: "Status: Withheld. 'Dataset records begin in 2018. Cannot calculate fiscal year 2011.'",
      },
    ],
  },
];

export function LandingDemo() {
  const shouldReduceMotion = useReducedMotion();
  const [selectedScenarioId, setSelectedScenarioId] = useState<"A" | "B" | "C" | "D">("B");
  const scenario = SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[1];

  const [stepIndex, setStepIndex] = useState(scenario.steps.length - 1);
  const [isPlaying, setIsPlaying] = useState(!shouldReduceMotion);

  // Reset step index when scenario changes
  useEffect(() => {
    setStepIndex(shouldReduceMotion ? scenario.steps.length - 1 : 0);
    setIsPlaying(!shouldReduceMotion);
  }, [selectedScenarioId, shouldReduceMotion, scenario.steps.length]);

  // Stepping timer
  useEffect(() => {
    if (shouldReduceMotion || !isPlaying) return;

    const timer = setInterval(() => {
      setStepIndex((curr) => {
        if (curr >= scenario.steps.length - 1) {
          setIsPlaying(false);
          return curr;
        }
        return curr + 1;
      });
    }, 2200);

    return () => clearInterval(timer);
  }, [isPlaying, scenario.steps.length, shouldReduceMotion]);

  const activeStep = scenario.steps[stepIndex] ?? scenario.steps[0];
  const accumulatedPath = scenario.path.slice(0, stepIndex + 1);
  const isFinished = stepIndex === scenario.steps.length - 1;

  return (
    <section id="demo" className="relative scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-healing/25 bg-healing-soft px-3 py-1 text-xs font-semibold text-healing shadow-xs">
            <Sparkles className="size-3.5" />
            Interactive Workflow Demonstration
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Watch the healing loop in action
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            See how the system intercepts low relevance, catches ungrounded numbers,
            and honestly withholds when data is missing.
          </p>
        </div>

        {/* Scripted Disclaimer Badge */}
        <div className="mt-6 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-xl bg-white/80 px-3.5 py-1.5 text-xs text-muted shadow-2xs border border-line">
            <Info className="size-3.5 text-indigo" />
            <span>Illustrative run, not live model output</span>
          </div>
        </div>

        {/* Scenario Tabs */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {SCENARIOS.map((sc) => {
            const isSelected = sc.id === selectedScenarioId;
            return (
              <button
                key={sc.id}
                onClick={() => setSelectedScenarioId(sc.id)}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-white text-indigo shadow-md ring-2 ring-indigo/40"
                    : "glass text-muted hover:bg-white/80 hover:text-ink"
                }`}
              >
                <span>{sc.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    sc.finalVerdict === "accepted"
                      ? "bg-accepted-soft text-accepted"
                      : "bg-withheld-soft text-withheld"
                  }`}
                >
                  {sc.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Demo Box */}
        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left / Upper: The Question & Active Step Details */}
          <Panel strong className="flex flex-col gap-4 p-6 lg:col-span-5 shadow-xl">
            {/* Question Card */}
            <div className="rounded-2xl border border-line/60 bg-white/80 p-4 shadow-2xs">
              <div className="text-[11px] font-bold tracking-wider text-muted uppercase">
                Tested User Query
              </div>
              <div className="mt-1 font-display text-sm font-semibold text-ink sm:text-base">
                "{scenario.query}"
              </div>
            </div>

            {/* Stepper Controls */}
            <div className="flex items-center justify-between border-y border-line/60 py-3">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="soft"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="size-8 p-0"
                  aria-label={isPlaying ? "Pause simulation" : "Play simulation"}
                >
                  {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStepIndex(0);
                    setIsPlaying(true);
                  }}
                  className="size-8 p-0"
                  aria-label="Replay simulation"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>

              <div className="text-xs font-medium text-muted">
                Step <span className="font-bold text-ink">{stepIndex + 1}</span> of{" "}
                <span className="font-bold text-ink">{scenario.steps.length}</span>
              </div>

              <div className="flex gap-1">
                {scenario.steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setStepIndex(i);
                      setIsPlaying(false);
                    }}
                    className={`size-2.5 rounded-full transition-all ${
                      i === stepIndex
                        ? "bg-indigo scale-125"
                        : i < stepIndex
                          ? "bg-indigo/35"
                          : "bg-line"
                    }`}
                    aria-label={`Jump to step ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Step Detail Card */}
            <motion.div
              key={`${scenario.id}-${stepIndex}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-line bg-white/90 p-4.5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                {activeStep.tone === "healing" ? (
                  <Tag tone="healing">Healing</Tag>
                ) : (
                  <StatusPill status={activeStep.tone} />
                )}
                <span className="font-mono text-[11px] font-semibold text-muted">
                  {activeStep.node}
                </span>
              </div>

              <h4 className="mt-2.5 font-display text-base font-bold text-ink">
                {activeStep.title}
              </h4>
              <p className="mt-1.5 text-xs text-muted leading-relaxed">
                {activeStep.explanation}
              </p>

              {activeStep.evidenceSnippet && (
                <div className="mt-3 rounded-xl bg-glacier/70 border border-cyan/20 p-2.5 text-[11px] font-mono text-ink leading-relaxed">
                  <div className="text-[10px] font-bold text-cyan uppercase mb-1">
                    Grounded Evidence Excerpt
                  </div>
                  {activeStep.evidenceSnippet}
                </div>
              )}
            </motion.div>

            {/* Run Real Test CTA */}
            <div className="mt-auto pt-2 flex flex-col gap-2">
              <Link to="/chat">
                <Button variant="primary" className="w-full justify-center gap-2 py-2.5 shadow-md">
                  <span>Run it for real in Chat</span>
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </Panel>

          {/* Right / Lower: The Interactive Graph */}
          <Panel strong className="flex flex-col p-6 lg:col-span-7 shadow-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-ink">
                  Graph Traversal View
                </h3>
                <p className="text-xs text-muted">
                  Active execution highlighting nodes and loop transitions
                </p>
              </div>

              <Tag tone={isFinished ? "neutral" : "healing"}>
                {isFinished ? "Path Complete" : "Traversing…"}
              </Tag>
            </div>

            <div className="rounded-2xl border border-line/60 bg-white/70 p-2">
              <HealingGraph
                path={accumulatedPath}
                running={!isFinished}
                height={350}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-3">
              <GraphLegend />
              <Link
                to="/monitor"
                className="text-xs font-semibold text-indigo hover:underline"
              >
                Inspect workflow monitor →
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}
