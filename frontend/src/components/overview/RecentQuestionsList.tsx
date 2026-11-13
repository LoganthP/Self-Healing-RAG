import { Link } from "react-router-dom";
import { ArrowUpRight, MessageSquareText } from "lucide-react";
import type { Execution } from "../../types";
import { ms, timeAgo } from "../../lib/format";
import { Button, StatusPill, Tag } from "../ui";

interface RecentQuestionsListProps {
  recent: Execution[];
}

export function RecentQuestionsList({ recent }: RecentQuestionsListProps) {
  const maxLatency = Math.max(...recent.map((r) => r.latency_ms || 0), 1);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-muted">Recent questions</h2>
          <p className="text-xs text-muted">Full verification history and latency</p>
        </div>
        <Link
          to="/monitor"
          className="inline-flex items-center gap-1 text-sm font-semibold text-indigo hover:underline"
        >
          Open monitor <ArrowUpRight className="size-4" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/40 p-8 text-center">
          <MessageSquareText className="mb-2 size-6 text-faint" />
          <p className="text-sm font-medium text-ink">No questions asked yet</p>
          <p className="mt-1 text-xs text-muted max-w-sm">
            Questions asked via the Ask interface or evaluation suite will show their execution status, latency, and recovery path here.
          </p>
          <div className="mt-3">
            <Link to="/chat">
              <Button variant="soft">
                Ask a question
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-line/60">
          {recent.map((r) => {
            const latencyPct = Math.min(100, Math.max(8, (r.latency_ms / maxLatency) * 100));

            return (
              <Link
                key={r.execution_id}
                to="/monitor"
                className="group flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between rounded-xl px-2.5 transition-all hover:bg-white/90 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
              >
                {/* Left side: Status pill, question text, healed badge */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <StatusPill status={r.status} />
                  {r.healing?.triggered && (
                    <span className="shrink-0">
                      <Tag tone="healing">healed</Tag>
                    </span>
                  )}
                  <span className="truncate text-sm font-medium text-ink group-hover:text-indigo transition-colors">
                    {r.question}
                  </span>
                </div>

                {/* Right side: Latency bar, ms, relative time, arrow */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto text-xs text-muted">
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="h-1.5 w-20 sm:w-28 overflow-hidden rounded-full bg-line/60">
                      <div
                        className="h-full rounded-full bg-indigo transition-all duration-500"
                        style={{ width: `${latencyPct}%` }}
                      />
                    </div>
                  </div>

                  <span className="num w-14 text-right font-medium text-ink">
                    {ms(r.latency_ms)}
                  </span>
                  <span className="w-20 text-right text-faint">
                    {timeAgo(r.created_at)}
                  </span>
                  <ArrowUpRight className="size-4 text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-indigo" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
