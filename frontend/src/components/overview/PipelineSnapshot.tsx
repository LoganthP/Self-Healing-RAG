import { Link } from "react-router-dom";
import { ArrowUpRight, Cpu } from "lucide-react";
import type { Execution } from "../../types";
import { ms, timeAgo } from "../../lib/format";
import { StatusPill, Tag } from "../ui";
import { HealingGraph } from "../workflow/HealingGraph";

interface PipelineSnapshotProps {
  latest?: Execution;
}

export function PipelineSnapshot({ latest }: PipelineSnapshotProps) {
  if (!latest) return null;

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-soft text-indigo">
            <Cpu className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Pipeline snapshot</h2>
            <p className="text-xs text-muted">Execution path of the most recent query</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="num text-xs text-faint">{timeAgo(latest.created_at)}</span>
          <Link
            to="/monitor"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo hover:underline"
          >
            Replay in monitor <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Query context card */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3.5 py-2.5 text-xs border border-line/60">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusPill status={latest.status} />
          {latest.healing?.triggered && <Tag tone="healing">healed</Tag>}
          <span className="truncate font-medium text-ink">"{latest.question}"</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-muted">
          <span>Latency: <strong className="num text-ink">{ms(latest.latency_ms)}</strong></span>
          <span>Searches: <strong className="num text-ink">{latest.healing?.retrieval_attempts ?? 1}</strong></span>
        </div>
      </div>

      {/* Workflow Graph */}
      <div className="rounded-xl border border-line/70 bg-white/80 p-1 shadow-inner overflow-hidden">
        <HealingGraph path={latest.path || []} running={false} height={190} />
      </div>
    </div>
  );
}

