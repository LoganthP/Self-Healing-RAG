import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, MessageSquareText } from "lucide-react";
import { Button } from "../ui";

interface DailyRecord {
  date: string;
  accepted: number;
  abstained: number;
  error: number;
}

interface TrendAreaChartProps {
  daily: DailyRecord[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload || !payload.length) return null;

  const accepted = (payload.find((p) => p.dataKey === "accepted")?.value as number) || 0;
  const abstained = (payload.find((p) => p.dataKey === "abstained")?.value as number) || 0;
  const error = (payload.find((p) => p.dataKey === "error")?.value as number) || 0;
  const total = accepted + abstained + error;

  return (
    <div className="rounded-xl border border-line bg-white/95 p-3 text-xs shadow-md backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-line/60 pb-1 font-semibold text-ink">
        <span>{label}</span>
        <span className="num font-bold text-indigo">{total} total</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full bg-accepted" />
            Verified
          </span>
          <span className="num font-semibold text-ink">{accepted}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full bg-withheld" />
            Withheld
          </span>
          <span className="num font-semibold text-ink">{abstained}</span>
        </div>
        {error > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full bg-error" />
              Service errors
            </span>
            <span className="num font-semibold text-error">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function TrendAreaChart({ daily }: TrendAreaChartProps) {
  const chartData = daily.map((d, index) => {
    const isToday = index === daily.length - 1;
    const dateObj = new Date(d.date + "T00:00:00");
    const dayLabel = isToday
      ? "Today"
      : dateObj.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const total = (d.accepted || 0) + (d.abstained || 0) + (d.error || 0);

    return {
      ...d,
      day: dayLabel,
      isToday,
      total,
    };
  });

  const totalQueries = chartData.reduce((acc, curr) => acc + curr.total, 0);
  const todayRecord = chartData[chartData.length - 1];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">14-day verification trend</h2>
        {todayRecord && todayRecord.total > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accepted-soft px-2.5 py-0.5 text-xs font-medium text-accepted">
            Today: {todayRecord.accepted} verified / {todayRecord.total} total
          </span>
        )}
      </div>

      {totalQueries === 0 ? (
        <div className="flex h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/40 p-6 text-center">
          <Calendar className="mb-2 size-6 text-faint" />
          <p className="text-sm font-medium text-ink">No query activity in the last 14 days</p>
          <p className="mt-1 text-xs text-muted max-w-xs">
            Ask questions on the Ask page to start tracking daily verification, recovery, and abstention trends.
          </p>
          <div className="mt-3">
            <Link to="/chat">
              <Button variant="soft" icon={<MessageSquareText className="size-3.5" />}>
                Ask a question
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -24, right: 4, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAccepted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradWithheld" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#be185d" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#be185d" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradError" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "#8a94ad" }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#8a94ad" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="accepted"
                name="Verified"
                stackId="1"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#gradAccepted)"
              />
              <Area
                type="monotone"
                dataKey="abstained"
                name="Withheld"
                stackId="1"
                stroke="#be185d"
                strokeWidth={2}
                fill="url(#gradWithheld)"
              />
              <Area
                type="monotone"
                dataKey="error"
                name="Service errors"
                stackId="1"
                stroke="#dc2626"
                strokeWidth={2}
                fill="url(#gradError)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
