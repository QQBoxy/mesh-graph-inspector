import type { FacetGraph } from '../mesh/types';

export function computeGraphStats(graph: FacetGraph) {
  const degrees = new Uint32Array(5);
  let min = Infinity, max = 0;
  for (let face = 0; face < graph.faceCount; face++) {
    const degree = graph.offsets[face + 1] - graph.offsets[face];
    min = Math.min(min, degree); max = Math.max(max, degree); degrees[Math.min(degree, 4)]++;
  }
  return { nodes: graph.faceCount, edges: graph.neighbors.length / 2, directedEdges: graph.neighbors.length, averageDegree: graph.faceCount ? graph.neighbors.length / graph.faceCount : 0, minDegree: graph.faceCount ? min : 0, maxDegree: max, degrees };
}

export function findComponents(graph: FacetGraph) {
  const componentIds = new Uint32Array(graph.faceCount).fill(0xffffffff), queue = new Uint32Array(graph.faceCount);
  const components: { id: number; faceCount: number }[] = [];
  for (let start = 0; start < graph.faceCount; start++) {
    if (componentIds[start] !== 0xffffffff) continue;
    const id = components.length;
    let head = 0, tail = 1;
    queue[0] = start; componentIds[start] = id;
    while (head < tail) {
      const face = queue[head++];
      for (let i = graph.offsets[face]; i < graph.offsets[face + 1]; i++) {
        const neighbor = graph.neighbors[i];
        if (componentIds[neighbor] === 0xffffffff) { componentIds[neighbor] = id; queue[tail++] = neighbor; }
      }
    }
    components.push({ id, faceCount: tail });
  }
  return { componentIds, components };
}

export function neighborhood(graph: FacetGraph, start: number, depth: number) {
  if (!Number.isInteger(start) || start < 0 || start >= graph.faceCount || !Number.isInteger(depth) || depth < 0 || depth > 5) throw new Error('Face ID 或 hop depth 無效。');
  const hops = new Int8Array(graph.faceCount).fill(-1), queue = new Uint32Array(graph.faceCount);
  let head = 0, tail = 1;
  queue[0] = start; hops[start] = 0;
  while (head < tail) {
    const face = queue[head++];
    if (hops[face] === depth) continue;
    for (let i = graph.offsets[face]; i < graph.offsets[face + 1]; i++) {
      const neighbor = graph.neighbors[i];
      if (hops[neighbor] === -1) { hops[neighbor] = hops[face] + 1; queue[tail++] = neighbor; }
    }
  }
  return hops;
}
