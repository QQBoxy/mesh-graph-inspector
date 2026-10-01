import './style.css';
import { Pane } from 'tweakpane';
import type { BufferGeometry } from 'three';
import { loadPly } from './mesh/loadPly';
import { analyzeMesh } from './mesh/analyzeMesh';
import { createDemo } from './mesh/demo';
import { computeGraphStats } from './graph/analysis';
import { exportGraphJson } from './export/exportGraphJson';
import { MeshViewer, type ViewSettings } from './viewer/MeshViewer';
import type { MeshGraphData } from './mesh/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status'), file = $<HTMLInputElement>('file');
let data: MeshGraphData | undefined, fileName = '', ticket = 0;
const settings: ViewSettings & { selectedFace: number } = { selectedFace: -1, hopDepth: 1, showNeighbors: true, showUnmatched: false, showBoundary: false, showHalfEdges: false, wireframe: false };
const viewer = new MeshViewer($('viewport'), selectFace);
const pane = new Pane({ container: $('pane'), title: 'INSPECTOR / 檢查面板' });
const files = pane.addFolder({ title: 'File' });
files.addButton({ title: '開啟 PLY' }).on('click', () => file.click());
files.addButton({ title: '合成示範網格' }).on('click', () => { ticket++; acceptGeometry(createDemo(), 'Synthetic open sheet'); });
files.addButton({ title: '重設視角' }).on('click', () => viewer.home());
const stats = { vertices: 0, faces: 0, components: 0, edges: 0, directedEdges: 0, averageDegree: 0, minDegree: 0, maxDegree: 0, degree0: 0, degree1: 0, degree2: 0, degree3: 0, degreeOver3: 0, matched: 0, unmatched: 0, boundary: 0 };
const meshFolder = pane.addFolder({ title: 'Mesh' });
for (const key of ['vertices', 'faces', 'components'] as const) meshFolder.addBinding(stats, key, { readonly: true });
const halfFolder = pane.addFolder({ title: 'Half Edge' });
for (const [key, label] of [['matched', 'Matched half-edges'], ['unmatched', 'Unmatched half-edges'], ['boundary', 'Boundary candidates']] as const) halfFolder.addBinding(stats, key, { readonly: true, label });
const graphFolder = pane.addFolder({ title: 'Graph', expanded: false });
for (const key of ['edges', 'directedEdges', 'averageDegree', 'minDegree', 'maxDegree', 'degree0', 'degree1', 'degree2', 'degree3', 'degreeOver3'] as const) graphFolder.addBinding(stats, key, { readonly: true });
const inspector = pane.addFolder({ title: 'Inspector' });
inspector.addBinding(settings, 'selectedFace', { label: 'Face ID', step: 1 }).on('change', event => selectFace(event.value));
inspector.addBinding(settings, 'hopDepth', { label: 'Hop depth', min: 1, max: 5, step: 1 }).on('change', refreshView);
for (const [key, label] of [['showNeighbors', '顯示 N-hop'], ['showUnmatched', '未配對邊'], ['showBoundary', '邊界候選'], ['showHalfEdges', 'HalfEdgeHelper'], ['wireframe', '網格線']] as const) inspector.addBinding(settings, key, { label }).on('change', refreshView);
const exportFolder = pane.addFolder({ title: 'Export' });
const exportButton = exportFolder.addButton({ title: '下載 Graph JSON', disabled: true });
exportButton.on('click', () => {
  if (!data) return;
  try {
    const url = URL.createObjectURL(new Blob([exportGraphJson(data, fileName)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${fileName.replace(/\.ply$/i, '')}-graph.json`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '已產生 QA graph JSON，並要求瀏覽器下載；包含 diagnostics 與未檢查項目。';
  } catch (error) { status.textContent = `匯出失敗：${errorMessage(error)}`; }
});
$('open').addEventListener('click', () => file.click());
$('demo').addEventListener('click', () => { ticket++; acceptGeometry(createDemo(), 'Synthetic open sheet'); });
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function refreshView() {
  try { viewer.update(settings.selectedFace, settings); } catch (error) { status.textContent = `顯示失敗：${errorMessage(error)}`; }
}
function selectFace(face: number) {
  if (!data) { settings.selectedFace = -1; pane.refresh(); return; }
  if (!Number.isInteger(face) || face < -1 || face >= data.graph.faceCount) {
    settings.selectedFace = -1; $('face-detail').textContent = 'Face ID 無效；請輸入 0 至 ' + (data.graph.faceCount - 1); pane.refresh(); refreshView(); return;
  }
  settings.selectedFace = face; pane.refresh(); refreshView();
  if (face < 0) { $('face-detail').textContent = '點選三角面，或輸入 Face ID。'; return; }
  const o = face * 3, graph = data.graph, geometry = data.faceGeometry;
  const vector = (array: Float32Array) => Array.from(array.subarray(o, o + 3), value => value.toPrecision(5)).join(', ');
  $('face-detail').textContent = [
    `Face ${face} · Component ${data.componentIds[face]}`,
    `Vertices: ${Array.from(data.indices.subarray(o, o + 3)).join(', ')}`,
    ...[0, 1, 2].map(edge => `Edge ${edge} (${edge}→${(edge + 1) % 3}): ${data!.siblings[o + edge] < 0 ? 'Unmatched' : `Face ${data!.siblings[o + edge]} / Edge ${data!.siblingEdges[o + edge]}`}`),
    `Graph degree: ${graph.offsets[face + 1] - graph.offsets[face]}`,
    `Neighbors: ${Array.from(graph.neighbors.subarray(graph.offsets[face], graph.offsets[face + 1])).join(', ') || '—'}`,
    `Centroid: ${vector(geometry.centroids)}`, `Normal: ${vector(geometry.normals)}`,
    `Area: ${geometry.areas[face].toPrecision(6)}`, `Degenerate: ${geometry.degenerate[face] ? 'Yes' : 'No'}`,
  ].join('\n');
}
function acceptGeometry(geometry: BufferGeometry, name: string, loadTime = 0, source?: MeshGraphData['source']) {
  let result: MeshGraphData;
  try { result = analyzeMesh(geometry); } catch (error) { status.textContent = `處理失敗：${errorMessage(error)}`; return; } finally { geometry.dispose(); }
  result.source = source; result.timings['PLY load'] = loadTime; result.timings['Total'] = result.timings['Compute total'] + loadTime;
  viewer.setData(result); data = result; fileName = name; settings.selectedFace = -1;
  const s = computeGraphStats(data.graph), d = data.diagnostics;
  Object.assign(stats, { vertices: data.positions.length / 3, faces: s.nodes, components: data.components.length, edges: s.edges, directedEdges: s.directedEdges, averageDegree: s.averageDegree, minDegree: s.minDegree, maxDegree: s.maxDegree, degree0: s.degrees[0], degree1: s.degrees[1], degree2: s.degrees[2], degree3: s.degrees[3], degreeOver3: s.degrees[4], matched: d.matchedHalfEdgeCount, unmatched: d.unmatchedHalfEdgeCount, boundary: d.boundaryEdgeCount });
  $('empty').hidden = true; $('model-name').textContent = name;
  $('diagnostics').textContent = [
    `Non-manifold edges: ${d.nonManifoldEdgeCount}`, `Winding conflicts: ${d.windingConflictCount}`, `Unwelded candidates: ${d.unweldedEdgeCount}`,
    `Duplicate faces: ${d.duplicateFaceCount}`, `Degenerate faces: ${d.degenerateFaceCount}`, `Unexpected siblings: ${d.unexpectedSiblingCount}`,
    `Hash mismatches: ${d.hashMismatchCount}`, `Excluded half-edges: ${d.excludedHalfEdgeCount}`, `Duplicate adjacency: ${d.duplicateAdjacencyCount}`,
    '', ...(d.warnings.length ? d.warnings : ['已檢查項目未發現異常。']), '', '未檢查：', ...d.unchecked,
    '', '邊界僅為精確座標 incidence-one 候選。\n成功建 graph 不代表 GNN-ready。',
  ].join('\n');
  $('components').textContent = data.components.slice(0, 40).map(c => `Component ${c.id}: ${c.faceCount.toLocaleString()} faces`).join('\n') + (data.components.length > 40 ? '\n…其餘分量見 JSON' : '');
  $('timings').textContent = Object.entries(data.timings).map(([key, value]) => `${key}: ${value.toFixed(2)}`).join('\n');
  exportButton.disabled = false; pane.refresh(); selectFace(-1);
  status.textContent = `已載入 ${s.nodes.toLocaleString()} faces · ${data.components.length} components${d.warnings.length ? ' · 有診斷警告，請查看右側' : ' · 已檢查項目通過，其他項目見 diagnostics'}`;
}
file.addEventListener('change', async () => {
  const selected = file.files?.[0]; if (!selected) return;
  const request = ++ticket; file.value = ''; status.textContent = '正在讀取與檢查 PLY…';
  const begin = performance.now();
  try {
    const buffer = await selected.arrayBuffer(); if (request !== ticket) return;
    const loaded = loadPly(buffer);
    if (request !== ticket) { loaded.geometry.dispose(); return; }
    acceptGeometry(loaded.geometry, selected.name, performance.now() - begin, loaded.source);
  } catch (error) { if (request === ticket) status.textContent = `載入失敗：${errorMessage(error)}（保留前一個模型）`; }
});
window.addEventListener('pagehide', () => { ticket++; viewer.dispose(); pane.dispose(); }, { once: true });
