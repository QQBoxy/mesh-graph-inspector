import type { BufferGeometry } from 'three';
import type { HalfEdgeMap } from 'three-bvh-csg';
import type { PlySource } from './loadPly';

export interface FacetGraph { faceCount: number; offsets: Uint32Array; neighbors: Uint32Array; directedEdgeIndex: Uint32Array }
export interface FaceGeometryData { centroids: Float32Array; normals: Float32Array; areas: Float32Array; degenerate: Uint8Array; areaTolerance: number }
export interface TopologyDiagnostics {
  matchedHalfEdgeCount: number; unmatchedHalfEdgeCount: number; boundaryEdgeCount: number;
  nonManifoldEdgeCount: number; windingConflictCount: number; unweldedEdgeCount: number;
  duplicateFaceCount: number; degenerateFaceCount: number; unexpectedSiblingCount: number;
  excludedHalfEdgeCount: number; duplicateAdjacencyCount: number; hashMismatchCount: number;
  warnings: string[]; unchecked: string[];
}
export interface MeshGraphData {
  geometry: BufferGeometry; positions: Float32Array; indices: Uint32Array;
  indexOrigin: 'original' | 'generated'; halfEdges: HalfEdgeMap;
  siblings: Int32Array; siblingEdges: Int32Array; unmatchedEdges: Uint32Array; boundaryEdges: Uint32Array;
  faceGeometry: FaceGeometryData; graph: FacetGraph;
  componentIds: Uint32Array; components: { id: number; faceCount: number }[];
  diagnostics: TopologyDiagnostics; timings: Record<string, number>; source?: PlySource;
}
