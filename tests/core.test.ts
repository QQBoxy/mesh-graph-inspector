import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from 'three';
import { HalfEdgeMap, HalfEdgeHelper } from 'three-bvh-csg';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';
import { analyzeMesh } from '../src/mesh/analyzeMesh';
import { loadPly, validatePly } from '../src/mesh/loadPly';
import { buildHalfEdgeTopology, NO_SIBLING } from '../src/mesh/halfEdgeTopology';
import { computeGraphStats, neighborhood } from '../src/graph/analysis';
import { exportGraphJson } from '../src/export/exportGraphJson';
import { createDemo } from '../src/mesh/demo';
import { geometry, single, quad, tetrahedron, nonManifold, unwelded, tJunction, degenerate, asciiPly } from './fixtures';
import type { MeshGraphData } from '../src/mesh/types';

function expectGraphValid(data: MeshGraphData) {
  const g = data.graph;
  expect(g.offsets.length).toBe(g.faceCount + 1); expect(g.offsets[0]).toBe(0); expect(g.offsets[g.faceCount]).toBe(g.neighbors.length);
  expect(g.neighbors.length % 2).toBe(0); expect(g.directedEdgeIndex.length).toBe(g.neighbors.length * 2);
  for (let face = 0; face < g.faceCount; face++) {
    const row = Array.from(g.neighbors.subarray(g.offsets[face], g.offsets[face + 1]));
    expect(row).toEqual([...new Set(row)].sort((a,b) => a-b)); expect(row.length).toBeLessThanOrEqual(3);
    for (let i = g.offsets[face]; i < g.offsets[face+1]; i++) {
      const neighbor = g.neighbors[i];
      expect(neighbor).not.toBe(face); expect(neighbor).toBeLessThan(g.faceCount);
      expect(Array.from(g.neighbors.subarray(g.offsets[neighbor], g.offsets[neighbor+1]))).toContain(face);
      expect(Array.from(g.directedEdgeIndex.subarray(i*2,i*2+2))).toEqual([face, neighbor]);
    }
  }
}

