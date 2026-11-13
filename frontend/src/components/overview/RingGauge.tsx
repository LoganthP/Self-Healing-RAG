import { motion } from "motion/react";
import { CountUp } from "./CountUp";

interface RingGaugeProps {
  rate: number;
  total: number;
  accepted: number;
}

export function RingGauge({ rate, total, accepted }: RingGaugeProps) {
  // SVG circular dimensions
  const size = 136;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(100, Math.max(0, Math.round(rate * 100)));
  const offset = total > 0 ? circumference - (rate * circumference) : circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg] overflow-visible"
          role="img"
          aria-label={`${percentage}% of queries verified (${accepted} of ${total})`}
        >
          <defs>
            <linearGradient id="ring-accepted-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>

          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(217, 227, 239, 0.6)"
            strokeWidth={strokeWidth}
            strokeDasharray={total === 0 ? "4 4" : undefined}
          />

          {/* Progress fill */}
          {total > 0 && (
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#ring-accepted-gradient)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          )}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-2xl font-bold tracking-tight text-ink num">
            {total > 0 ? (
              <>
                <CountUp value={percentage} />%
              </>
            ) : (
              "—"
            )}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Verified
          </span>
        </div>
      </div>

      <div className="mt-2 text-center">
        <span className="num text-xs font-medium text-faint">
          {total > 0 ? `${accepted.toLocaleString()} of ${total.toLocaleString()} checked` : "Ready for queries"}
        </span>
      </div>
    </div>
  );
}

