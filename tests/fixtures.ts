import { BufferAttribute, BufferGeometry } from 'three';
export function geometry(positions: number[], indices?: number[]) {
  const result = new BufferGeometry().setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  if (indices) result.setIndex(indices);
  return result;
}
export const single = () => geometry([0,0,0, 1,0,0, 0,1,0], [0,1,2]);
export const quad = () => geometry([0,0,0, 1,0,0, 1,1,0, 0,1,0], [0,1,2, 0,2,3]);
export const tetrahedron = () => geometry([0,0,0, 1,0,0, 0,1,0, 0,0,1], [0,2,1, 0,1,3, 1,2,3, 2,0,3]);
export const nonManifold = (order = [0,1,2]) => {
  const faces = [[0,1,2], [1,0,3], [0,1,4]];
  return geometry([0,0,0, 1,0,0, 0,1,0, 0,-1,0, 0,0,1], order.flatMap(i => faces[i]));
};
export const unwelded = (delta = 0) => geometry([0,0,0, 1,0,0, 0,1,0, 1,delta,0, 0,delta,0, 1,-1,0], [0,1,2, 3,4,5]);
export const tJunction = () => geometry([0,0,0, 2,0,0, 0,1,0, 1,0,0, 1,-1,0], [0,1,2, 3,0,4]);
export const degenerate = () => geometry([0,0,0, 1,0,0], [0,0,1]);
export function asciiPly(vertices: number[][] = [[0,0,0],[1,0,0],[0,1,0]], faces: number[][] = [[0,1,2]]) {
  return new TextEncoder().encode(`ply\nformat ascii 1.0\nelement vertex ${vertices.length}\nproperty float x\nproperty float y\nproperty float z\nelement face ${faces.length}\nproperty list uchar int vertex_indices\nend_header\n${vertices.map(v => v.join(' ')).join('\n')}\n${faces.map(f => `${f.length} ${f.join(' ')}`).join('\n')}\n`).buffer;
}
