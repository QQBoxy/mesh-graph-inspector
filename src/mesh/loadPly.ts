import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

// Validate source records before PLYLoader can triangulate or discard polygons.
const scalarTypes: Record<string, [number, string, number?, number?]> = {
  char: [1, 'getInt8', -128, 127], int8: [1, 'getInt8', -128, 127],
  uchar: [1, 'getUint8', 0, 255], uint8: [1, 'getUint8', 0, 255],
  short: [2, 'getInt16', -32768, 32767], int16: [2, 'getInt16', -32768, 32767],
  ushort: [2, 'getUint16', 0, 65535], uint16: [2, 'getUint16', 0, 65535],
  int: [4, 'getInt32', -2147483648, 2147483647], int32: [4, 'getInt32', -2147483648, 2147483647],
  uint: [4, 'getUint32', 0, 4294967295], uint32: [4, 'getUint32', 0, 4294967295],
  float: [4, 'getFloat32'], float32: [4, 'getFloat32'],
  double: [8, 'getFloat64'], float64: [8, 'getFloat64'],
};
type Property = { name: string; type: string; countType?: string };
type Element = { name: string; count: number; properties: Property[] };
export interface PlySource { format: string; vertexCount: number; faceCount: number }

export function validatePly(data: ArrayBuffer): PlySource {
  const bytes = new Uint8Array(data);
  let end = 0;
  const lines: string[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (end < bytes.length) {
    const start = end;
    while (end < bytes.length && bytes[end] !== 10 && bytes[end] !== 13) end++;
    const line = decoder.decode(bytes.subarray(start, end));
    if (end < bytes.length) {
      const c = bytes[end++];
      if (c === 13 && bytes[end] === 10) end++;
    }
    lines.push(line);
    if (line === 'end_header') break;
    if (end > 1_000_000) throw new Error('PLY header 過大。');
  }
  if (lines[0] !== 'ply' || lines.at(-1) !== 'end_header') throw new Error('不是有效的 PLY header。');
  let format = '';
  const elements: Element[] = [];
  for (const line of lines.slice(1, -1)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'format') {
      if (format || parts.length !== 3 || parts[2] !== '1.0' || !['ascii', 'binary_little_endian'].includes(parts[1])) {
        throw new Error('僅支援 PLY 1.0 ASCII / binary little-endian。');
      }
      format = parts[1];
    } else if (parts[0] === 'element') {
      const count = Number(parts[2]);
      if (parts.length !== 3 || !/^\d+$/.test(parts[2]) || !Number.isSafeInteger(count) || count > bytes.length || elements.some(e => e.name === parts[1])) {
        throw new Error('PLY element 數量或宣告無效。');
      }
      elements.push({ name: parts[1], count, properties: [] });
    } else if (parts[0] === 'property') {
      const element = elements.at(-1);
      const list = parts[1] === 'list';
      const type = parts[list ? 3 : 1];
      const name = parts[list ? 4 : 2];
      const countType = list ? parts[2] : undefined;
      if (!element || parts.length !== (list ? 5 : 3) || !scalarTypes[type] || (countType && scalarTypes[countType]?.[2] === undefined) || element.properties.some(p => p.name === name)) {
        throw new Error('PLY property 宣告無效。');
      }
      element.properties.push({ name, type, countType });
    } else if (!['comment', 'obj_info', ''].includes(parts[0])) {
      throw new Error(`不支援的 PLY header：${parts[0]}`);
    }
  }
  const vertex = elements.find(e => e.name === 'vertex');
  const face = elements.find(e => e.name === 'face');
  if (!format || !vertex?.count || !face?.count || !['x', 'y', 'z'].every(name => vertex.properties.some(p => p.name === name && !p.countType))) {
    throw new Error('PLY 必須包含頂點座標與三角面；不接受 point cloud。');
  }
  const faceIndex = face.properties.filter(p => ['vertex_indices', 'vertex_index'].includes(p.name));
  if (faceIndex.length !== 1 || !faceIndex[0].countType || scalarTypes[faceIndex[0].type][2] === undefined) {
    throw new Error('PLY face 必須包含一個整數 vertex_indices list。');
  }
  const tokens = format === 'ascii' ? decoder.decode(bytes.subarray(end)).trim().split(/\s+/).filter(Boolean) : [];
  let token = 0;
  let cursor = end;
  const view = new DataView(data);
  function read(type: string): number {
    const [size, method, min, max] = scalarTypes[type];
    let value: number;
    if (format === 'ascii') {
      const raw = tokens[token++];
      if (raw === undefined || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) throw new Error('PLY 資料截斷或數值無效。');
      if (min !== undefined && !/^[+-]?\d+$/.test(raw)) throw new Error('PLY 整數欄位必須使用整數表示法。');
      value = Number(raw);
    } else {
      if (cursor + size > bytes.length) throw new Error('Binary PLY 資料截斷。');
      value = (view[method as keyof DataView] as (offset: number, littleEndian: boolean) => number).call(view, cursor, true);
      cursor += size;
    }
    if (!Number.isFinite(value) || (min !== undefined && (!Number.isInteger(value) || value < min || value > max!))) throw new Error('PLY 數值非有限或超出型別範圍。');
    return value;
  }
  for (const element of elements) {
    if (!element.properties.length && element.count) throw new Error('PLY element 缺少 property。');
    for (let i = 0; i < element.count; i++) {
      for (const property of element.properties) {
        const count = property.countType ? read(property.countType) : 1;
        if (!Number.isSafeInteger(count) || count < 0 || count > bytes.length) throw new Error('PLY list 長度無效。');
        const isFace = element === face && property === faceIndex[0];
        if (isFace && count !== 3) throw new Error('僅接受三角面 PLY；不自動拆分多邊形。');
        for (let j = 0; j < count; j++) {
          const value = read(property.type);
          if (isFace && (value < 0 || value >= vertex.count)) throw new Error('PLY triangle index 超出頂點範圍。');
        }
      }
    }
  }
  if ((format === 'ascii' && token !== tokens.length) || (format !== 'ascii' && cursor !== bytes.length)) throw new Error('PLY 資料與宣告數量不符。');
  return { format, vertexCount: vertex.count, faceCount: face.count };
}

export function loadPly(data: ArrayBuffer) {
  const source = validatePly(data);
  const geometry = new PLYLoader().parse(data);
  const faceCount = (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3;
  if (faceCount !== source.faceCount) {
    geometry.dispose();
    throw new Error('PLYLoader 載入面數與來源不一致。');
  }
  return { geometry, source };
}
