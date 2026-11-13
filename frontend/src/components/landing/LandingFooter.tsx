import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { LogoMark } from "./LandingNav";

export function LandingFooter() {
  return (
    <footer className="relative border-t border-line/60 bg-white/50 backdrop-blur-md pt-12 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          {/* Brand & Mission */}
          <div className="md:col-span-5">
            <Link
              to="/"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center gap-3 transition hover:opacity-85"
            >
              <LogoMark />
              <div>
                <div className="font-display text-base font-bold tracking-tight text-ink">
                  Self-Healing RAG
                </div>
                <div className="text-xs text-muted">Answers you can verify</div>
              </div>
            </Link>
            <p className="mt-3.5 max-w-sm text-xs leading-relaxed text-muted">
              A closed-loop retrieval-augmented generation engine that executes SQL for tables,
              grades passage relevance, cross-examines claims with an independent critic,
              and repairs drafts before delivery.
            </p>
          </div>

          {/* Navigation Links */}
          <div className="md:col-span-4">
            <h4 className="font-display text-xs font-bold uppercase tracking-wider text-ink">
              Application Pages
            </h4>
            <ul className="mt-3.5 space-y-2 text-xs font-medium text-muted">
              <li>
                <Link to="/overview" className="transition hover:text-indigo">
                  Overview Dashboard
                </Link>
              </li>
              <li>
                <Link to="/chat" className="transition hover:text-indigo">
                  Ask & Chat
                </Link>
              </li>
              <li>
                <Link to="/documents" className="transition hover:text-indigo">
                  Documents & Datasets
                </Link>
              </li>
              <li>
                <Link to="/monitor" className="transition hover:text-indigo">
                  Workflow Execution Monitor
                </Link>
              </li>
              <li>
                <Link to="/evaluation" className="transition hover:text-indigo">
                  Evaluation Lab (Benchmark)
                </Link>
              </li>
              <li>
                <Link to="/settings" className="transition hover:text-indigo">
                  Model & Embedding Settings
                </Link>
              </li>
            </ul>
          </div>

          {/* Documentation & Resources */}
          <div className="md:col-span-3">
            <h4 className="font-display text-xs font-bold uppercase tracking-wider text-ink">
              Developer Resources
            </h4>
            <ul className="mt-3.5 space-y-2 text-xs font-medium text-muted">
              <li>
                <a
                  href="http://127.0.0.1:8000/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 transition hover:text-indigo"
                >
                  <span>FastAPI Swagger Docs</span>
                  <ExternalLink className="size-3 text-muted" />
                </a>
              </li>
              <li>
                <a
                  href="http://127.0.0.1:8000/redoc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 transition hover:text-indigo"
                >
                  <span>ReDoc Specification</span>
                  <ExternalLink className="size-3 text-muted" />
                </a>
              </li>
              <li className="pt-2 text-[11px] text-faint leading-relaxed">
                Backend server: FastAPI + DuckDB on port 8000.
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line/60 pt-6 text-[11px] text-muted sm:flex-row">
          <div>
            Self-Healing RAG — Deterministic, Grounded, Verifiable.
          </div>
          <div className="flex items-center gap-4">
            <a
              href="#how-it-works"
              className="hover:text-ink transition"
            >
              How it works
            </a>
            <a
              href="#demo"
              className="hover:text-ink transition"
            >
              Demo
            </a>
            <a
              href="#features"
              className="hover:text-ink transition"
            >
              Features
            </a>
            <a
              href="#comparison"
              className="hover:text-ink transition"
            >
              Comparison
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
