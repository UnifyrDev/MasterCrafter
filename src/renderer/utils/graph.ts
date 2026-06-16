export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphLayoutNode extends GraphNode {
  x: number;
  y: number;
}

export function layoutCircularGraph(nodes: GraphNode[], radius = 220): GraphLayoutNode[] {
  const count = Math.max(nodes.length, 1);

  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

export function layoutQuestGraph(nodes: GraphNode[], edges: GraphEdge[]): GraphLayoutNode[] {
  const depths = new Map<string, number>();

  const roots = nodes.filter((node) => !edges.some((edge) => edge.target === node.id));
  const queue = roots.map((node) => ({ id: node.id, depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextEdges = edges.filter((edge) => edge.source === current.id);

    for (const edge of nextEdges) {
      if (!depths.has(edge.target) || depths.get(edge.target)! < current.depth + 1) {
        depths.set(edge.target, current.depth + 1);
        queue.push({ id: edge.target, depth: current.depth + 1 });
      }
    }

    if (!depths.has(current.id)) {
      depths.set(current.id, current.depth);
    }
  }

  const lanes = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0;
    const lane = lanes.get(depth) ?? [];
    lane.push(node);
    lanes.set(depth, lane);
  }

  return nodes.map((node) => {
    const depth = depths.get(node.id) ?? 0;
    const lane = lanes.get(depth) ?? [];
    const index = lane.findIndex((entry) => entry.id === node.id);
    return {
      ...node,
      x: depth * 280,
      y: index * 120 - ((lane.length - 1) * 60),
    };
  });
}
