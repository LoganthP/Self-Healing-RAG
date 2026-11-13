import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, Download, FlaskConical, Play } from "lucide-react";
import { api } from "../lib/api";
import type { EvalResult, EvalRun, EvalSummaryBlock, PipelineScore } from "../types";
import { ms, pct, timeAgo } from "../lib/format";
import { Button, EmptyState, ErrorNote, Meter, PageHeader, Panel, Spinner, StatusPill, Tag, cx } from "../components/ui";
import { usePoll } from "../hooks/usePoll";

type Key = keyof EvalSummaryBlock;
const METRICS: { key: Key; label: string; better: "high" | "low"; help: string }[] = [
  { key: "correct_abstention_rate", label: "Correct refusals", better: "high", help: "Unanswerable questions that were declined" },
  { key: "false_abstention_rate", label: "False refusals", better: "low", help: "Answerable questions that were declined" },
  { key: "groundedness", label: "Groundedness", better: "high", help: "Answer sentences that pass the support check" },
  { key: "citation_validity", label: "Valid citations", better: "high", help: "Answers whose citations all resolve" },
  { key: "unsupported_answer_rate", label: "Unsupported answers", better: "low", help: "Answers that miss the expected fact or should have been declined" },
  { key: "keyword_recall", label: "Keyword recall", better: "high", help: "Expected key facts present in answers" },
  { key: "answered_rate", label: "Answered", better: "high", help: "Questions that got an answer" },
];

function statusFor(s: PipelineScore) {
  return (s.status === "answered" ? "answered" : s.status) as "answered" | "accepted" | "abstained" | "error";
}

