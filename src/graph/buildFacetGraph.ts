import { NO_SIBLING } from '../mesh/halfEdgeTopology';
import { hasExactReverseEdge } from '../mesh/diagnostics';
import type { FacetGraph, TopologyDiagnostics } from '../mesh/types';

export function buildFacetGraph(positions: Float32Array, indices: Uint32Array, siblings: Int32Array, siblingEdges: Int32Array, blocked: Uint8Array, diagnostics: TopologyDiagnostics): FacetGraph {
  const faceCount = indices.length / 3;
  const accepted = new Int32Array(indices.length).fill(NO_SIBLING);
  for (let h = 0; h < siblings.length; h++) {
    const face = Math.floor(h / 3), sibling = siblings[h], edge = siblingEdges[h];
    if (sibling === NO_SIBLING) continue;
    if (sibling < 0 || sibling >= faceCount || sibling === face || edge < 0 || edge > 2 || siblings[sibling * 3 + edge] !== face || siblingEdges[sibling * 3 + edge] !== h % 3) {
      diagnostics.unexpectedSiblingCount++; continue;
    }
    const other = sibling * 3 + edge;
    if (!hasExactReverseEdge(positions, indices, h, other)) { diagnostics.hashMismatchCount++; continue; }
    if (blocked[h] || blocked[other]) { diagnostics.excludedHalfEdgeCount++; continue; }
    accepted[h] = sibling;
  }
  const offsets = new Uint32Array(faceCount + 1);
  const rows = new Uint32Array(indices.length);
  let count = 0;
  for (let face = 0; face < faceCount; face++) {
    // Only three candidates per row: constant-size sorting/deduplication.
    const row = Array.from(accepted.subarray(face * 3, face * 3 + 3)).filter(id => id !== NO_SIBLING).sort((a, b) => a - b);
    for (let i = 0; i < row.length; i++) {
      if (i && row[i] === row[i - 1]) diagnostics.duplicateAdjacencyCount++;
      else rows[count++] = row[i];
    }
    offsets[face + 1] = count;
  }
  const neighbors = rows.slice(0, count);
  const directedEdgeIndex = new Uint32Array(count * 2);
  for (let face = 0; face < faceCount; face++) {
    for (let i = offsets[face]; i < offsets[face + 1]; i++) {
      directedEdgeIndex[i * 2] = face; directedEdgeIndex[i * 2 + 1] = neighbors[i];
    }
  }
  if (diagnostics.hashMismatchCount) diagnostics.warnings.push('Library sibling 座標並不精確反向一致：量化／雜湊疑似碰撞，已排除。');
  if (diagnostics.unexpectedSiblingCount) diagnostics.warnings.push('發現 self-sibling 或非 reciprocal 關係，已排除。');
  return { faceCount, offsets, neighbors, directedEdgeIndex };
}
