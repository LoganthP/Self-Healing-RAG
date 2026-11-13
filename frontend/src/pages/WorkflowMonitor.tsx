import { useCallback, useEffect, useState } from "react";
import { Search, Workflow } from "lucide-react";
import { api } from "../lib/api";
import type { Execution, ExecutionDetail } from "../types";
import { REASON_LABEL, ms, timeAgo } from "../lib/format";
import { EmptyState, ErrorNote, PageHeader, Panel, Spinner, StatusPill, Tag, cx } from "../components/ui";
import { GraphLegend, HealingGraph } from "../components/workflow/HealingGraph";
import { TraceTimeline } from "../components/workflow/TraceTimeline";
import { AnswerText } from "../components/chat/AnswerView";

const FILTERS = [
  { v: "", label: "All" },
  { v: "accepted", label: "Verified" },
  { v: "abstained", label: "Withheld" },
  { v: "error", label: "Errors" },
];

export default function WorkflowMonitor() {
  const [list, setList] = useState<Execution[] | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<ExecutionDetail | null>(null);
  const [loadingSel, setLoadingSel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .executions({ limit: 100, status, q, mode: "self_healing" })
      .then((rows) => {
        setList(rows);
        if (!sel && rows[0]) select(rows[0].execution_id);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q]);

  useEffect(() => {
    const t = window.setTimeout(load, 200);
    return () => window.clearTimeout(t);
  }, [load]);

  const select = async (id: string) => {
    setLoadingSel(true);
    try {
      setSel(await api.execution(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSel(false);
    }
  };

  const attempts = sel ? Array.from(new Set(sel.retrievals.map((r) => r.attempt))) : [];

  return (
    <div>
      <PageHeader title="Workflow monitor" sub="Replay any question through the graph: which nodes ran, what the verifier rejected, and how the search changed." />
      {error && <div className="mb-3"><ErrorNote message={error} onDismiss={() => setError(null)} /></div>}

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel className="flex max-h-[calc(100vh-150px)] flex-col p-3">
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search questions"
              className="w-full rounded-xl border border-line bg-white/90 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo/50 focus:ring-4 focus:ring-indigo/10"
            />
          </label>
          <div className="mb-2 flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.v}
                onClick={() => setStatus(f.v)}
                className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", status === f.v ? "bg-indigo text-white" : "bg-white/70 text-muted")}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto scroll-thin">
            {list === null && <Spinner label="Loading" />}
            {list?.length === 0 && <p className="p-3 text-sm text-muted">No runs match.</p>}
            {list?.map((r) => (
              <button
                key={r.execution_id}
                onClick={() => select(r.execution_id)}
                className={cx(
                  "w-full rounded-xl px-3 py-2.5 text-left transition",
                  sel?.execution_id === r.execution_id ? "bg-white shadow-sm" : "hover:bg-white/60",
                )}
              >
                <span className="line-clamp-2 text-sm font-medium text-ink">{r.question}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <StatusPill status={r.status} />
                  {r.healing.triggered && <Tag tone="healing">healed</Tag>}
                  <span className="ml-auto text-[11px] text-faint">{timeAgo(r.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          {!sel && !loadingSel && list?.length === 0 && (
            <Panel>
              <EmptyState icon={<Workflow className="size-5" />} title="No runs yet" body="Ask a question on the Ask page and its full trace will appear here." />
            </Panel>
          )}
          {loadingSel && !sel && <Spinner label="Loading run" />}
          {sel && (
            <>
              <Panel className="p-4">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
                  <h2 className="max-w-2xl font-display text-lg font-semibold">{sel.question}</h2>
                  <StatusPill status={sel.status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{sel.healing.retrieval_attempts} searches</span>
                  <span>{sel.healing.regeneration_attempts} rewrites</span>
                  <span className="num">{ms(sel.latency_ms)}</span>
                  <span>{sel.provider === "offline" ? "Offline extractive" : `${sel.provider} / ${sel.model}`}</span>
                  {sel.healing.reason && <span className="text-healing">{REASON_LABEL[sel.healing.reason] ?? sel.healing.reason}</span>}
                </div>
                <HealingGraph path={sel.path} running={false} height={330} />
                <GraphLegend />
              </Panel>

              <div className="grid gap-4 2xl:grid-cols-2">
                <Panel className="p-4">
                  <h3 className="mb-3 font-display text-sm font-semibold">Steps</h3>
                  <TraceTimeline steps={sel.steps} />
                </Panel>
                <div className="space-y-4">
                  <Panel className="p-4">
                    <h3 className="mb-3 font-display text-sm font-semibold">Final response</h3>
                    <AnswerText text={sel.answer} sources={sel.sources} onCite={() => {}} />
                  </Panel>
                  <Panel className="p-4">
                    <h3 className="mb-3 font-display text-sm font-semibold">Retrieved passages by attempt</h3>
                    {attempts.length === 0 && <p className="text-sm text-muted">No retrieval was recorded.</p>}
                    <div className="space-y-3">
                      {attempts.map((a) => {
                        const rows = sel.retrievals.filter((r) => r.attempt === a);
                        return (
                          <div key={a}>
                            <p className="mb-1.5 text-xs text-muted">
                              Attempt {a}: <span className="text-ink">“{rows[0]?.query}”</span>
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[360px] text-xs">
                                <thead className="text-left text-faint">
                                  <tr><th className="py-1 font-medium">Rank</th><th className="font-medium">Chunk</th><th className="font-medium">Score</th><th className="font-medium">Relevant</th></tr>
                                </thead>
                                <tbody>
                                  {rows.map((r) => (
                                    <tr key={r.chunk_id + a} className="border-t border-line/60">
                                      <td className="num py-1">{r.rank}</td>
                                      <td className="max-w-[220px] truncate font-mono text-[11px] text-muted">{r.chunk_id}</td>
                                      <td className="num">{r.score?.toFixed(3) ?? ""}</td>
                                      <td>
                                        <span className={cx("rounded-full px-2 py-px font-semibold", r.relevant ? "bg-accepted-soft text-accepted" : "bg-line/70 text-muted")}>
                                          {r.relevant ? "yes" : "no"}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
