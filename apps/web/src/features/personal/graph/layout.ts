import type { GraphEdge, GraphNode } from '@kite/shared';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

export interface PlacedNode {
  node: GraphNode;
  x: number;
  y: number;
  /** Links in and out (bigger nodes for hubs). */
  degree: number;
}

export interface GraphLayout {
  nodes: PlacedNode[];
  edges: { source: PlacedNode; target: PlacedNode }[];
  /** Bounds of the node centers, for fitting the view. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
  degree: number;
}

const TICKS = 300;

/**
 * Lays the graph out once with a force simulation (links pull, nodes repel, unconnected ones drift
 * to the middle). d3 seeds positions on a fixed spiral, so the same graph gets the same picture.
 */
export function layoutGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphLayout {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const sim: SimNode[] = nodes.map((node) => ({
    id: node.id,
    node,
    degree: degree.get(node.id) ?? 0,
  }));
  const links: SimulationLinkDatum<SimNode>[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));
  forceSimulation(sim)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance(80),
    )
    .force('charge', forceManyBody().strength(-220))
    .force('center', forceCenter(0, 0))
    .force('x', forceX(0).strength(0.05))
    .force('y', forceY(0).strength(0.05))
    .force('collide', forceCollide(26))
    .stop()
    .tick(TICKS);

  const placed = new Map<string, PlacedNode>();
  for (const s of sim)
    placed.set(s.id, { node: s.node, x: s.x ?? 0, y: s.y ?? 0, degree: s.degree });
  const list = [...placed.values()];
  const xs = list.map((n) => n.x);
  const ys = list.map((n) => n.y);
  return {
    nodes: list,
    edges: edges.flatMap((e) => {
      const source = placed.get(e.source);
      const target = placed.get(e.target);
      return source && target ? [{ source, target }] : [];
    }),
    bounds: list.length
      ? {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys),
        }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}
