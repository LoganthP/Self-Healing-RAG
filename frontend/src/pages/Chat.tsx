import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp, Bug, Database, FileText, MessageSquarePlus, ThumbsDown, ThumbsUp, Trash2, Waypoints,
} from "lucide-react";
import { api, streamQuery } from "../lib/api";
import type { ChatMessage, DocumentItem, Execution, SessionItem, Source, Step } from "../types";
import { REASON_LABEL, ms, timeAgo } from "../lib/format";
import { Button, EmptyState, ErrorNote, Panel, Spinner, StatusPill, Tag, cx } from "../components/ui";
import { AnswerText, SourceDrawer, SourceList } from "../components/chat/AnswerView";
import { GraphLegend, HealingGraph } from "../components/workflow/HealingGraph";
import { TraceTimeline } from "../components/workflow/TraceTimeline";

interface LocalMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  execution: Execution | null;
  pending?: boolean;
  error?: string;
}

// Used only if the backend can't generate questions from the indexed documents.
const SAMPLE_QUESTIONS = [
  "What is the difference between symmetric and asymmetric encryption?",
  "How must passwords be stored?",
  "What minimum RSA key size is required and what should new services prefer?",
  "What is the annual budget for the security team?",
];

function AssistantCard({
  m, active, onTrace, onFeedback,
}: { m: LocalMsg; active: boolean; onTrace: () => void; onFeedback: (r: 1 | -1) => void }) {
  const [open, setOpen] = useState<Source | null>(null);
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const ex = m.execution;

  if (m.pending)
    return (
      <Panel strong className="p-4">
        <Spinner label="Retrieving, writing and verifying…" />
      </Panel>
    );
  if (m.error || !ex)
    return (
      <Panel strong className="p-4">
        <ErrorNote message={m.error ?? "No answer was produced."} />
      </Panel>
    );

  const cite = (l: string) => setOpen(ex.sources.find((s) => s.label === l) ?? null);
  return (
    <Panel strong className={cx("p-4 transition", active && "ring-2 ring-indigo/30")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill status={ex.status} />
        {ex.mode === "baseline" && <Tag tone="cyan">Baseline, no verification</Tag>}
        {ex.healing.triggered && (
          <Tag tone="healing">
            Healed: {ex.healing.retrieval_attempts} searches
            {ex.healing.regeneration_attempts ? `, ${ex.healing.regeneration_attempts} rewrite` : ""}
          </Tag>
        )}
        {ex.healing.reason && ex.status !== "accepted" && (
          <span className="text-xs text-muted">{REASON_LABEL[ex.healing.reason] ?? ex.healing.reason}</span>
        )}
        <span className="num ml-auto text-xs text-faint">{ms(ex.latency_ms)}</span>
      </div>

      <AnswerText text={ex.answer} sources={ex.sources} onCite={cite} />

      {ex.sources.length > 0 && (
        <div className="mt-4">
          <SourceList sources={ex.sources} highlight={open?.label} onSelect={cite} />
        </div>
      )}
      {open && (
        <div className="mt-3">
          <SourceDrawer source={open} onClose={() => setOpen(null)} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line/70 pt-3">
        {ex.mode === "self_healing" && (
          <Button variant="ghost" className="px-2.5 py-1.5 text-xs" icon={<Waypoints className="size-3.5" />} onClick={onTrace}>
            Show trace
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {([1, -1] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRated(r);
                onFeedback(r);
              }}
              aria-label={r === 1 ? "Helpful" : "Not helpful"}
              className={cx(
                "rounded-lg p-1.5 transition",
                rated === r ? (r === 1 ? "bg-accepted-soft text-accepted" : "bg-withheld-soft text-withheld") : "text-faint hover:bg-white hover:text-ink",
              )}
            >
              {r === 1 ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export default function Chat() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"self_healing" | "baseline">("self_healing");
  const [faultInjection, setFaultInjection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ question: string; source: string; answerable: boolean }[] | null>(null);

  const [traceSteps, setTraceSteps] = useState<Step[]>([]);
  const [traceExec, setTraceExec] = useState<Execution | null>(null);
  const [limits, setLimits] = useState<{ attempts: number; regens: number } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const readyDocs = useMemo(() => (docs ?? []).filter((d) => d.status === "ready"), [docs]);
  const tracePath = useMemo(() => traceSteps.map((s) => s.node), [traceSteps]);

  const loadSessions = useCallback(() => api.sessions().then(setSessions).catch(() => {}), []);

  useEffect(() => {
    loadSessions();
    api.documents().then(setDocs).catch((e) => setError(e.message));
    return () => abortRef.current?.abort();
  }, [loadSessions]);

  // "Try a question" chips are generated from the documents in scope, with the last one unanswerable.
  const readyKey = readyDocs.map((d) => d.id).join(",");
  const scopeKey = selectedDocs.join(",");
  useEffect(() => {
    if (!readyDocs.length) return;
    api.suggestions(selectedDocs).then(setSuggestions).catch(() => setSuggestions(null));
  }, [readyKey, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tryQuestions = suggestions?.length
    ? suggestions
    : SAMPLE_QUESTIONS.map((q, i) => ({ question: q, source: "", answerable: i < SAMPLE_QUESTIONS.length - 1 }));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const openSession = async (id: string) => {
    if (running) return;
    try {
      const s = await api.session(id);
      setSessionId(id);
      setMessages(
        s.messages.map((m: ChatMessage) => ({ id: m.id, role: m.role, content: m.content, execution: m.execution })),
      );
      const lastEx = [...s.messages].reverse().find((m) => m.execution?.mode === "self_healing")?.execution;
      if (lastEx) showTrace(lastEx);
      else {
        setTraceExec(null);
        setTraceSteps([]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const newChat = () => {
    if (running) return;
    setSessionId(null);
    setMessages([]);
    setTraceExec(null);
    setTraceSteps([]);
  };

  const showTrace = async (ex: Execution) => {
    setTraceExec(ex);
    try {
      const d = await api.execution(ex.execution_id);
      setTraceSteps(d.steps);
    } catch {
      setTraceSteps([]);
    }
  };

  const removeSession = async (id: string) => {
    await api.deleteSession(id).catch(() => {});
    if (id === sessionId) newChat();
    loadSessions();
  };

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || running) return;
    setError(null);
    setInput("");
    setRunning(true);
    setTraceSteps([]);
    setTraceExec(null);
    const pendingId = `p-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: question, execution: null },
      { id: pendingId, role: "assistant", content: "", execution: null, pending: true },
    ]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    await streamQuery(
      { question, session_id: sessionId, document_ids: selectedDocs, mode, fault_injection: faultInjection },
      {
        onStart: (s) => {
          setSessionId(s.session_id);
          setLimits({ attempts: s.max_retrieval_attempts, regens: s.max_regenerations });
        },
        onStep: (s) => setTraceSteps((prev) => [...prev, s]),
        onResult: (ex) => {
          setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, pending: false, execution: ex, content: ex.answer } : x)));
          setTraceExec(ex);
        },
        onError: (msg) => {
          setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, pending: false, error: msg } : x)));
        },
      },
      ctrl.signal,
    );
    setRunning(false);
    loadSessions();
  };

  const toggleDoc = (id: string) =>
    setSelectedDocs((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const noDocs = docs !== null && readyDocs.length === 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_400px]">
      {/* Conversations */}
      <Panel className="hidden h-[calc(100vh-48px)] flex-col p-3 xl:flex">
        <Button variant="primary" icon={<MessageSquarePlus className="size-4" />} onClick={newChat} disabled={running}>
          New chat
        </Button>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto scroll-thin">
          {sessions.length === 0 && <p className="px-2 py-3 text-xs text-muted">Your conversations will appear here.</p>}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cx(
                "group flex items-center gap-1 rounded-xl px-2.5 py-2 text-sm transition",
                s.id === sessionId ? "bg-white shadow-sm" : "hover:bg-white/60",
              )}
            >
              <button onClick={() => openSession(s.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium text-ink">{s.title}</span>
                <span className="text-[11px] text-faint">{timeAgo(s.updated_at)}</span>
              </button>
              <button
                onClick={() => removeSession(s.id)}
                className="rounded-md p-1 text-faint opacity-0 transition hover:text-error group-hover:opacity-100 focus:opacity-100"
                aria-label="Delete conversation"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      {/* Conversation */}
      <div className="flex min-h-[calc(100vh-48px)] flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-[22px] font-semibold tracking-tight">Ask your documents</h1>
            <p className="text-sm text-muted">Every answer is checked against its sources before you see it.</p>
          </div>
          <Button variant="soft" className="xl:hidden" icon={<MessageSquarePlus className="size-4" />} onClick={newChat} disabled={running}>
            New chat
          </Button>
        </div>

        {error && <div className="mb-3"><ErrorNote message={error} onDismiss={() => setError(null)} /></div>}

        <div className="flex-1 space-y-4 pb-4">
          {noDocs && (
            <Panel>
              <EmptyState
                icon={<Database className="size-5" />}
                title="Add a document to start"
                body="Answers come only from documents you've indexed. Upload your own or load the sample security handbook."
                action={<Link to="/documents"><Button variant="primary">Go to documents</Button></Link>}
              />
            </Panel>
          )}
          {!noDocs && messages.length === 0 && (
            <Panel className="p-6">
              <h2 className="font-display text-lg font-semibold">Try a question</h2>
              <p className="mt-1 text-sm text-muted">
                These are generated from your documents. The last one asks for something they don't contain, so the system should decline.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {tryQuestions.map((s, i) => (
                  <button
                    key={`${s.question}-${i}`}
                    onClick={() => send(s.question)}
                    disabled={running || !readyDocs.length}
                    className="lift rounded-2xl border border-white bg-white/70 p-3 text-left text-sm text-ink disabled:opacity-50"
                  >
                    {s.question}
                    {s.source && (
                      <span className={cx("mt-1 block text-[11px]", s.answerable ? "text-faint" : "text-withheld")}>
                        {s.answerable ? s.source : `${s.source} · should decline`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className={m.role === "user" ? "flex justify-end" : ""}
              >
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo px-4 py-2.5 text-[15px] text-white shadow-[0_10px_24px_-14px_rgba(79,70,229,0.9)]">
                    {m.content}
                  </div>
                ) : (
                  <AssistantCard
                    m={m}
                    active={!!m.execution && traceExec?.execution_id === m.execution.execution_id}
                    onTrace={() => m.execution && showTrace(m.execution)}
                    onFeedback={(r) => m.execution && api.feedback(m.execution.execution_id, r).catch(() => {})}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="sticky bottom-3 z-20">
          <Panel strong className="p-3">
            {readyDocs.length > 1 && readyDocs.length <= 12 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted">Search in</span>
                <button
                  onClick={() => setSelectedDocs([])}
                  className={cx("rounded-full px-2.5 py-1 text-xs font-medium", selectedDocs.length === 0 ? "bg-indigo text-white" : "bg-white/80 text-muted")}
                >
                  All documents
                </button>
                {readyDocs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleDoc(d.id)}
                    className={cx(
                      "inline-flex max-w-52 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                      selectedDocs.includes(d.id) ? "bg-indigo text-white" : "bg-white/80 text-muted",
                    )}
                  >
                    <FileText className="size-3" />
                    <span className="truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            )}
            {readyDocs.length > 12 && (
              <p className="mb-2 text-xs text-muted">Searching all {readyDocs.length} indexed documents.</p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder={noDocs ? "Index a document first" : "Ask a question about your documents"}
                disabled={noDocs}
                className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-white/90 px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-faint focus:border-indigo/50 focus:ring-4 focus:ring-indigo/10"
              />
              <Button type="submit" variant="primary" className="size-11 shrink-0 p-0" loading={running} disabled={!input.trim() || noDocs} aria-label="Send">
                {!running && <ArrowUp className="size-5" />}
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
              <div className="inline-flex rounded-lg bg-glacier p-0.5">
                {(["self_healing", "baseline"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMode(v)}
                    className={cx("rounded-md px-2.5 py-1 font-semibold transition", mode === v ? "bg-white text-indigo shadow-sm" : "text-muted")}
                  >
                    {v === "self_healing" ? "Self-healing" : "Baseline RAG"}
                  </button>
                ))}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5" title="Adds a made-up sentence to the first draft so you can watch the verifier catch it">
                <input
                  type="checkbox"
                  checked={faultInjection}
                  onChange={(e) => setFaultInjection(e.target.checked)}
                  disabled={mode === "baseline"}
                  className="size-3.5 accent-[#c26a05]"
                />
                <Bug className="size-3.5" /> Inject a false claim (demo)
              </label>
              <span className="ml-auto hidden sm:inline">Enter to send, Shift+Enter for a new line</span>
            </div>
          </Panel>
        </div>
      </div>

      {/* Trace */}
      <div className="xl:sticky xl:top-6 xl:h-[calc(100vh-48px)]">
        <Panel className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-4">
            <div>
              <h2 className="font-display text-base font-semibold">Verification trace</h2>
              <p className="text-xs text-muted">
                {running ? "Live from the pipeline" : traceExec ? "Steps for the selected answer" : "Ask something to watch the loop run"}
              </p>
            </div>
            {traceExec && !running && <StatusPill status={traceExec.status} />}
          </div>
          <div className="px-2">
            <HealingGraph path={tracePath} running={running} height={250} />
          </div>
          <div className="px-4 pb-2">
            <GraphLegend />
          </div>
          {(running || traceExec) && (
            <div className="grid grid-cols-3 gap-2 px-4 py-2 text-center">
              <Stat label="Searches" value={`${traceSteps.filter((s) => s.node === "retrieve").length}${limits ? `/${limits.attempts}` : ""}`} />
              <Stat label="Rewrites" value={String(traceSteps.filter((s) => s.node === "generate" && s.detail?.regeneration).length)} />
              <Stat label="Time" value={traceExec ? ms(traceExec.latency_ms) : "…"} />
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-3 pb-4 scroll-thin">
            {traceSteps.length ? (
              <TraceTimeline steps={traceSteps} running={running} />
            ) : (
              <p className="px-2 pt-2 text-sm text-muted">
                {traceExec?.mode === "baseline"
                  ? "Baseline answers skip grading and verification, so there is no healing trace."
                  : "Each step appears here as it runs: retrieval, relevance grading, the draft, the verifier's verdict, and any repair."}
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-2 py-1.5">
      <div className="num text-base font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
