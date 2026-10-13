import { useMemo } from "react";
import type { NetworkTopology } from "../../api/types";

const STATE_COLOR: Record<string, string> = {
  HEALTHY: "#5b9e77",
  WATCH: "#6f9dc0",
  WARNING: "#c39a4a",
  CRITICAL: "#c35d5d",
  STALE: "#5f6873",
  OFFLINE: "#5f6873",
};

const CARD_W = 172;
const CARD_H = 44;
const X_GAP = 204;
const Y_GAP = 62;
const MARGIN = 20;

interface Props {
  topology: NetworkTopology;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  compact?: boolean;
}

export function NetworkGraph({ topology, selectedId, onSelect, compact = false }: Props) {
  const { nodes, positions, width, height, edges } = useMemo(() => {
    const byId = new Map(topology.nodes.map((n) => [n.id, n]));
    const childMap = new Map<string, string[]>();
    for (const n of topology.nodes) childMap.set(n.id, n.children ?? []);

    const pos = new Map<string, { x: number; y: number }>();
    const ed: { from: string; to: string; state: string }[] = [];
    let leaf = 0;

    const walk = (id: string, depth: number): number => {
      const kids = (childMap.get(id) ?? []).filter((k) => byId.has(k));
      let y: number;
      if (kids.length === 0) {
        y = leaf++;
      } else {
        const ys = kids.map((k) => walk(k, depth + 1));
        y = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
      pos.set(id, { x: depth, y });
      for (const k of kids) {
        ed.push({ from: id, to: k, state: byId.get(k)?.reading?.detector_state ?? "HEALTHY" });
      }
      return y;
    };

    for (const root of topology.roots) if (byId.has(root)) walk(root, 0);

    let maxX = 0;
    let maxY = 0;
    for (const p of pos.values()) {
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const px = new Map<string, { x: number; y: number }>();
    for (const [id, p] of pos) px.set(id, { x: MARGIN + p.x * X_GAP, y: MARGIN + p.y * Y_GAP });

    return {
      nodes: topology.nodes,
      positions: px,
      width: MARGIN * 2 + maxX * X_GAP + CARD_W,
      height: MARGIN * 2 + maxY * Y_GAP + CARD_H,
      edges: ed,
    };
  }, [topology]);

  return (
    <div className="w-full overflow-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minWidth: compact ? 640 : 900, minHeight: height }}
        role="img"
        aria-label="Water distribution network"
      >
        {edges.map((e, i) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + CARD_W;
          const y1 = a.y + CARD_H / 2;
          const x2 = b.x;
          const y2 = b.y + CARD_H / 2;
          const mid = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
          const alert = e.state === "CRITICAL" || e.state === "WARNING";
          return (
            <path
              key={`${e.from}-${e.to}-${i}`}
              d={d}
              fill="none"
              stroke={alert ? STATE_COLOR[e.state] : "#2a3037"}
              strokeWidth={alert ? 1.5 : 1}
            />
          );
        })}

        {nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const state = n.reading?.detector_state ?? "STALE";
          const color = STATE_COLOR[state] ?? "#5f6873";
          const isSelected = selectedId === n.id;
          return (
            <g
              key={n.id}
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onClick={() => onSelect?.(n.id)}
            >
              <rect
                x={p.x}
                y={p.y}
                width={CARD_W}
                height={CARD_H}
                rx={3}
                fill={isSelected ? "#1b1f24" : "#14171b"}
                stroke={isSelected ? "#5b8fb9" : "#262b31"}
                strokeWidth={1}
              />
              <rect x={p.x} y={p.y} width={3} height={CARD_H} rx={1} fill={color} />
              <text x={p.x + 12} y={p.y + 17} fill="#d6dae0" fontSize={11.5} fontWeight={600}>
                {n.name}
              </text>
              {!compact && n.meter ? (
                <text
                  x={p.x + 12}
                  y={p.y + 32}
                  fill="#868f99"
                  fontSize={10}
                  fontFamily="Cascadia Mono, Consolas, monospace"
                >
                  {n.reading?.actual !== null && n.reading?.actual !== undefined
                    ? `${n.reading.actual.toFixed(1)} L/int`
                    : "no reading"}
                </text>
              ) : (
                <text x={p.x + 12} y={p.y + 32} fill="#5f6873" fontSize={10}>
                  {n.meter ? `exp ${n.reading?.expected?.toFixed(1) ?? "-"}` : "unmetered draw"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
