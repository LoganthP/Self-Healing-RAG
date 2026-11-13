import { useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { Step } from "../../types";
import { NODE_LABEL, ms } from "../../lib/format";
import { cx } from "../ui";

const OUTCOME_DOT: Record<Step["outcome"], string> = {
  ok: "bg-accepted",
  warn: "bg-healing",
  fail: "bg-withheld",
};

function Detail({ step }: { step: Step }) {
  const d = step.detail ?? {};
  const rows: ReactElement[] = [];
  if (d.query) rows.push(<Row key="q" k="Search query" v={`“${d.query}”`} />);
  if (d.new_query) rows.push(<Row key="nq" k="New query" v={`“${d.new_query}”`} />);
  if (d.reason && typeof d.reason === "string") rows.push(<Row key="r" k="Why" v={d.reason} />);
  if (typeof d.retrieved === "number") rows.push(<Row key="rt" k="Passages" v={`${d.relevant ?? d.retrieved} relevant of ${d.retrieved}`} />);
  if (typeof d.new_evidence === "number" && step.node === "grade_relevance")
    rows.push(<Row key="ne" k="New evidence" v={String(d.new_evidence)} />);
  if (d.feedback) rows.push(<Row key="fb" k="Critic feedback" v={d.feedback} />);
  if (Array.isArray(d.missing_information) && d.missing_information.length)
    rows.push(<Row key="mi" k="Missing" v={d.missing_information.join("; ")} />);
  if (Array.isArray(d.missing) && d.missing.length) rows.push(<Row key="m2" k="Targeting" v={d.missing.join("; ")} />);
  if (d.fault_injected) rows.push(<Row key="fi" k="Test" v="A fabricated sentence was added to this draft on purpose." />);
  if (d.error) rows.push(<Row key="er" k="Error" v={d.error} />);

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-white/70 p-3 text-xs">
      {rows}
      {Array.isArray(d.unsupported_claims) && d.unsupported_claims.length > 0 && (
        <div>
          <div className="mb-1 font-semibold text-withheld">Rejected claims</div>
          <ul className="space-y-1.5">
            {d.unsupported_claims.map((c: any, i: number) => (
              <li key={i} className="rounded-lg bg-withheld-soft/60 px-2 py-1.5">
                <span className="text-ink">“{c.claim}”</span>
                <span className="block text-muted">{c.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.draft && (
        <div>
          <div className="mb-1 font-semibold text-muted">Draft</div>
          <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-glacier/70 p-2 leading-relaxed text-ink scroll-thin">{d.draft}</p>
        </div>
      )}
      {Array.isArray(d.top) && d.top.length > 0 && (
        <div className="text-muted">
          Top scores:{" "}
          {d.top.slice(0, 5).map((t: any) => (t.score ?? 0).toFixed(2)).join(", ")}
        </div>
      )}
      {rows.length === 0 && !d.draft && !d.unsupported_claims?.length && <div className="text-muted">No extra details.</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <span className="text-muted">{k}</span>
      <span className="break-words text-ink">{v}</span>
    </div>
  );
}

export function TraceTimeline({ steps, running }: { steps: Step[]; running?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ol className="relative space-y-1">
      {steps.map((s, i) => {
        const isOpen = open === s.step_number;
        const isLast = i === steps.length - 1;
        return (
          <motion.li
            key={s.step_number}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative pl-6"
          >
            {!isLast && <span className="absolute left-[7px] top-5 h-[calc(100%-4px)] w-px bg-line" />}
            <span
              className={cx(
                "absolute left-0.5 top-2 size-3 rounded-full ring-4 ring-white/80",
                running && isLast ? "bg-indigo pulse-ring" : OUTCOME_DOT[s.outcome],
              )}
            />
            <button
              onClick={() => setOpen(isOpen ? null : s.step_number)}
              className="flex w-full items-start justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-white/60"
              aria-expanded={isOpen}
            >
              <span>
                <span className="block text-[13px] font-semibold text-ink">{s.title}</span>
                <span className="flex gap-3 text-[11px] text-muted">
                  <span>{NODE_LABEL[s.node] ?? s.node}</span>
                  <span className="num">{ms(s.duration_ms)}</span>
                </span>
              </span>
              <ChevronDown className={cx("mt-1 size-4 shrink-0 text-faint transition", isOpen && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Detail step={s} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ol>
  );
}
