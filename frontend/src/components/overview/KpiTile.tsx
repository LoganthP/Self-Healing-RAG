import { CheckCircle2, Database, ShieldAlert, Sparkles, Timer, Wrench } from "lucide-react";
import { Meter } from "../ui";
import { pct } from "../../lib/format";
import { CountUp } from "./CountUp";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

function MiniSparkline({ data, color = "#4f46e5", height = 24 }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 100;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-24 overflow-visible" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

export function HealingTile({
  queries,
  healingRate,
  healingSuccessRate,
  dailyHealed,
}: {
  queries: number;
  healingRate: number;
  healingSuccessRate: number;
  dailyHealed: number[];
}) {
  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-healing-soft text-healing">
              <Wrench className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-muted">Healing</h2>
          </div>
          <MiniSparkline data={dailyHealed} color="#c26a05" />
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="num font-display text-3xl font-semibold tracking-tight text-ink">
            <CountUp value={Math.round(healingRate * 100)} />%
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">of questions needed a second search or rewrite</p>

        {/* Dynamic recovery block / explanatory empty state */}
        <div className="mt-4">
          {queries === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-white/60 p-2.5 text-xs text-muted">
              <Sparkles className="size-3.5 shrink-0 text-healing" />
              <span>Repairs will trigger automatically when search evidence is incomplete.</span>
            </div>
          ) : healingRate === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-accepted-soft/60 p-2.5 text-xs text-accepted font-medium">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>100% of questions verified on first search without needing recovery.</span>
            </div>
          ) : healingSuccessRate === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-withheld-soft/60 p-2.5 text-xs text-withheld font-medium">
              <ShieldAlert className="size-3.5 shrink-0" />
              <span>Evidence fell short during repair; answers safely withheld.</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted">
                <span>Recovered into verified answer</span>
                <span className="num font-semibold text-ink">{pct(healingSuccessRate)}</span>
              </div>
              <Meter value={healingSuccessRate} tone="healing" />
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 border-t border-line/40 pt-2.5 text-[11px] text-faint">
        Corrective loops automatically refine search and rewrite claims.
      </p>
    </div>
  );
}

export function LatencyTile({
  latencyP50,
  latencyP95,
  recentLatencies,
}: {
  latencyP50: number;
  latencyP95: number;
  recentLatencies: number[];
}) {
  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-soft text-cyan">
              <Timer className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-muted">Latency</h2>
          </div>
          <MiniSparkline data={recentLatencies} color="#0891b2" />
        </div>

        <div className="mt-3">
          <div className="num font-display text-2xl font-semibold tracking-tight text-ink">
            <CountUp value={latencyP50} /> ms
          </div>
          <p className="text-xs text-muted">typical response (p50)</p>

          <div className="mt-2.5 border-t border-line/50 pt-2">
            <div className="num font-display text-lg font-semibold text-muted">
              <CountUp value={latencyP95} /> ms
            </div>
            <p className="text-xs text-muted">slow end (p95)</p>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-line/40 pt-2.5 text-[11px] text-faint">
        Total pipeline time including retrieval, critique, and synthesis.
      </p>
    </div>
  );
}

export function LibraryTile({
  readyDocs,
  totalChunks,
}: {
  readyDocs: number;
  totalChunks: number;
}) {
  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-soft text-indigo">
              <Database className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-muted">Library</h2>
          </div>
        </div>

        <div className="mt-3">
          <div className="num font-display text-2xl font-semibold tracking-tight text-ink">
            <CountUp value={readyDocs} />
          </div>
          <p className="text-xs text-muted">documents ready</p>

          <div className="mt-2.5 border-t border-line/50 pt-2">
            <div className="num font-display text-lg font-semibold text-muted">
              <CountUp value={totalChunks} formatter={(n) => n.toLocaleString()} />
            </div>
            <p className="text-xs text-muted">searchable passages</p>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-line/40 pt-2.5 text-[11px] text-faint">
        Indexed in local DuckDB with BM25 keyword and vector search.
      </p>
    </div>
  );
}
