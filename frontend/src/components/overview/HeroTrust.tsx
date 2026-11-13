import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { MessageSquareText, Upload, Play, SlidersHorizontal } from "lucide-react";
import { Button, cx } from "../ui";
import { pct } from "../../lib/format";
import { RingGauge } from "./RingGauge";

interface HeroTrustProps {
  queries: number;
  accepted: number;
  withheld: number;
  errors: number;
  acceptedRate: number;
  abstentionRate: number;
  errorRate: number;
}

export function HeroTrust({
  queries,
  accepted,
  withheld,
  errors,
  acceptedRate,
  abstentionRate,
  errorRate,
}: HeroTrustProps) {
  const total = queries;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex-1 min-w-0">
        <h1 className="font-display text-[clamp(1.5rem,2.8vw,2.2rem)] font-semibold leading-[1.2] tracking-tight text-ink">
          {total === 0
            ? "Ask a question and every answer will be checked before you see it."
            : `${accepted.toLocaleString()} of ${total.toLocaleString()} answers verified. ${withheld.toLocaleString()} withheld instead of guessed.`}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-muted">
          Everything shown was checked against sources. Answers are accepted only when each claim traces back to an indexed passage in your documents.
        </p>

        {/* Multi-segment trust bar */}
        <div className="mt-5">
          <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-line/60">
            {total > 0 && (
              <>
                <motion.div
                  className="h-full bg-accepted"
                  initial={{ width: 0 }}
                  animate={{ width: `${(accepted / total) * 100}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
                <motion.div
                  className="h-full bg-withheld"
                  initial={{ width: 0 }}
                  animate={{ width: `${(withheld / total) * 100}%` }}
                  transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
                />
                <motion.div
                  className="h-full bg-error"
                  initial={{ width: 0 }}
                  animate={{ width: `${(errors / total) * 100}%` }}
                  transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
                />
              </>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm">
            <Legend dot="bg-accepted" label="Verified" value={pct(acceptedRate)} />
            <Legend dot="bg-withheld" label="Withheld" value={pct(abstentionRate)} />
            <Legend dot="bg-error" label="Service errors" value={pct(errorRate)} />
          </div>
        </div>

        {/* Real Quick-Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Link to="/chat">
            <Button variant="primary" icon={<MessageSquareText className="size-4" />}>
              Ask a question
            </Button>
          </Link>
          <Link to="/documents">
            <Button variant="soft" icon={<Upload className="size-4" />}>
              Add documents
            </Button>
          </Link>
          <Link to="/evaluation">
            <Button variant="soft" icon={<Play className="size-4" />}>
              Run evaluation
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost" icon={<SlidersHorizontal className="size-4" />}>
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Ring Gauge to eliminate awkward empty space on desktop */}
      <div className="flex shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/40 p-4 shadow-sm backdrop-blur-sm self-center sm:self-auto">
        <RingGauge rate={acceptedRate} total={total} accepted={accepted} />
      </div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <span className={cx("size-2.5 rounded-full shrink-0", dot)} />
      <span>{label}</span>
      <span className="num font-semibold text-ink">{value}</span>
    </span>
  );
}

