import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SeriesPoint {
  t: string;
  actual: number | null;
  expected: number | null;
  lower: number | null;
  upper: number | null;
}

function transform(data: SeriesPoint[]) {
  return data.map((d) => ({
    ...d,
    bandBase: d.lower ?? 0,
    bandWidth: d.lower !== null && d.upper !== null ? Math.max(d.upper - d.lower, 0) : 0,
  }));
}

const AXIS = "#5f6873";
const GRID = "#1f242a";

const TooltipBox = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as SeriesPoint;
  const hasBand = p.lower !== null && p.upper !== null;
  return (
    <div className="rounded border border-line bg-panel px-2.5 py-1.5 text-[11px]">
      <p className="mb-1 font-mono text-[10px] text-dim">{label}</p>
      <p className="text-ink">
        Actual <span className="font-mono">{p.actual !== null ? p.actual.toFixed(2) : "-"}</span>
      </p>
      <p className="text-teal">
        Expected <span className="font-mono">{p.expected !== null ? p.expected.toFixed(2) : "-"}</span>
      </p>
      {hasBand ? (
        <p className="text-muted">
          Band{" "}
          <span className="font-mono">
            {p.lower!.toFixed(2)} to {p.upper!.toFixed(2)}
          </span>
        </p>
      ) : null}
    </div>
  );
};

export function ActualVsExpected({
  data,
  height = 260,
  unit = "L/interval",
}: {
  data: SeriesPoint[];
  height?: number;
  unit?: string;
}) {
  const rows = transform(data);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fill: AXIS, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: AXIS, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={44}
            label={{ value: unit, angle: -90, position: "insideLeft", fill: AXIS, fontSize: 10 }}
          />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: "#333a42" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#868f99" }} iconType="plainline" />
          <Area
            type="monotone"
            dataKey="bandBase"
            stackId="band"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
            legendType="none"
            name="band-base"
          />
          <Area
            type="monotone"
            dataKey="bandWidth"
            stackId="band"
            stroke="none"
            fill="#5b8fb9"
            fillOpacity={0.08}
            isAnimationActive={false}
            name="Expected band (P10 to P90)"
          />
          <Line
            type="monotone"
            dataKey="expected"
            stroke="#5b8fb9"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            name="Expected"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#d6dae0"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="Actual"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
