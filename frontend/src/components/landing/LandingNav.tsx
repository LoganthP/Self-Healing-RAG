import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Health } from "../../types";
import { Button, cx } from "../ui";

export interface NavProps {
  health: Health | null;
  down: boolean;
}

export function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" className="size-9 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="landing-mk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0891b2" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" fill="url(#landing-mk)" />
      <path d="M12 21a8 8 0 1 0 3-6.2" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11.5 10.5v5h5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16.5 21 2.6 2.6 5-5.2" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#demo", label: "Interactive demo" },
  { href: "#features", label: "Features" },
  { href: "#comparison", label: "Comparison" },
];

export function LandingNav({ health, down }: NavProps) {
  const [activeSection, setActiveSection] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showStatusHint, setShowStatusHint] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);

  // Scroll detection for backdrop styling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll-spy with IntersectionObserver
  useEffect(() => {
    const sectionIds = ["how-it-works", "demo", "features", "comparison"];
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveSection(`#${id}`);
            }
          });
        },
        { rootMargin: "-30% 0px -50% 0px" },
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  // Close mobile menu on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setShowStatusHint(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header
      className={cx(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled ? "glass-strong py-2.5 shadow-sm" : "bg-transparent py-4",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          to="/"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
        >
          <LogoMark />
          <div>
            <div className="font-display text-[16px] font-bold tracking-tight text-ink">
              Self-Healing RAG
            </div>
            <div className="text-[11px] font-medium text-muted">
              Answers you can verify
            </div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = activeSection === href;
            return (
              <a
                key={href}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollTo(href);
                }}
                className={cx(
                  "relative rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-indigo"
                    : "text-muted hover:bg-white/60 hover:text-ink",
                )}
              >
                {label}
                {isActive && (
                  <motion.span
                    layoutId="activeNavPill"
                    className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-indigo"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </a>
            );
          })}
        </nav>

        {/* Desktop Right Actions: Status & Open App */}
        <div className="hidden items-center gap-3 md:flex">
          {/* Status Chip */}
          <div className="relative" ref={hintRef}>
            <button
              onClick={() => setShowStatusHint((prev) => !prev)}
              aria-label={down ? "Backend offline. Click for instructions." : "Backend connected"}
              className={cx(
                "group flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition shadow-sm",
                down
                  ? "border-error/30 bg-error-soft/90 text-error hover:bg-error-soft"
                  : health
                    ? "border-accepted/30 bg-accepted-soft/90 text-accepted hover:bg-accepted-soft"
                    : "border-line bg-white/70 text-muted",
              )}
            >
              <Activity className="size-3.5" />
              <span>{down ? "Backend offline" : health ? "Connected" : "Connecting…"}</span>
              <span
                className={cx(
                  "size-2 rounded-full",
                  down ? "bg-error" : health ? "bg-accepted" : "bg-faint",
                )}
              />
            </button>

            {/* Offline Helper Popover */}
            <AnimatePresence>
              {(down || showStatusHint) && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  className={cx(
                    "glass-strong absolute right-0 top-full mt-2 w-72 rounded-2xl p-3.5 text-xs shadow-xl ring-1 ring-black/5 z-50",
                    !showStatusHint && !down && "hidden",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {down ? "Backend unreachable" : "Backend status: Connected"}
                    </span>
                    <button
                      onClick={() => setShowStatusHint(false)}
                      className="text-muted hover:text-ink text-[11px]"
                    >
                      ✕
                    </button>
                  </div>
                  {down ? (
                    <p className="mt-1.5 leading-relaxed text-muted">
                      Start the server by running in <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px] text-ink">backend/</code>:
                      <br />
                      <span className="mt-1 block rounded-lg bg-ink p-2 font-mono text-[11px] text-white select-all">
                        python -m uvicorn app.main:app --port 8000
                      </span>
                    </p>
                  ) : health ? (
                    <div className="mt-1.5 space-y-1 text-muted">
                      <div className="flex justify-between">
                        <span>Provider:</span>
                        <span className="font-semibold text-ink">{health.provider}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Embedding:</span>
                        <span className="font-semibold text-ink truncate max-w-[140px]">{health.embedding.name}</span>
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Open App CTA */}
          <Link to="/overview">
            <Button variant="primary" className="gap-1.5 shadow-md">
              <span>Open app</span>
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <Link to="/overview">
            <Button variant="primary" className="py-1.5 px-3 text-xs">
              Open app
            </Button>
          </Link>
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation menu"
            className="glass flex size-10 items-center justify-center rounded-xl text-ink transition hover:bg-white"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="glass-strong mx-3 mt-2 overflow-hidden rounded-2xl border border-white/80 p-4 shadow-xl md:hidden"
          >
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollTo(href);
                  }}
                  className={cx(
                    "flex items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold transition",
                    activeSection === href
                      ? "bg-indigo text-white"
                      : "text-ink hover:bg-white/80",
                  )}
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="mt-4 border-t border-line/60 pt-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs font-medium text-muted">
                <span className="flex items-center gap-1.5">
                  <Activity className="size-3.5" /> Backend
                </span>
                <span
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    down
                      ? "bg-error-soft text-error"
                      : health
                        ? "bg-accepted-soft text-accepted"
                        : "bg-white text-muted",
                  )}
                >
                  <span
                    className={cx(
                      "size-1.5 rounded-full",
                      down ? "bg-error" : health ? "bg-accepted" : "bg-faint",
                    )}
                  />
                  {down ? "Offline" : health ? "Connected" : "Connecting"}
                </span>
              </div>

              {down && (
                <div className="rounded-xl bg-error-soft/90 p-2.5 text-[11px] text-error">
                  Backend offline. Start with:
                  <code className="mt-1 block font-mono text-[10px] text-ink font-semibold">
                    python -m uvicorn app.main:app --port 8000
                  </code>
                </div>
              )}

              <Link to="/overview" onClick={() => setMobileOpen(false)} className="w-full">
                <Button variant="primary" className="w-full justify-center">
                  Launch Overview
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
