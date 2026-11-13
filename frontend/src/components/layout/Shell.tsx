import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Activity, Database, FlaskConical, LayoutGrid, MessageSquareText, Settings2, Workflow } from "lucide-react";
import { api } from "../../lib/api";
import type { Health } from "../../types";
import { cx } from "../ui";

const NAV = [
  { to: "/overview", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/chat", label: "Ask", icon: MessageSquareText },
  { to: "/documents", label: "Documents", icon: Database },
  { to: "/monitor", label: "Workflow monitor", icon: Workflow },
  { to: "/evaluation", label: "Evaluation lab", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

function Mark() {
  // A loop that closes on itself: retrieve, check, repair.
  return (
    <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
      <defs>
        <linearGradient id="mk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0891b2" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" fill="url(#mk)" />
      <path d="M12 21a8 8 0 1 0 3-6.2" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11.5 10.5v5h5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16.5 21 2.6 2.6 5-5.2" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shell() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api.health().then((h) => alive && (setHealth(h), setDown(false))).catch(() => alive && setDown(true));
    check();
    const id = window.setInterval(check, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="relative min-h-full">
      <div className="aurora" />
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        <aside className="glass m-3 flex shrink-0 flex-col rounded-[26px] p-3 lg:sticky lg:top-3 lg:h-[calc(100vh-24px)] lg:w-60">
          <Link to="/" className="flex items-center gap-2.5 px-2 pb-4 pt-1 transition hover:opacity-85">
            <Mark />
            <div>
              <div className="font-display text-[15px] font-semibold leading-tight text-ink">Self-Healing RAG</div>
              <div className="text-[11px] text-muted">Answers you can verify</div>
            </div>
          </Link>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                    isActive ? "bg-white text-indigo shadow-sm" : "text-muted hover:bg-white/60 hover:text-ink",
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto hidden rounded-2xl bg-white/60 p-3 text-xs lg:block">
            <div className="mb-1.5 flex items-center gap-2 font-semibold text-ink">
              <Activity className="size-3.5" />
              {down ? "Backend offline" : health ? "Backend connected" : "Connecting…"}
              <span className={cx("ml-auto size-2 rounded-full", down ? "bg-error" : health ? "bg-accepted" : "bg-faint")} />
            </div>
            {health && !down && (
              <dl className="space-y-0.5 text-muted">
                <div className="flex justify-between gap-2"><dt>Model</dt><dd className="truncate text-ink">{health.provider === "offline" ? "Offline" : health.model}</dd></div>
                <div className="flex justify-between gap-2"><dt>Embeddings</dt><dd className="truncate text-ink">{health.embedding.name}</dd></div>
              </dl>
            )}
            {down && <p className="text-muted">Start it from the backend folder with uvicorn on port 8000.</p>}
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-3 pb-8 pt-3 lg:px-6 lg:pt-6">
          {down && (
            <div className="mb-4 rounded-2xl border border-error/20 bg-error-soft/80 px-4 py-3 text-sm text-error lg:hidden">
              The backend isn't reachable. Start it on port 8000.
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
