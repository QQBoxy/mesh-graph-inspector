import { BufferAttribute, BufferGeometry } from 'three';
import { computeFaceGeometry } from './faceGeometry';
import { buildHalfEdgeTopology } from './halfEdgeTopology';
import { diagnoseTopology } from './diagnostics';
import { buildFacetGraph } from '../graph/buildFacetGraph';
import { findComponents } from '../graph/analysis';
import type { MeshGraphData } from './types';

export function analyzeMesh(input: BufferGeometry): MeshGraphData {
  const start = performance.now(), timings: Record<string, number> = {};
  const position = input.getAttribute('position');
  if (!position || position.itemSize !== 3 || !position.count) throw new Error('Mesh 必須包含三維 position attribute。');
  const count = input.index?.count ?? position.count;
  if (!count || count % 3 || count > 0x7fffffff) throw new Error('Mesh index 數量必須是正的 3 倍數且在 Int32 範圍內。');
  const positions = new Float32Array(position.count * 3);
  let precisionChanged = false;
  for (let i = 0; i < position.count; i++) for (let j = 0; j < 3; j++) {
    const value = position.getComponent(i, j);
    positions[i * 3 + j] = value;
    if (!Number.isFinite(value) || !Number.isFinite(positions[i * 3 + j])) throw new Error('Mesh 座標非有限或超過 Float32 範圍。');
    if (positions[i * 3 + j] !== value) precisionChanged = true;
  }
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const index = input.index?.getX(i) ?? i;
    if (!Number.isInteger(index) || index < 0 || index >= position.count) throw new Error('Triangle index 無效。');
    indices[i] = index;
  }
  // Own analysis geometry; never modify loader/source geometry or reorder faces.
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  try {
    const time = <T>(key: string, fn: () => T): T => { const begin = performance.now(); const result = fn(); timings[key] = performance.now() - begin; return result; };
    const halfEdges = time('HalfEdgeMap', () => buildHalfEdgeTopology(geometry));
    const siblings = new Int32Array(count), siblingEdges = new Int32Array(count);
    for (let h = 0; h < count; h++) {
      siblings[h] = halfEdges.getSiblingTriangleIndex(Math.floor(h / 3), h % 3);
      siblingEdges[h] = halfEdges.getSiblingEdgeIndex(Math.floor(h / 3), h % 3);
    }
    const faceGeometry = time('Face geometry', () => computeFaceGeometry(positions, indices));
    const { diagnostics, blocked, unmatchedEdges, boundaryEdges } = time('Diagnostics', () => diagnoseTopology(positions, indices, faceGeometry.degenerate, siblings));
    if (precisionChanged) diagnostics.warnings.push('來源座標轉為 Float32（GPU／匯出精度）；未進行焊接或幾何修復。');
    const graph = time('Facet graph', () => buildFacetGraph(positions, indices, siblings, siblingEdges, blocked, diagnostics));
    const { componentIds, components } = time('Components', () => findComponents(graph));
    if (components.length > 1) diagnostics.warnings.push(`Graph 包含 ${components.length} 個連通分量；隔離也可能來自已排除的異常 adjacency。`);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    timings['Compute total'] = performance.now() - start;
    return { geometry, positions, indices, indexOrigin: input.index ? 'original' : 'generated', halfEdges, siblings, siblingEdges, unmatchedEdges, boundaryEdges, graph, faceGeometry, componentIds, components, diagnostics, timings };
  } catch (error) { geometry.dispose(); throw error; }
}
