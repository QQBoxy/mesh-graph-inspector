import { Vector3 } from 'three';
import type { FaceGeometryData } from './types';

export function computeFaceGeometry(positions: Float32Array, indices: Uint32Array): FaceGeometryData {
  const count = indices.length / 3;
  const centroids = new Float32Array(count * 3), normals = new Float32Array(count * 3), areas = new Float32Array(count), degenerate = new Uint8Array(count);
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), cross = new Vector3();
  for (let i = 0; i < positions.length; i += 3) { a.fromArray(positions, i); min.min(a); max.max(a); }
  const areaTolerance = 1e-12 * min.distanceToSquared(max);
  for (let face = 0; face < count; face++) {
    const o = face * 3;
    a.fromArray(positions, indices[o] * 3); b.fromArray(positions, indices[o + 1] * 3); c.fromArray(positions, indices[o + 2] * 3);
    for (let j = 0; j < 3; j++) centroids[o + j] = (a.getComponent(j) + b.getComponent(j) + c.getComponent(j)) / 3;
    cross.crossVectors(b.sub(a), c.sub(a));
    const area = cross.length() / 2;
    areas[face] = area;
    if (area <= areaTolerance) degenerate[face] = 1;
    else cross.normalize().toArray(normals, o);
  }
  if (![centroids, normals, areas].every(array => array.every(Number.isFinite))) throw new Error('座標尺度超過 Float32 face data 可表示範圍。');
  return { centroids, normals, areas, degenerate, areaTolerance };
}
