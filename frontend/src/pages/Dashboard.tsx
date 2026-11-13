import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../lib/api";
import type { Analytics } from "../types";
import { ErrorNote, Spinner, cx } from "../components/ui";
import { HeroTrust } from "../components/overview/HeroTrust";
import { HealingTile, LatencyTile, LibraryTile } from "../components/overview/KpiTile";
import { TrendAreaChart } from "../components/overview/TrendAreaChart";
import { HealingReasonsList } from "../components/overview/HealingReasonsList";
import { PipelineSnapshot } from "../components/overview/PipelineSnapshot";
import { RecentQuestionsList } from "../components/overview/RecentQuestionsList";

const tile = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.05,
      type: "spring" as const,
      stiffness: 220,
      damping: 24,
    },
  }),
};

function Tile({
  i,
  className,
  children,
  reducedMotion,
}: {
  i: number;
  className?: string;
  children: ReactNode;
  reducedMotion?: boolean | null;
}) {
  return (
    <motion.section
      custom={i}
      variants={
        reducedMotion
          ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
          : tile
      }
      initial="hidden"
      animate="show"
      className={cx("glass rounded-[22px] p-5 shadow-xs transition-shadow hover:shadow-sm", className)}
    >
      {children}
    </motion.section>
  );
}

export default function Dashboard() {
  const [a, setA] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    api.analytics().then(setA).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!a) return <Spinner label="Loading overview" />;

  const accepted = a.status_counts.accepted ?? 0;
  const withheld = a.status_counts.abstained ?? 0;
  const errors = a.status_counts.error ?? 0;
  const total = a.queries;

  const dailyHealed = a.daily.map((d) => (d.accepted || 0) + (d.abstained || 0));
  const recentLatencies = a.recent.map((r) => r.latency_ms || 0);
  const latestRun = a.recent && a.recent.length > 0 ? a.recent[0] : undefined;

  return (
    <div>
      <div className="grid auto-rows-min gap-4 md:grid-cols-6 xl:grid-cols-12">
        {/* 1. Hero trust ledger with ring gauge and quick actions */}
        <Tile
          i={0}
          reducedMotion={shouldReduceMotion}
          className="md:col-span-6 xl:col-span-8 xl:row-span-2 flex flex-col justify-center"
        >
          <HeroTrust
            queries={total}
            accepted={accepted}
            withheld={withheld}
            errors={errors}
            acceptedRate={a.accepted_rate}
            abstentionRate={a.abstention_rate}
            errorRate={a.error_rate}
          />
        </Tile>

        {/* 2. Healing KPI Tile */}
        <Tile
          i={1}
          reducedMotion={shouldReduceMotion}
          className="md:col-span-3 xl:col-span-4"
        >
          <HealingTile
            queries={total}
            healingRate={a.healing_rate}
            healingSuccessRate={a.healing_success_rate}
            dailyHealed={dailyHealed}
          />
        </Tile>

        {/* 3. Latency KPI Tile */}
        <Tile
          i={2}
          reducedMotion={shouldReduceMotion}
          className="md:col-span-3 xl:col-span-2"
        >
          <LatencyTile
            latencyP50={a.latency_p50_ms}
            latencyP95={a.latency_p95_ms}
            recentLatencies={recentLatencies}
          />
        </Tile>

        {/* 4. Library KPI Tile */}
        <Tile
          i={3}
          reducedMotion={shouldReduceMotion}
          className="md:col-span-3 xl:col-span-2"
        >
          <LibraryTile
            readyDocs={a.documents.ready}
            totalChunks={a.documents.chunks}
          />
        </Tile>

        {/* 5. 14-day Verification Trend Area Chart */}
        <Tile
          i={4}
          reducedMotion={shouldReduceMotion}
          className="md:col-span-6 xl:col-span-7"
        >
          <TrendAreaChart daily={a.daily} />
        </Tile>

        {/* 6. Why Healing Was Needed */}
        <Tile
          i={5}
          reducedMotion={shouldReduceMotion}
          className="md:col-span-6 xl:col-span-5"
        >
          <HealingReasonsList
            reasons={a.healing_reasons}
            avgAttempts={a.avg_retrieval_attempts}
          />
        </Tile>

        {/* 7. Pipeline snapshot for most recent query (hidden if no runs) */}
        {latestRun && (
          <Tile
            i={6}
            reducedMotion={shouldReduceMotion}
            className="md:col-span-6 xl:col-span-12"
          >
            <PipelineSnapshot latest={latestRun} />
          </Tile>
        )}

        {/* 8. Recent Questions list */}
        <Tile
          i={7}
          reducedMotion={shouldReduceMotion}
          className="md:col-span-6 xl:col-span-12"
        >
          <RecentQuestionsList recent={a.recent} />
        </Tile>
      </div>
    </div>
  );
}
