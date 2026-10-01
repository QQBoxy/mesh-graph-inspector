import type { MeshGraphData } from '../mesh/types';
import { computeGraphStats } from '../graph/analysis';
import pkg from '../../package.json';

export function exportGraphJson(data: MeshGraphData, name: string) {
  return JSON.stringify({
    version: 1, name, vertexCount: data.positions.length / 3, faceCount: data.graph.faceCount,
    metadata: { topologyEngine: 'three-bvh-csg HalfEdgeMap', topologyVersion: pkg.dependencies['three-bvh-csg'], threeVersion: pkg.dependencies.three, adjacency: 'exact-reverse-validated 1:1 siblings; ambiguous/degenerate/duplicate relationships excluded', coordinateSystem: 'input local coordinates', units: 'unknown', positionDtype: 'float32', indexOrigin: data.indexOrigin, vertexIds: 'loader geometry IDs; may differ from source PLY IDs', edgeIndex: { dtype: 'uint32', shape: [data.graph.neighbors.length, 2], layout: 'interleaved source,target', selfLoops: false }, boundaryPolicy: 'exact-coordinate incidence-one unmatched candidates; T-junctions unchecked', source: data.source },
    positions: Array.from(data.positions), indices: Array.from(data.indices),
    graph: { offsets: Array.from(data.graph.offsets), neighbors: Array.from(data.graph.neighbors), directedEdgeIndex: Array.from(data.graph.directedEdgeIndex) },
    faceGeometry: { centroids: Array.from(data.faceGeometry.centroids), normals: Array.from(data.faceGeometry.normals), areas: Array.from(data.faceGeometry.areas), degenerate: Array.from(data.faceGeometry.degenerate), areaTolerance: data.faceGeometry.areaTolerance },
    topology: { siblingFaces: Array.from(data.siblings), siblingEdges: Array.from(data.siblingEdges), unmatchedHalfEdges: Array.from(data.unmatchedEdges), boundaryCandidateHalfEdges: Array.from(data.boundaryEdges) },
    componentIds: Array.from(data.componentIds), components: data.components,
    statistics: { ...computeGraphStats(data.graph), degrees: Array.from(computeGraphStats(data.graph).degrees) },
    diagnostics: data.diagnostics, timings: data.timings,
  }, null, 2);
}
