import { BufferAttribute, BufferGeometry } from 'three';
// Synthetic open curved sheet. No real dental data is bundled.
export function createDemo(size = 30) {
  const positions: number[] = [], indices: number[] = [];
  for (let y = 0; y <= size; y++) for (let x = 0; x <= size; x++) {
    const u = x / size * 2 - 1, v = y / size * 2 - 1;
    positions.push(u, 0.16 * Math.cos(u * 5) * Math.cos(v * 4) + 0.3 * u * u, v);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = y * (size + 1) + x, b = a + 1, c = a + size + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3)).setIndex(indices);
}
