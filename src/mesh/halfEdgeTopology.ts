import type { BufferGeometry } from 'three';
import { HalfEdgeMap } from 'three-bvh-csg';

// 0.0.18's runtime options are not included in its public TypeScript declaration.
export type ConfiguredHalfEdgeMap = HalfEdgeMap & { useDrawRange: boolean; useAllAttributes: boolean; matchDisjointEdges: boolean };
export const NO_SIBLING = -1; // Locked by the installed-version fixture tests.
export function buildHalfEdgeTopology(geometry: BufferGeometry) {
  const halfEdges = new HalfEdgeMap() as ConfiguredHalfEdgeMap;
  halfEdges.useDrawRange = false;
  halfEdges.useAllAttributes = false;
  halfEdges.matchDisjointEdges = false;
  halfEdges.updateFrom(geometry);
  return halfEdges;
}
