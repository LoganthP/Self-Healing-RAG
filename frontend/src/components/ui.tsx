import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ExecStatus } from "../types";
import { STATUS_META } from "../lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Panel({ children, className, strong }: { children: ReactNode; className?: string; strong?: boolean }) {
  return <section className={cx(strong ? "glass-strong" : "glass", "rounded-[22px]", className)}>{children}</section>;
}

type BtnVariant = "primary" | "soft" | "ghost" | "danger";

export function Button({
  variant = "soft", loading, icon, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; icon?: ReactNode }) {
  const styles: Record<BtnVariant, string> = {
    primary:
      "bg-indigo text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)] hover:bg-[#4339d6] active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.25)]",
    soft: "bg-white/80 text-ink border border-line hover:bg-white active:shadow-[inset_0_2px_5px_rgba(31,44,94,0.15)]",
    ghost: "text-muted hover:text-ink hover:bg-white/60",
    danger: "bg-white/80 text-error border border-error/25 hover:bg-error-soft",
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
        "disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px",
        styles[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function StatusPill({ status, className }: { status: ExecStatus; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.running;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", m.bg, m.fg, className)}>
      <span className={cx("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "healing" | "indigo" | "cyan" }) {
  const t = {
    neutral: "bg-white/70 text-muted border border-line",
    healing: "bg-healing-soft text-healing",
    indigo: "bg-indigo-soft text-indigo",
    cyan: "bg-cyan-soft text-cyan",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", t)}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-white/80 text-indigo shadow-sm">{icon}</div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}

export function ErrorNote({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-error/20 bg-error-soft/80 px-3.5 py-2.5 text-sm text-error">
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-xs font-semibold underline-offset-2 hover:underline">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Meter({ value, tone = "indigo" }: { value: number; tone?: "indigo" | "accepted" | "healing" | "withheld" | "cyan" }) {
  const c = { indigo: "bg-indigo", accepted: "bg-accepted", healing: "bg-healing", withheld: "bg-withheld", cyan: "bg-cyan" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/70">
      <motion.div
        className={cx("h-full rounded-full", c)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
      />
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
