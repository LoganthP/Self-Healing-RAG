import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { Button, ErrorNote, Panel } from "../ui";

export function LandingCTA() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadSample = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.loadSample();
      navigate("/chat");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load sample handbook.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Panel
          strong
          className="relative overflow-hidden p-8 text-center sm:p-12 lg:p-16 shadow-2xl"
        >
          {/* Subtle gradient backdrop */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-indigo-soft/40 via-transparent to-cyan-soft/40" />

          <div className="mx-auto max-w-3xl">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo/25 bg-indigo-soft px-3 py-1 text-xs font-semibold text-indigo">
              <Sparkles className="size-3.5" />
              Ready for verified accuracy?
            </div>

            <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              Stop guessing. Start verifying.
            </h2>

            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Load your documents or spin up our security handbook to experience
              self-healing verification in under two minutes.
            </p>

            {error && (
              <div className="mt-4 max-w-md mx-auto">
                <ErrorNote message={error} onDismiss={() => setError(null)} />
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                variant="primary"
                onClick={handleLoadSample}
                loading={loading}
                icon={<BookOpen className="size-4" />}
                className="h-11 px-6 text-sm font-semibold shadow-lg hover:shadow-indigo/25"
              >
                Try with the sample handbook
              </Button>

              <Link to="/overview">
                <Button variant="soft" className="h-11 px-5 text-sm font-semibold">
                  <span>Open application</span>
                  <ArrowRight className="size-4" />
                </Button>
              </Link>

              <Link to="/documents">
                <Button variant="ghost" className="h-11 px-4 text-sm font-medium">
                  Upload custom documents
                </Button>
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 border-t border-line/60 pt-6 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-accepted" /> 100% Local processing available
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-accepted" /> DuckDB SQL table scans
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-accepted" /> Bounded healing loops
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