describe('installed HalfEdgeMap 0.0.18 runtime contract', () => {
  it('constructor geometry argument does not initialize; updateFrom does; -1 sentinel', () => {
    const g = single(), map = new HalfEdgeMap(g);
    expect(() => map.getSiblingTriangleIndex(0,0)).toThrow();
    map.updateFrom(g); expect(map.getSiblingTriangleIndex(0,0)).toBe(NO_SIBLING); expect(map.getSiblingEdgeIndex(0,0)).toBe(NO_SIBLING);
  });
  it('open quad: one sibling pair and four unmatched half-edges; helper usable', () => {
    const g = quad(), map = buildHalfEdgeTopology(g);
    expect(map.getSiblingTriangleIndex(0,2)).toBe(1); expect(map.getSiblingEdgeIndex(0,2)).toBe(0);
    expect(map.getSiblingTriangleIndex(1,0)).toBe(0);
    const helper = new HalfEdgeHelper(); helper.setHalfEdges(g,map);
    expect(helper.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(Array.from(helper.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    helper.geometry.dispose();
  });
  it('3 faces on one edge choose a pair depending on face order, not full adjacency', () => {
    const pairings = new Set<string>();
    for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
      const g = nonManifold(order), map = buildHalfEdgeTopology(g);
      const ids = order.map((original, i) => ({ original, sibling: map.getSiblingTriangleIndex(i,0) }));
      expect(ids.filter(v => v.sibling < 0)).toHaveLength(1);
      const pair = ids.filter(v => v.sibling >= 0).map(v => v.original).sort().join('-'); pairings.add(pair);
      const data = analyzeMesh(g);
      expect(data.diagnostics.nonManifoldEdgeCount).toBe(1); expect(data.diagnostics.unmatchedHalfEdgeCount).toBe(7);
      expect(data.graph.neighbors.length).toBe(0); expect(data.components.length).toBe(3); expectGraphValid(data);
    }
    expect([...pairings].sort()).toEqual(['0-1','1-2']);
  });
  it('duplicate vertex IDs pair by position without welding; near hash match rejected by exact check', () => {
    const g = unwelded(), before = Array.from(g.index!.array), map = buildHalfEdgeTopology(g);
    expect(map.getSiblingTriangleIndex(0,0)).toBe(1);
    const data = analyzeMesh(g); expect(data.diagnostics.unweldedEdgeCount).toBe(1); expect(data.graph.neighbors.length).toBe(2);
    expect(Array.from(g.index!.array)).toEqual(before); expect(data.positions.length / 3).toBe(6);
    const near = analyzeMesh(unwelded(1e-7));
    expect(near.siblings[0]).toBe(1); expect(near.diagnostics.hashMismatchCount).toBe(2); expect(near.graph.neighbors.length).toBe(0);
  });
  it('T-junction remains unmatched in ordinary 1:1 mode', () => {
    const data = analyzeMesh(tJunction()); expect(data.diagnostics.unmatchedHalfEdgeCount).toBe(6); expect(data.graph.neighbors.length).toBe(0);
    expect(data.components.length).toBe(2); expect(data.diagnostics.unchecked).toContain('任意 T-junction');
  });
  it('degenerate [a,a,b] has raw self siblings, excluded from graph', () => {
    const data = analyzeMesh(degenerate());
    expect(Array.from(data.siblings)).toEqual([-1,0,0]); expect(data.diagnostics.degenerateFaceCount).toBe(1);
    expect(data.diagnostics.unexpectedSiblingCount).toBe(2); expect(data.graph.neighbors.length).toBe(0);
    expect(Array.from(data.faceGeometry.normals)).toEqual([0,0,0]); expect(Array.from(data.faceGeometry.areas)).toEqual([0]);
  });
});

describe('geometry / graph / export', () => {
  it.each([['single', single, 1, 3], ['quad', quad, 1, 4], ['tetrahedron', tetrahedron, 1, 0]] as const)('%s validates graph and expected components/boundaries', (_name, fixture, components, boundaries) => {
    const data = analyzeMesh(fixture()); expectGraphValid(data);
    expect(data.components.length).toBe(components); expect(data.diagnostics.boundaryEdgeCount).toBe(boundaries);
    for (const normal of data.faceGeometry.normals) expect(Number.isFinite(normal)).toBe(true);
    if (data.graph.faceCount === 4) { const stats = computeGraphStats(data.graph); expect(stats.minDegree).toBe(3); expect(stats.maxDegree).toBe(3); expect(stats.edges).toBe(6); }
  });
  it('generates sequential indices without welding for non-indexed geometry', () => {
    const g = quad().toNonIndexed(), data = analyzeMesh(g);
    expect(data.indexOrigin).toBe('generated'); expect(Array.from(data.indices)).toEqual([0,1,2,3,4,5]);
    expect(g.index).toBeNull(); expect(data.graph.neighbors.length).toBe(2); expect(data.diagnostics.unweldedEdgeCount).toBe(1);
  });
  it('keeps disconnected components and IDs deterministic', () => {
    const data = analyzeMesh(geometry([0,0,0,1,0,0,0,1,0, 10,0,0,11,0,0,10,1,0], [0,1,2,3,4,5]));
    expect(Array.from(data.componentIds)).toEqual([0,1]); expect(data.components).toEqual([{id:0,faceCount:1},{id:1,faceCount:1}]);
  });
  it('winding conflicts are unmatched, not boundary on the shared edge', () => {
    const g = quad(); g.setIndex([0,1,2, 0,3,2]); const data = analyzeMesh(g);
    expect(data.diagnostics.windingConflictCount).toBe(1); expect(data.diagnostics.unmatchedHalfEdgeCount).toBe(6); expect(data.diagnostics.boundaryEdgeCount).toBe(4);
  });
  it('duplicate reversed faces do not make graph edges', () => {
    const data = analyzeMesh(geometry([0,0,0,1,0,0,0,1,0], [0,1,2,2,1,0]));
    expect(data.diagnostics.duplicateFaceCount).toBe(2); expect(data.graph.neighbors.length).toBe(0); expect(data.diagnostics.excludedHalfEdgeCount).toBe(6);
  });
  it('near-zero triangle detected; large/negative coordinates remain finite', () => {
    const data = analyzeMesh(geometry([0,0,0, 1,0,0, 0,1e-13,0], [0,1,2]));
    expect(data.faceGeometry.degenerate[0]).toBe(1); expect(Array.from(data.faceGeometry.normals)).toEqual([0,0,0]);
    const large = analyzeMesh(geometry([-5000,0,0,-5001,0,0,-5000,1,0],[0,1,2]));
    expect(large.diagnostics.warnings.some(w => w.includes('Int32'))).toBe(true); expectGraphValid(large);
  });
  it('validates malformed geometry', () => {
    expect(() => analyzeMesh(new BufferGeometry())).toThrow();
    expect(() => analyzeMesh(geometry([0,0,0], []))).toThrow();
    expect(() => analyzeMesh(geometry([0,0,0,1,0,0,0,1,0], [0,1]))).toThrow();
    expect(() => analyzeMesh(geometry([0,0,0,1,0,0,0,1,0], [0,1,5]))).toThrow();
    expect(() => analyzeMesh(geometry([NaN,0,0,1,0,0,0,1,0], [0,1,2]))).toThrow();
    const g = single(); g.setIndex(new BufferAttribute(Float32Array.from([0,1.5,2]),1)); expect(() => analyzeMesh(g)).toThrow();
    g.setAttribute('position',new BufferAttribute(new Float32Array(6),2)); expect(() => analyzeMesh(g)).toThrow();
  });
  it('ignores input drawRange/groups for whole-mesh inspection and leaves source unchanged', () => {
    const g = quad(); g.setDrawRange(3,3); g.addGroup(3,3,0); const data = analyzeMesh(g);
    expect(data.graph.neighbors.length).toBe(2); expect(data.geometry.drawRange).toEqual({start:0,count:Infinity}); expect(g.drawRange).toEqual({start:3,count:3});
  });
  it('1–5 hops use shortest path distance and do not cross components', () => {
    const data = analyzeMesh(createDemo(5)); expectGraphValid(data);
    for (let depth=1;depth<=5;depth++) {
      const hops = neighborhood(data.graph,0,depth); expect(hops[0]).toBe(0);
      for (let face=0;face<hops.length;face++) {
        expect(hops[face]).toBeLessThanOrEqual(depth);
        if (hops[face] > 0) expect(Array.from(data.graph.neighbors.subarray(data.graph.offsets[face],data.graph.offsets[face+1])).some(n => hops[n] === hops[face]-1)).toBe(true);
      }
    }
    expect(() => neighborhood(data.graph,-1,1)).toThrow(); expect(() => neighborhood(data.graph,0,6)).toThrow();
  });
  it('JSON round-trip retains geometry, CSR, sibling data and metadata', () => {
    const data = analyzeMesh(quad()), parsed = JSON.parse(exportGraphJson(data,'quad.ply'));
    const restored = analyzeMesh(geometry(parsed.positions, parsed.indices));
    expect(Array.from(restored.graph.offsets)).toEqual(parsed.graph.offsets); expect(Array.from(restored.graph.neighbors)).toEqual(parsed.graph.neighbors);
    expect(Array.from(restored.siblings)).toEqual(parsed.topology.siblingFaces); expect(parsed.metadata.edgeIndex.shape).toEqual([2,2]);
    expect(parsed.metadata.topologyVersion).toBe('0.0.18'); expect(parsed.diagnostics.unchecked.length).toBeGreaterThan(0);
  });
  it('native raycast faceIndex corresponds to graph/export face order including back faces', () => {
    const data = analyzeMesh(quad()), mesh = new Mesh(data.geometry,new MeshBasicMaterial({side:DoubleSide}));
    mesh.updateMatrixWorld();
    for (const [point,face] of [[new Vector3(0.8,0.2,1),0],[new Vector3(0.2,0.8,1),1]] as const) {
      const hit = new Raycaster(point,new Vector3(0,0,-1)).intersectObject(mesh)[0]; expect(hit.faceIndex).toBe(face);
      expect(Array.from(data.indices.subarray(face*3,face*3+3))).toEqual(face===0?[0,1,2]:[0,2,3]);
    }
    expect(new Raycaster(new Vector3(0.8,0.2,-1),new Vector3(0,0,1)).intersectObject(mesh)[0].faceIndex).toBe(0);
  });
});

describe('strict PLY source validation', () => {
  beforeAll(() => vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; }));
  afterAll(() => vi.unstubAllGlobals());
  it('loads ASCII and little-endian binary from same PLYExporter path as mesh-simplifier', () => {
    const input = quad(); input.computeVertexNormals();
    for (const binary of [false,true]) {
      const output = new PLYExporter().parse(new Mesh(input), () => undefined, { binary, littleEndian:true });
      const bytes = typeof output === 'string' ? new TextEncoder().encode(output).buffer : output as ArrayBuffer;
      const loaded = loadPly(bytes), data = analyzeMesh(loaded.geometry);
      expect(loaded.source.faceCount).toBe(2); expect(loaded.source.vertexCount).toBe(4);
      expect(Array.from(data.positions)).toEqual(Array.from(input.getAttribute('position').array)); expect(Array.from(data.indices)).toEqual([0,1,2,0,2,3]); expectGraphValid(data);
    }
  });
  it('rejects quad, polygon, point cloud, truncated records, trailing data, invalid positions and indices', () => {
    expect(() => validatePly(asciiPly([[0,0,0],[1,0,0],[1,1,0],[0,1,0]],[[0,1,2,3]]))).toThrow(/三角面/);
    expect(() => validatePly(asciiPly([[0,0,0],[1,0,0],[0,1,0]],[]))).toThrow(/point cloud/);
    const input = new TextDecoder().decode(asciiPly());
    for (const text of [input.replace('3 0 1 2','3 0 1'),input+'1',input.replace('0 0 0','NaN 0 0'),input.replace('3 0 1 2','3 0 1 9'),input.replace('3 0 1 2','3 -1 1 2'),input.replace('3 0 1 2','3 0 1.5 2')]) expect(() => validatePly(new TextEncoder().encode(text).buffer)).toThrow();
  });
  it('rejects truncated binary and binary invalid face lengths/indices', () => {
    const output = new PLYExporter().parse(new Mesh(single()),()=>undefined,{binary:true,littleEndian:true}) as ArrayBuffer;
    expect(() => validatePly(output.slice(0,-1))).toThrow(/截斷/);
    const length = output.slice(0), index = output.slice(0);
    new DataView(length).setUint8(length.byteLength-13,4); expect(() => validatePly(length)).toThrow(/三角面/);
    new DataView(index).setUint32(index.byteLength-4,999,true); expect(() => validatePly(index)).toThrow(/範圍/);
  });
  it('rejects integer scientific notation which PLYLoader would interpret differently', () => {
    const text = new TextDecoder().decode(asciiPly()).replace('3 0 1 2','3 0 1e0 2');
    expect(() => validatePly(new TextEncoder().encode(text).buffer)).toThrow(/整數表示法/);
  });
  it('records generated index when loader expands face UVs', () => {
    const text = new TextDecoder().decode(asciiPly()).replace('end_header','property list uchar float texcoord\nend_header').replace('3 0 1 2','3 0 1 2 6 0 0 1 0 0 1');
    const loaded = loadPly(new TextEncoder().encode(text).buffer), data = analyzeMesh(loaded.geometry);
    expect(data.indexOrigin).toBe('generated'); expect(data.source).toBeUndefined(); expect(loaded.source.vertexCount).toBe(3);
  });
});