function ResultRow({ r }: { r: EvalResult }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line/60 align-top">
        <td className="py-2.5 pr-3">
          <button onClick={() => setOpen(!open)} className="flex items-start gap-1.5 text-left" aria-expanded={open}>
            <ChevronDown className={cx("mt-0.5 size-4 shrink-0 text-faint transition", open && "rotate-180")} />
            <span className="text-ink">{r.question}</span>
          </button>
        </td>
        <td className="py-2.5 pr-3">
          {r.answerable === false ? <Tag tone="neutral">not in docs</Tag> : <Tag tone="indigo">{r.category ?? "answerable"}</Tag>}
        </td>
        <td className="py-2.5 pr-3"><StatusPill status={statusFor(r.baseline)} /></td>
        <td className="py-2.5 pr-3">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <StatusPill status={statusFor(r.self_healing)} />
            {r.self_healing.healing_triggered && <Tag tone="healing">healed</Tag>}
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="pb-3">
            <div className="grid gap-3 md:grid-cols-2">
              {(["baseline", "self_healing"] as const).map((k) => (
                <div key={k} className="rounded-xl bg-white/80 p-3 text-xs">
                  <div className="mb-1 font-semibold text-muted">{k === "baseline" ? "Baseline RAG" : "Self-Healing RAG"}</div>
                  <p className="whitespace-pre-wrap leading-relaxed text-ink">{r[k].answer}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-faint">
                    <span>{ms(r[k].latency_ms)}</span>
                    <span>groundedness {pct(r[k].groundedness)}</span>
                    {r[k].keyword_recall != null && <span>keywords {pct(r[k].keyword_recall)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Evaluation() {
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [current, setCurrent] = useState<EvalRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(() => api.evaluations().then(setRuns).catch((e) => setError(e.message)), []);
  const loadRun = useCallback((id: string) => api.evaluation(id).then(setCurrent).catch((e) => setError(e.message)), []);

  useEffect(() => {
    api.evaluations().then((rs) => {
      setRuns(rs);
      if (rs[0]) loadRun(rs[0].id);
    }).catch((e) => setError(e.message));
  }, [loadRun]);

  const running = current?.status === "queued" || current?.status === "running";
  usePoll(() => current && loadRun(current.id), 1200, !!running);
  useEffect(() => {
    if (current && !running) loadRuns();
  }, [current?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const r = await api.startEvaluation([], `Run ${new Date().toLocaleString()}`);
      setCurrent(r);
      loadRuns();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const s = current?.summary;
  const chartData =
    s?.baseline && s?.self_healing
      ? METRICS.slice(0, 5).map((m) => ({
          name: m.label,
          Baseline: Math.round(((s.baseline![m.key] as number) ?? 0) * 100),
          "Self-healing": Math.round(((s.self_healing![m.key] as number) ?? 0) * 100),
        }))
      : [];

  return (
    <div>
      <PageHeader
        title="Evaluation lab"
        sub="Generates questions from your indexed documents, with expected answers computed from the data, then runs them through baseline RAG and Self-Healing RAG with the same index and model."
        actions={
          <>
            {current?.status === "completed" && (
              <Button variant="soft" icon={<Download className="size-4" />} onClick={() => window.open(api.exportUrl(current.id), "_blank")}>
                Export JSON
              </Button>
            )}
            <Button variant="primary" icon={<Play className="size-4" />} loading={starting} disabled={!!running} onClick={start}>
              Run evaluation
            </Button>
          </>
        }
      />
      {error && <div className="mb-3"><ErrorNote message={error} onDismiss={() => setError(null)} /></div>}

      {runs === null ? (
        <Spinner label="Loading" />
      ) : !current ? (
        <Panel>
          <EmptyState
            icon={<FlaskConical className="size-5" />}
            title="No evaluations yet"
            body="Index documents on the Documents page, then run the evaluation. Questions are generated from your data: rankings, counts, breakdowns, dates, document lookups, and some unanswerable ones."
            action={<Button variant="primary" onClick={start} loading={starting}>Run evaluation</Button>}
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {running && (
            <Panel className="p-4">
              <div className="mb-2 flex justify-between text-sm">
                <span className="font-semibold">Running both pipelines…</span>
                <span className="num text-muted">{current.progress} / {current.total}</span>
              </div>
              <Meter value={current.total ? current.progress / current.total : 0} />
            </Panel>
          )}
          {current.status === "failed" && <ErrorNote message={current.error ?? "The evaluation failed."} />}

          {s?.baseline && s?.self_healing && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <Panel className="p-5">
                <h2 className="mb-1 font-display text-base font-semibold">Baseline vs self-healing</h2>
                <p className="mb-4 text-xs text-muted">
                  Percentages, higher is better except for false refusals and unsupported answers. Automated proxy metrics; confirm with human review.
                </p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: -18 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5a6684" }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#8a94ad" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #d9e3ef", fontSize: 12 }} formatter={(v) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Baseline" fill="#94a3c4" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Self-healing" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel className="p-5">
                <h2 className="mb-3 font-display text-base font-semibold">All metrics</h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-faint">
                    <tr><th className="pb-2 font-medium">Metric</th><th className="pb-2 text-right font-medium">Baseline</th><th className="pb-2 text-right font-medium">Self-healing</th></tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m) => {
                      const b = s.baseline![m.key] as number | null;
                      const h = s.self_healing![m.key] as number | null;
                      const better = b != null && h != null && (m.better === "high" ? h > b : h < b);
                      return (
                        <tr key={m.key} className="border-t border-line/60" title={m.help}>
                          <td className="py-2 text-ink">{m.label}</td>
                          <td className="num py-2 text-right text-muted">{pct(b)}</td>
                          <td className={cx("num py-2 text-right font-semibold", better ? "text-accepted" : "text-ink")}>{pct(h)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-line/60">
                      <td className="py-2 text-ink">Searches per question</td>
                      <td className="num py-2 text-right text-muted">{s.baseline.avg_retrieval_attempts.toFixed(2)}</td>
                      <td className="num py-2 text-right font-semibold">{s.self_healing.avg_retrieval_attempts.toFixed(2)}</td>
                    </tr>
                    <tr className="border-t border-line/60">
                      <td className="py-2 text-ink">Latency p50</td>
                      <td className="num py-2 text-right text-muted">{ms(s.baseline.latency_p50_ms)}</td>
                      <td className="num py-2 text-right font-semibold">{ms(s.self_healing.latency_p50_ms)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted">
                  Model: {current.config?.provider === "offline" ? "offline extractive" : `${current.config?.provider} / ${current.config?.model}`}
                </p>
              </Panel>
            </div>
          )}

          {current.results && current.results.length > 0 && (
            <Panel className="p-5">
              <h2 className="mb-3 font-display text-base font-semibold">Per question</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-faint">
                    <tr><th className="pb-2 font-medium">Question</th><th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium">Baseline</th><th className="pb-2 font-medium">Self-healing</th></tr>
                  </thead>
                  <tbody>
                    {current.results.map((r, i) => <ResultRow key={`${r.question}-${i}`} r={r} />)}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {runs.length > 1 && (
            <Panel className="p-5">
              <h2 className="mb-2 font-display text-base font-semibold">Earlier runs</h2>
              <ul className="divide-y divide-line/60">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => loadRun(r.id)} className={cx("flex w-full items-center gap-3 py-2 text-left text-sm", r.id === current.id && "font-semibold text-indigo")}>
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="text-xs text-muted">{r.status}</span>
                      <span className="w-20 text-right text-xs text-faint">{timeAgo(r.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
