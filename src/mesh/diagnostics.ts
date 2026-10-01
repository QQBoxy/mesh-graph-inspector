import type { TopologyDiagnostics } from './types';
import { NO_SIBLING } from './halfEdgeTopology';

export function edgeVertices(indices: Uint32Array, halfEdge: number): [number, number] {
  const offset = Math.floor(halfEdge / 3) * 3, edge = halfEdge % 3;
  return [indices[offset + edge], indices[offset + (edge + 1) % 3]];
}

export function diagnoseTopology(positions: Float32Array, indices: Uint32Array, degenerate: Uint8Array, siblings: Int32Array) {
  // Exact loaded Float32 coordinates are intentional: no welding and no approximate seam claims.
  const vertexKeys: string[] = [];
  for (let i = 0; i < positions.length; i += 3) vertexKeys.push(`${positions[i]},${positions[i + 1]},${positions[i + 2]}`);
  const edges = new Map<string, number[]>(), faces = new Map<string, number[]>();
  const blocked = new Uint8Array(indices.length), boundary: number[] = [], unmatched: number[] = [];
  const diagnostics: TopologyDiagnostics = {
    matchedHalfEdgeCount: 0, unmatchedHalfEdgeCount: 0, boundaryEdgeCount: 0,
    nonManifoldEdgeCount: 0, windingConflictCount: 0, unweldedEdgeCount: 0,
    duplicateFaceCount: 0, degenerateFaceCount: degenerate.reduce((a, b) => a + b, 0),
    unexpectedSiblingCount: 0, excludedHalfEdgeCount: 0, duplicateAdjacencyCount: 0, hashMismatchCount: 0,
    warnings: [], unchecked: ['任意 T-junction', 'vertex non-manifold', 'self-intersection', '近座標接縫／量化門檻漏配', 'TeethGNN tensor compatibility'],
  };
  for (let face = 0; face < indices.length / 3; face++) {
    const key = Array.from(indices.subarray(face * 3, face * 3 + 3), v => vertexKeys[v]).sort().join('|');
    const group = faces.get(key);
    if (group) group.push(face); else faces.set(key, [face]);
  }
  for (const group of faces.values()) {
    if (group.length > 1) {
      diagnostics.duplicateFaceCount += group.length;
      for (const face of group) blocked.fill(1, face * 3, face * 3 + 3);
    }
  }
  for (let h = 0; h < indices.length; h++) {
    if (siblings[h] === NO_SIBLING) unmatched.push(h); else diagnostics.matchedHalfEdgeCount++;
    if (degenerate[Math.floor(h / 3)]) { blocked[h] = 1; continue; }
    const [a, b] = edgeVertices(indices, h), ka = vertexKeys[a], kb = vertexKeys[b];
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const group = edges.get(key);
    if (group) group.push(h); else edges.set(key, [h]);
  }
  for (const group of edges.values()) {
    if (group.length === 1 && !blocked[group[0]] && siblings[group[0]] === NO_SIBLING) boundary.push(group[0]);
    if (group.length > 2) {
      diagnostics.nonManifoldEdgeCount++;
      for (const h of group) blocked[h] = 1;
    }
    if (group.length === 2) {
      const [a, b] = edgeVertices(indices, group[0]), [c, d] = edgeVertices(indices, group[1]);
      if (vertexKeys[a] === vertexKeys[c] && vertexKeys[b] === vertexKeys[d]) diagnostics.windingConflictCount++;
      if (!((a === c && b === d) || (a === d && b === c))) diagnostics.unweldedEdgeCount++;
    }
  }
  diagnostics.unmatchedHalfEdgeCount = unmatched.length;
  diagnostics.boundaryEdgeCount = boundary.length;
  if (diagnostics.nonManifoldEdgeCount) diagnostics.warnings.push('多面共邊：1:1 graph 不支援，相關 adjacency 已排除。');
  if (diagnostics.windingConflictCount) diagnostics.warnings.push('共享邊方向一致：疑似 winding 不一致。');
  if (diagnostics.unweldedEdgeCount) diagnostics.warnings.push('相同座標共享邊使用不同 vertex ID：疑似未焊接接縫（也可能是屬性接縫）。');
  if (diagnostics.duplicateFaceCount) diagnostics.warnings.push('重複幾何面：相關 adjacency 已排除。');
  if (diagnostics.degenerateFaceCount) diagnostics.warnings.push('退化面保留為孤立節點；normal 設為零。');
  let largeCoordinates = false;
  for (const value of positions) if (Math.abs(value) * 1e6 + 0.5 > 2147483647) { largeCoordinates = true; break; }
  if (largeCoordinates) diagnostics.warnings.push('座標超過 library 雜湊的 Int32 安全範圍；配對可能碰撞或漏配。');
  return { diagnostics, blocked, unmatchedEdges: Uint32Array.from(unmatched), boundaryEdges: Uint32Array.from(boundary) };
}

export function hasExactReverseEdge(positions: Float32Array, indices: Uint32Array, a: number, b: number) {
  const [a0, a1] = edgeVertices(indices, a), [b0, b1] = edgeVertices(indices, b);
  for (let j = 0; j < 3; j++) if (positions[a0 * 3 + j] !== positions[b1 * 3 + j] || positions[a1 * 3 + j] !== positions[b0 * 3 + j]) return false;
  return true;
}
