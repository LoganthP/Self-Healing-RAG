import { useMemo } from "react";
import {
  Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BadgeCheck, CircleSlash, Filter, PenLine, RefreshCw, ScanSearch, Search, ShieldCheck, TriangleAlert,
} from "lucide-react";
import { NODE_LABEL } from "../../lib/format";
import { cx } from "../ui";

type Tone = "idle" | "visited" | "active" | "accepted" | "withheld" | "healing" | "error";

interface GNodeData extends Record<string, unknown> {
  id: string;
  visits: number;
  tone: Tone;
}

const ICONS: Record<string, typeof Search> = {
  validate_input: ShieldCheck, retrieve: Search, grade_relevance: Filter, generate: PenLine,
  critique: ScanSearch, rewrite_query: RefreshCw, finalize: BadgeCheck, abstain: CircleSlash,
  handle_error: TriangleAlert,
};

const POS: Record<string, { x: number; y: number }> = {
  validate_input: { x: 0, y: 90 },
  retrieve: { x: 185, y: 90 },
  grade_relevance: { x: 370, y: 90 },
  generate: { x: 555, y: 90 },
  critique: { x: 740, y: 90 },
  finalize: { x: 935, y: 10 },
  abstain: { x: 935, y: 175 },
  rewrite_query: { x: 465, y: 250 },
  handle_error: { x: 935, y: 300 },
};

// [source, target, sourceHandle, targetHandle, isHealingLoop]
const EDGES: [string, string, string, string, boolean][] = [
  ["validate_input", "retrieve", "r", "l", false],
  ["validate_input", "abstain", "b-s", "l", false],
  ["retrieve", "grade_relevance", "r", "l", false],
  ["grade_relevance", "generate", "r", "l", false],
  ["grade_relevance", "rewrite_query", "b-s", "t-t", true],
  ["grade_relevance", "abstain", "b-s", "l", false],
  ["generate", "critique", "r", "l", false],
  ["critique", "finalize", "r", "l", false],
  ["critique", "abstain", "r", "l", false],
  ["critique", "generate", "t-s", "t-t", true],
  ["critique", "rewrite_query", "b-s", "t-t", true],
  ["rewrite_query", "retrieve", "l-s", "b-t", true],
  ["rewrite_query", "abstain", "r-s", "l", false],
];

const TONE_STYLE: Record<Tone, string> = {
  idle: "bg-white/70 border-line text-faint",
  visited: "bg-white border-indigo/35 text-ink",
  active: "bg-indigo text-white border-indigo pulse-ring",
  accepted: "bg-accepted text-white border-accepted",
  withheld: "bg-withheld text-white border-withheld",
  healing: "bg-healing-soft border-healing/50 text-healing",
  error: "bg-error text-white border-error",
};

const hidden = { opacity: 0, width: 6, height: 6, border: 0, background: "transparent" };

function GraphNode({ data }: NodeProps<Node<GNodeData>>) {
  const Icon = ICONS[data.id] ?? Search;
  return (
    <div
      className={cx(
        "relative flex w-[150px] items-center gap-2 rounded-2xl border px-3 py-2.5 text-[13px] font-semibold shadow-sm transition-colors duration-300",
        TONE_STYLE[data.tone],
      )}
    >
      <Handle type="target" position={Position.Left} id="l" style={hidden} />
      <Handle type="source" position={Position.Right} id="r" style={hidden} />
      <Handle type="source" position={Position.Top} id="t-s" style={{ ...hidden, left: "65%" }} />
      <Handle type="target" position={Position.Top} id="t-t" style={{ ...hidden, left: "35%" }} />
      <Handle type="source" position={Position.Bottom} id="b-s" style={{ ...hidden, left: "60%" }} />
      <Handle type="target" position={Position.Bottom} id="b-t" style={{ ...hidden, left: "40%" }} />
      <Handle type="source" position={Position.Left} id="l-s" style={hidden} />
      <Handle type="source" position={Position.Right} id="r-s" style={hidden} />
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{NODE_LABEL[data.id]}</span>
      {data.visits > 1 && (
        <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-healing text-[10px] font-bold text-white shadow">
          {data.visits}
        </span>
      )}
    </div>
  );
}

const nodeTypes = { g: GraphNode };

export function HealingGraph({ path, running, height = 360 }: { path: string[]; running: boolean; height?: number }) {
  const { nodes, edges } = useMemo(() => {
    const visits: Record<string, number> = {};
    path.forEach((n) => (visits[n] = (visits[n] ?? 0) + 1));
    const transitions = new Set(path.slice(1).map((n, i) => `${path[i]}>${n}`));
    const last = path[path.length - 1];

    const ids = Object.keys(POS).filter((id) => id !== "handle_error" || visits[id]);
    const nodes: Node<GNodeData>[] = ids.map((id) => {
      let tone: Tone = visits[id] ? "visited" : "idle";
      if (id === "rewrite_query" && visits[id]) tone = "healing";
      if (id === "finalize" && visits[id]) tone = "accepted";
      if (id === "abstain" && visits[id]) tone = "withheld";
      if (id === "handle_error" && visits[id]) tone = "error";
      if (running && id === last) tone = "active";
      return { id, type: "g", position: POS[id], data: { id, visits: visits[id] ?? 0, tone }, draggable: false };
    });

    const edges: Edge[] = EDGES.filter(([s, t]) => ids.includes(s) && ids.includes(t)).map(([s, t, sh, th, loop]) => {
      const hit = transitions.has(`${s}>${t}`);
      const color = hit ? (loop ? "#c26a05" : "#4f46e5") : "#c5d1e2";
      return {
        id: `${s}-${t}`,
        source: s,
        target: t,
        sourceHandle: sh,
        targetHandle: th,
        type: "smoothstep",
        animated: hit && loop,
        style: { stroke: color, strokeWidth: hit ? 2.4 : 1.4, strokeDasharray: hit || loop === false ? undefined : "5 5" },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        zIndex: hit ? 2 : 1,
      };
    });
    return { nodes, edges };
  }, [path, running]);

  return (
    <div style={{ height }} className="w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          panOnDrag
          minZoom={0.3}
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </div>
  );
}

export function GraphLegend() {
  const items: [string, string][] = [
    ["bg-indigo", "Current step"],
    ["bg-white border border-indigo/40", "Visited"],
    ["bg-healing", "Healing loop"],
    ["bg-accepted", "Verified"],
    ["bg-withheld", "Withheld"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className={cx("size-2.5 rounded-full", c)} /> {l}
        </span>
      ))}
    </div>
  );
}
