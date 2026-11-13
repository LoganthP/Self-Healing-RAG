import { Fragment, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, X } from "lucide-react";
import type { Source } from "../../types";
import { pageLabel } from "../../lib/format";
import { cx } from "../ui";

/** Renders **bold**, list lines and [S#] citation chips. All text is rendered as
 *  React text nodes, so document content can never inject HTML. */
function inline(text: string, onCite: (l: string) => void, known: Set<string>, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[S\d+\])/g).filter(Boolean);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k} className="font-semibold">{p.slice(2, -2)}</strong>;
    const m = p.match(/^\[(S\d+)\]$/);
    if (m) {
      const ok = known.has(m[1]);
      return (
        <button
          key={k}
          onClick={() => ok && onCite(m[1])}
          title={ok ? "Show source" : "Source not available"}
          className={cx(
            "mx-0.5 inline-flex -translate-y-px items-center rounded-md px-1.5 py-px align-middle text-[11px] font-bold transition",
            ok ? "bg-cyan-soft text-cyan hover:bg-cyan hover:text-white" : "bg-line text-faint",
          )}
        >
          {m[1]}
        </button>
      );
    }
    return <Fragment key={k}>{p}</Fragment>;
  });
}

export function AnswerText({ text, sources, onCite }: { text: string; sources: Source[]; onCite: (l: string) => void }) {
  const known = new Set(sources.map((s) => s.label));
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-ink">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        const isList = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        if (isList)
          return (
            <ul key={bi} className="ml-5 list-disc space-y-1 marker:text-faint">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), onCite, known, `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        return (
          <div key={bi} className="space-y-1.5">
            {lines.map((l, li) => (
              <p key={li}>{inline(l, onCite, known, `${bi}-${li}`)}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function SourceList({ sources, highlight, onSelect }: { sources: Source[]; highlight?: string | null; onSelect: (l: string) => void }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((s) => (
        <button
          key={s.label}
          onClick={() => onSelect(s.label)}
          className={cx(
            "inline-flex max-w-full items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition",
            highlight === s.label ? "border-cyan bg-cyan-soft text-cyan" : "border-line bg-white/80 text-muted hover:border-cyan/50",
          )}
        >
          <span className="font-bold text-cyan">{s.label}</span>
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{s.filename}</span>
          {pageLabel(s.page_start, s.page_end) && <span className="text-faint">{pageLabel(s.page_start, s.page_end)}</span>}
        </button>
      ))}
    </div>
  );
}

export function SourceDrawer({ source, onClose }: { source: Source | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {source && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="glass-strong rounded-2xl p-4"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-sm font-semibold">
                <span className="mr-2 rounded-md bg-cyan-soft px-1.5 py-0.5 text-cyan">{source.label}</span>
                {source.filename}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                {pageLabel(source.page_start, source.page_end) && <span>{pageLabel(source.page_start, source.page_end)}</span>}
                {source.section && <span>Section: {source.section}</span>}
                {source.score != null && <span>Similarity {source.score.toFixed(2)}</span>}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-white" aria-label="Close source">
              <X className="size-4" />
            </button>
          </div>
          <p className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white/80 p-3 text-sm leading-relaxed text-ink scroll-thin">
            {source.text}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
