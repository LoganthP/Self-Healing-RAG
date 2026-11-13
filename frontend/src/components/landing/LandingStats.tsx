import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Database, FileQuestion, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { api } from "../../lib/api";
import type { Analytics } from "../../types";
import { Panel } from "../ui";

function useCountUp(target: number, durationMs = 1200) {
  const [val, setVal] = useState(0);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (shouldReduce || target <= 0) {
      setVal(target);
      return;
    }

    let start = 0;
    const startTime = performance.now();

    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(start + (target - start) * eased);
      setVal(current);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    const id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [target, durationMs, shouldReduce]);

  return val;
}

function StatCard({
  icon: Icon,
  target,
  suffix = "",
  label,
  sub,
  tone = "indigo",
}: {
  icon: typeof Database;
  target: number;
  suffix?: string;
  label: string;
  sub: string;
  tone?: "indigo" | "accepted" | "cyan";
}) {
  const animatedVal = useCountUp(target);
  const toneClasses = {
    indigo: "text-indigo bg-indigo-soft/80 border-indigo/20",
    accepted: "text-accepted bg-accepted-soft/80 border-accepted/20",
    cyan: "text-cyan bg-cyan-soft/80 border-cyan/20",
  }[tone];

  return (
    <Panel className="p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className={`grid size-10 place-items-center rounded-xl border ${toneClasses}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <div className="font-display text-2xl font-bold tracking-tight text-ink num">
            {animatedVal}
            {suffix}
          </div>
          <div className="text-xs font-semibold text-ink">{label}</div>
        </div>
      </div>
      <p className="mt-2.5 text-xs text-muted leading-relaxed">{sub}</p>
    </Panel>
  );
}

export function LandingStats() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .analytics()
      .then((data) => {
        if (active) {
          setAnalytics(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setAnalytics(null);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const totalQueries = analytics?.queries ?? 0;
  const readyDocs = analytics?.documents?.ready ?? 0;
  const verifiedRatePct = Math.round((analytics?.accepted_rate ?? 0) * 100);

  const hasLiveStats = !loading && totalQueries > 0;

  return (
    <section className="relative z-10 py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {hasLiveStats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Database}
              target={readyDocs}
              label="Documents ready"
              sub="Profiled in DuckDB & indexed locally"
              tone="cyan"
            />
            <StatCard
              icon={FileQuestion}
              target={totalQueries}
              label="Questions asked"
              sub="Processed through the verification graph"
              tone="indigo"
            />
            <StatCard
              icon={CheckCircle}
              target={verifiedRatePct}
              suffix="%"
              label="Verified rate"
              sub="Ground-truth certified before delivery"
              tone="accepted"
            />
          </div>
        ) : (
          <Panel className="p-6 text-center shadow-xs">
            <div className="mx-auto flex max-w-lg flex-col items-center">
              <div className="grid size-10 place-items-center rounded-2xl bg-indigo-soft text-indigo">
                <Sparkles className="size-5" />
              </div>
              <h2 className="mt-3 font-display text-base font-semibold text-ink">
                Live Verification Metrics
              </h2>
              <p className="mt-1 text-sm text-muted">
                Your numbers appear here after your first question.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link
                  to="/chat"
                  className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo border border-line shadow-2xs hover:bg-white/80"
                >
                  Ask a test question →
                </Link>
                <Link
                  to="/documents"
                  className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-muted border border-line shadow-2xs hover:bg-white/80"
                >
                  Manage documents →
                </Link>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </section>
  );
}
