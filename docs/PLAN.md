# Mesh Graph Inspector — Revised Implementation Plan

> 文件建立日期：2026-10-01（Asia/Taipei）。狀態：原始計畫已保存；第一版依修正版範圍實作完成，詳見 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。
>
> 本文件保留使用者提供的 ChatGPT Plan 原文。檢查結果、建議修正與分階段順序請見 [PLAN_REVIEW.md](./PLAN_REVIEW.md)。原文第 49 節是未來實作階段的交付要求；首次文件整理階段僅建立文件與檢查計畫。使用者後續已授權實作；執行結果、驗收範圍與尚未部署事項以 IMPLEMENTATION.md 為準。
>
> 閱讀時請留意：以下 API 範例與 topology 假設尚未經安裝版本的 runtime 測試，不能直接當成已驗證規格。

## 補充：既有專案與銜接方式

前一個工具已存在，是本專案的上游輸入來源及操作方式參考：

- GitHub：[QQBoxy/mesh-simplifier](https://github.com/QQBoxy/mesh-simplifier)。
- 本機路徑：`/Users/qqboxy/data/project-qqboxy/mesh-simplifier`。
- 專案說明：[既有 README](../../mesh-simplifier/README.md)。
- 既有計畫：[既有 docs/PLAN.md](../../mesh-simplifier/docs/PLAN.md)。
- 程式參考：[既有 src/main.ts](../../mesh-simplifier/src/main.ts)。

2026-10-01 已靜態核對本機 README、package.json 與 src/main.ts；當時 HEAD 為 `a115092a201aba46592d88fd369ed173195566a5`（工作目錄內容仍可能與 commit 不同）。確認事項：

- 既有工具使用 Vite、TypeScript、Three.js、three-mesh-bvh、meshoptimizer、Tweakpane 與 pnpm。
- 簡化結果由 `createCompactGeometry()` 建立 indexed geometry，並計算法向量。
- 「下載簡化 PLY」透過 Three.js PLYExporter，以 `binary: true`、`littleEndian: true` 匯出。
- 檔名格式為 `<來源名稱>-simplified-<實際三角面數>.ply`；本工具不能依檔名假定 face count。
- 既有工具也有 BVH 頂點對應／投影操作。Inspector 應檢查最後匯出的幾何，不假定它只經過簡化。

兩個工具以使用者手動下載／開啟 PLY 銜接，保持獨立 repository。本專案可參考 viewer、Tweakpane、檔案選取及 Pages 設定，但不直接依賴另一個 repository 的本機相對路徑，也不搬入 simplification 或投影流程。

整合驗收需使用既有工具實際匯出的合成模型 PLY，核對載入後 vertex／face 數量、face 順序、位置與 adjacency；目前僅確認程式設定，尚未完成輸出檔案的 runtime round-trip。真實牙科模型不得提交至 repository。

## 1. 專案目標

建立第二個獨立 Web 工具：

**Mesh Graph Inspector**

Repository 建議名稱：

`mesh-graph-inspector`

此工具接續既有的：

`mesh-simplifier`

上一個工具負責：

```text
PLY
↓
meshoptimizer
↓
簡化至約 10,000 faces
↓
輸出 simplified PLY
```

這個新工具負責：

```text
Simplified PLY
↓
Three.js BufferGeometry
↓
three-bvh-csg HalfEdgeMap
↓
Facet adjacency
↓
Mesh dual graph
↓
Graph / topology inspection
↓
輸出 TeethGNN 後續可使用的 graph data
```

本專案第一版 **不執行 TeethGNN**。

核心目標：

> 驗證簡化後的 dental triangle mesh 是否能穩定建立 facet graph，並將 `HalfEdgeMap` 的 topology 轉成適合 GNN 使用的資料格式。

---

# 2. 技術選型

使用：

- Vite
- TypeScript
- Three.js
- Tweakpane
- `three-bvh-csg`
- `three-mesh-bvh`

Package manager：

```text
pnpm
```

Topology engine：

```ts
import { HalfEdgeMap } from 'three-bvh-csg';
```

必要時使用：

```ts
import { HalfEdgeHelper } from 'three-bvh-csg';
```

作為 topology debug visualization。

不要加入：

- React
- Vue
- Nuxt
- 自製完整 Half-Edge implementation
- `three-mesh-halfedge`

---

# 3. 為什麼使用 three-bvh-csg HalfEdgeMap

`three-bvh-csg` 已公開：

```ts
new HalfEdgeMap(geometry)
```

以及：

```ts
getSiblingTriangleIndex(triIndex, edgeIndex)
getSiblingEdgeIndex(triIndex, edgeIndex)
updateFrom(geometry)
```

因此可以直接查詢：

```text
triangle #123
edge #0
↓
sibling triangle #456
```

不需要自行建立：

```text
edge key
↓
Map
↓
edge → faces
↓
faces → neighbors
```

官方 implementation 說明中，`HalfEdgeMap` 本身就是使用 typed array 儲存：

```text
triangle edge → sibling triangle edge
```

因此優先直接利用這個資料結構。

---

# 4. 重要限制

不要假設 `HalfEdgeMap` 可以處理所有 pathological topology。

特別需要測試：

- open boundary
- non-manifold edge
- duplicated vertices
- unwelded seam
- degenerate triangle
- T-junction

`HalfEdgeMap` 主要設計是：

```text
one triangle edge
↔
one sibling triangle edge
```

因此 1-to-many edge relationship 不應假定有完整支援。

本工具第一版的責任不是修復這些 topology。

責任是：

> Detect / expose / visualize questionable topology.

---

# 5. Scope

第一版流程：

```text
Load PLY
↓
Validate triangle mesh
↓
Ensure indexed geometry
↓
Build HalfEdgeMap
↓
Read sibling triangle relationships
↓
Build facet graph
↓
Compute face geometry
↓
Analyze graph
↓
Visual inspection
↓
Export graph
```

---

# 6. 明確不做

第一版不要實作：

- TeethGNN
- ONNX
- AI inference
- WebGPU inference
- mesh simplification
- mesh repair
- remeshing
- automatic vertex welding repair
- automatic manifold repair
- label mapping
- tooth segmentation
- segmentation boundary refinement
- geodesic algorithms
- CSG operations

雖然使用 `three-bvh-csg`，但：

> 不做任何 CSG boolean operation。

只使用其中的 topology utility。

---

# 7. 輸入格式

第一版支援：

```text
PLY
```

主要輸入來源：

`mesh-simplifier`

必須支援：

- binary little-endian PLY
- ASCII PLY 若 Three.js PLYLoader 原生可以處理

預期主要模型：

```text
≈ 10,000 triangular faces
```

但程式不能 hardcode 10,000。

---

# 8. Mesh Validation

載入後先驗證：

```text
position attribute exists
geometry contains faces
face count > 0
all positions finite
triangle indices valid
```

如果 non-indexed：

轉為 indexed geometry。

如果 geometry 不是 triangle mesh：

停止處理並顯示錯誤。

不要偷偷修改輸入幾何。

---

# 9. HalfEdgeMap 建立

核心：

```ts
const halfEdgeMap = new HalfEdgeMap(geometry);
```

請包裝成獨立 module：

```text
mesh/
  buildHalfEdgeMap.ts
```

例如：

```ts
export function buildHalfEdgeTopology(
  geometry: THREE.BufferGeometry
): HalfEdgeMap
```

不要把這段寫進 UI。

---

# 10. 建立 Facet Adjacency

對每個 triangle：

```ts
for (let face = 0; face < faceCount; face++) {
  for (let edge = 0; edge < 3; edge++) {
    const sibling =
      halfEdgeMap.getSiblingTriangleIndex(face, edge);
  }
}
```

如果 sibling 存在：

```text
face A
↔
face B
```

建立 facet adjacency。

不要自己重新算 shared edge。

`HalfEdgeMap` 是 topology source of truth。

---

# 11. Boundary Detection

如果：

```ts
getSiblingTriangleIndex(face, edge)
```

回傳代表「沒有 sibling」的值：

將該 edge 視為：

```text
Boundary Edge
```

不要 hardcode sentinel value。

先查實際 library behavior / source 或 runtime 驗證。

建立：

```ts
boundaryEdges
```

資料。

---

# 12. Facet Graph Representation

不要把：

```ts
number[][]
```

當正式 runtime graph。

將 HalfEdgeMap 的 adjacency 轉成 CSR-like representation：

```ts
interface FacetGraph {
  faceCount: number;

  offsets: Uint32Array;
  neighbors: Uint32Array;
}
```

例如：

```text
offsets
[0, 3, 6, 8, ...]

neighbors
[1, 2, 5,
 0, 8, 9,
 0, 10,
 ...]
```

這將是後續 TeethGNN preprocessing 的正式 graph representation。

---

# 13. Directed GNN Edge Index

另外建立：

```ts
buildDirectedEdgeIndex()
```

例如 facet graph：

```text
10 ↔ 20
```

轉成：

```text
10 → 20
20 → 10
```

使用：

```ts
Uint32Array
```

建議 flattened：

```text
[source0, target0,
 source1, target1,
 ...]
```

避免大量 object。

---

# 14. Duplicate Neighbor Protection

即使 topology source 為 HalfEdgeMap，

轉 CSR 時仍必須避免：

```text
face A
→ B
→ B
```

這類重複 adjacency。

同一對：

```text
A ↔ B
```

Graph 只保留一次 undirected relationship。

---

# 15. Face Geometry

計算每個 facet：

```text
centroid
normal
area
vertex indices
```

建立：

```ts
interface FaceGeometryData {
  centroids: Float32Array;
  normals: Float32Array;
  areas: Float32Array;
}
```

格式：

```text
centroids
faceCount * 3

normals
faceCount * 3

areas
faceCount
```

Normal 必須 normalize。

---

# 16. Vertex Indices

保留原始 triangle index：

```text
face 0
v0
v1
v2
```

使用：

```ts
Uint32Array
```

必要時將 Uint16 index 正規化成 Uint32。

---

# 17. Graph Statistics

計算：

```text
Graph Nodes
Graph Edges

Directed GNN Edges

Average Degree
Minimum Degree
Maximum Degree

Degree 0
Degree 1
Degree 2
Degree 3
Degree > 3
```

對一般 triangular manifold surface：

```text
interior facet
degree ≈ 3
```

boundary facet：

```text
degree < 3
```

因此 degree distribution 是重要 QA 指標。

---

# 18. Connected Components

從 CSR graph 執行：

```text
BFS
or
DFS
```

計算 connected components。

輸出：

```ts
componentIds: Uint32Array
```

以及：

```ts
interface ComponentInfo {
  id: number;
  faceCount: number;
}
```

顯示：

```text
Component 0   9,984 faces
Component 1      12 faces
Component 2       4 faces
```

這可以偵測：

- isolated fragment
- broken mesh section
- simplification residue

---

# 19. HalfEdgeHelper Debug Mode

如果 `HalfEdgeHelper` 可直接正常使用，

加入：

```text
Show Half-Edge Connectivity
```

debug toggle。

使用：

```ts
const helper = new HalfEdgeHelper();
helper.setHalfEdges(geometry, halfEdgeMap);
```

只用於 visual debug。

不要依賴 Helper 做 graph computation。

Graph computation 必須直接使用：

```text
HalfEdgeMap
```

---

# 20. Face Picking

使用 Three.js raycast。

點擊模型取得：

```text
faceIndex
```

選中 face 後顯示：

```text
Face ID

Vertices
v0
v1
v2

Edge 0 sibling
Edge 1 sibling
Edge 2 sibling

Degree

Centroid

Normal

Area

Component ID
```

特別要把：

```text
edge → sibling face
```

直接顯示出來。

例如：

```text
Edge 0 → Face 341
Edge 1 → Boundary
Edge 2 → Face 455
```

這對驗證 HalfEdgeMap 非常重要。

---

# 21. Selected Facet Visualization

不要為每個 triangle 建：

```text
THREE.Mesh
```

避免：

```text
10,000 meshes
```

使用：

- overlay geometry
或
- vertex color
或
- dedicated highlight triangle

selected face：

```text
yellow
```

neighbors：

```text
different highlight color
```

其他：

```text
neutral
```

---

# 22. N-Hop Graph Inspector

支援：

```text
Hop Depth
1
2
3
4
5
```

從 selected facet 執行 BFS。

例如：

```text
Hop 0
selected

Hop 1
direct siblings

Hop 2
siblings of siblings
```

顯示 graph neighborhood。

---

# 23. Boundary Visualization

使用 HalfEdgeMap 找到：

```text
no sibling
```

的 edges。

建立：

```ts
THREE.LineSegments
```

提供：

```text
Show Boundary Edges
```

toggle。

不要每一條 edge 建獨立 Three.js Object。

---

# 24. Non-Manifold / Unsupported Topology

這一點不要自行假設 `HalfEdgeMap` 可以完整識別。

建立 diagnostics layer：

```text
Topology Diagnostics
```

至少記錄：

```text
HalfEdgeMap unmatched edge count
Boundary edge count
Unexpected sibling relationships
Duplicate graph adjacency
Disconnected components
Degenerate faces
```

對 non-manifold：

第一版先做到：

> Detect suspicious topology when possible, but do not claim full non-manifold classification unless the library provides enough information.

如果要完整判斷：

```text
edge shared by >2 faces
```

需要額外 fallback diagnostic。

這個 fallback 可以是局部簡單 edge count，

但只能作：

```text
diagnostic validation
```

不要取代 HalfEdgeMap 成為主要 graph engine。

---

# 25. Optional Diagnostic Edge Counter

允許新增一個小型 diagnostics function：

```ts
validateHalfEdgeTopology()
```

它可以建立 temporary：

```text
canonical edge → face count
```

只做：

```text
validation
```

目的：

```text
確認 HalfEdgeMap 結果
發現 non-manifold
發現 unmatched topology
```

它不是 production facet graph builder。

Production graph 仍來自：

```text
HalfEdgeMap
```

---

# 26. Open Boundary Test

Dental scan 很可能有底部 open boundary。

必須建立 fixture：

```text
Quad made of two triangles
```

外圍 4 條 edge 沒 sibling。

Expected：

```text
Internal shared edge
→ sibling exists

Outer edges
→ no sibling

Graph:
Face 0 ↔ Face 1

Components:
1
```

HalfEdgeMap 不得：

- crash
- infinite loop
- throw unexpected exception

---

# 27. Closed Mesh Test

建立 tetrahedron。

Expected：

```text
4 faces

every face degree = 3

boundary edges = 0

components = 1
```

這是 HalfEdgeMap 基本 correctness test。

---

# 28. Non-Manifold Test

建立：

```text
3 triangles sharing one geometric edge
```

測試：

```text
HalfEdgeMap actual behavior
```

不要事先假設結果。

Test 必須明確記錄：

```text
Does it throw?
Does it choose one sibling?
Does it leave edge unmatched?
Does result depend on triangle order?
```

如果結果穩定但只支援 1:1：

UI 顯示：

```text
Unsupported / ambiguous topology
```

不要把模型當成乾淨 topology。

---

# 29. T-Junction Test

建立：

```text
one long edge
with another triangle vertex touching its midpoint
```

測試：

```text
HalfEdgeMap
```

是否能建立 adjacency。

預期不要假設成功。

如果無法：

記錄 limitation：

```text
T-junction is not interpreted as regular half-edge adjacency.
```

這是可以接受的。

因為 TeethGNN input 應優先使用乾淨 triangle mesh。

---

# 30. Degenerate Triangle Test

建立：

```text
[a, a, b]
```

或面積接近 0 的 triangle。

工具必須：

```text
detect
display warning
```

不要自動 repair。

---

# 31. Duplicate Vertices Test

建立幾何上相同但 index 不同的 adjacent triangles。

例如：

```text
A1 == A2 position
但 vertex ID 不同
```

確認 HalfEdgeMap 實際行為。

如果無法配對：

標記：

```text
Unwelded topology
```

不要偷偷 weld。

因為這個工具的目的之一就是 QA。

---

# 32. UI Layout

使用 Tweakpane。

建議：

```text
File
 └─ Open PLY

Mesh
 ├─ Vertices
 ├─ Faces
 └─ Components

Half Edge
 ├─ Matched Edges
 ├─ Boundary / Unmatched
 └─ Diagnostics

Graph
 ├─ Nodes
 ├─ Undirected Edges
 ├─ Directed GNN Edges
 ├─ Average Degree
 ├─ Min Degree
 ├─ Max Degree
 ├─ Degree 0
 ├─ Degree 1
 ├─ Degree 2
 ├─ Degree 3
 └─ Degree >3

Inspector
 ├─ Selected Face
 ├─ Hop Depth
 ├─ Show Neighbors
 ├─ Show Half Edges
 ├─ Show Boundary
 └─ Wireframe

Export
 ├─ Graph JSON
 └─ Graph Binary
```

---

# 33. Viewer

使用：

```text
Three.js
OrbitControls
```

支援：

```text
left mouse rotate
wheel zoom
right mouse pan
```

延續上一個工具的使用方式。

---

# 34. Export Graph JSON

Debug 用。

例如：

```json
{
  "version": 1,
  "vertexCount": 5124,
  "faceCount": 10000,
  "graphEdgeCount": 14812,

  "faces": [
    {
      "vertices": [0, 1, 2],
      "neighbors": [1, 51, 92],
      "centroid": [1.2, 4.5, 6.7],
      "normal": [0.1, 0.4, 0.9],
      "area": 0.52,
      "component": 0
    }
  ]
}
```

只有使用者按 Export 時才 stringify。

不要 load 時自動建立大型 JSON。

---

# 35. Binary Graph Export

架構必須支援：

```text
positions.f32
indices.u32

face-centroids.f32
face-normals.f32
face-areas.f32

graph-offsets.u32
graph-neighbors.u32

directed-edge-index.u32

component-ids.u32
```

如果第一版 ZIP implementation 太花時間，

可以先：

```text
JSON export 完成
Binary exporter interface 保留
```

不要為了 ZIP 阻塞核心功能。

---

# 36. Core Project Structure

建議：

```text
src/

main.ts

mesh/
  loadPly.ts
  ensureIndexed.ts
  halfEdgeTopology.ts
  faceGeometry.ts
  diagnostics.ts
  components.ts
  types.ts

graph/
  buildFacetGraph.ts
  buildDirectedEdgeIndex.ts
  graphStats.ts
  neighborhood.ts

viewer/
  MeshViewer.ts
  FacePicker.ts
  FaceHighlighter.ts
  BoundaryOverlay.ts
  HalfEdgeOverlay.ts

export/
  exportGraphJson.ts
  exportGraphBinary.ts

ui/
  panel.ts
```

---

# 37. Separation of Responsibilities

`three-bvh-csg`：

```text
HalfEdgeMap
↓
topology source
```

我們自己的 code：

```text
HalfEdgeMap
↓
CSR graph conversion
↓
statistics
↓
connected components
↓
GNN edge index
```

不要重新實作完整 half-edge。

---

# 38. Core Types

例如：

```ts
export interface FacetGraph {
  faceCount: number;

  offsets: Uint32Array;
  neighbors: Uint32Array;

  directedEdgeIndex: Uint32Array;
}

export interface FaceGeometryData {
  centroids: Float32Array;
  normals: Float32Array;
  areas: Float32Array;
}

export interface TopologyDiagnostics {
  matchedHalfEdgeCount: number;
  unmatchedHalfEdgeCount: number;

  boundaryEdgeCount: number;

  degenerateFaceCount: number;

  suspiciousTopologyCount: number;
}

export interface MeshGraphData {
  graph: FacetGraph;
  faceGeometry: FaceGeometryData;
  componentIds: Uint32Array;
  diagnostics: TopologyDiagnostics;
}
```

可依實作調整。

---

# 39. Performance

主要目標：

```text
10k faces
```

必須非常流暢。

也應能合理處理：

```text
100k+
```

faces。

避免：

```text
O(F²)
```

不要 triangle-to-triangle brute force。

Topology：

```text
HalfEdgeMap
```

Graph traversal：

```text
O(V + E)
```

---

# 40. Timing Statistics

顯示：

```text
PLY Load
HalfEdgeMap Build
Facet Graph Conversion
Face Geometry
Connected Components
Total
```

使用：

```ts
performance.now()
```

這會幫助之後決定：

```text
是否需要 Worker
```

---

# 41. Web Worker

第一版：

不要強制 Worker。

但以下 function 必須：

```text
不依賴 DOM
不依賴 Renderer
```

例如：

```text
buildFacetGraph()
computeFaceGeometry()
findComponents()
computeGraphStats()
```

以便後續搬入 Worker。

---

# 42. Unit Tests

核心部分必須有 tests。

至少：

```text
single triangle
two triangles
open quad
tetrahedron
two disconnected components
degenerate triangle
non-manifold edge
duplicated / unwelded vertices
T-junction
```

---

# 43. Acceptance Criteria

## PLY

- [ ] 可以讀上一個 Mesh Simplifier 輸出的 PLY
- [ ] 可以處理 indexed triangle geometry
- [ ] non-indexed geometry 有清楚處理流程

## HalfEdgeMap

- [ ] 成功建立 `HalfEdgeMap`
- [ ] 可以查詢每個 triangle 三條 edge 的 sibling
- [ ] 不自行重新實作正式 half-edge engine

## Facet Graph

- [ ] triangle = graph node
- [ ] HalfEdge sibling = graph adjacency
- [ ] 可以轉 CSR
- [ ] 可以轉 directed GNN edge index
- [ ] 不產生 duplicate adjacency

## Geometry

- [ ] face centroid
- [ ] face normal
- [ ] face area
- [ ] face vertex index

## Graph Analysis

- [ ] degree distribution
- [ ] connected components
- [ ] graph edge count

## Inspector

- [ ] 點選 facet
- [ ] 顯示三個 sibling edge
- [ ] 顯示 graph neighbors
- [ ] 顯示 face geometry
- [ ] 顯示 component

## Neighborhood

- [ ] 1-hop
- [ ] 2-hop
- [ ] 3-hop
- [ ] 4-hop
- [ ] 5-hop

## Visualization

- [ ] selected face
- [ ] direct neighbors
- [ ] boundary / unmatched half-edge
- [ ] HalfEdgeHelper debug mode
- [ ] wireframe

## Diagnostics

- [ ] open boundary 不 crash
- [ ] non-manifold fixture 有明確結果
- [ ] T-junction fixture 有明確結果
- [ ] degenerate face warning
- [ ] unwelded seam 行為被記錄

## Export

- [ ] Graph JSON
- [ ] adjacency
- [ ] centroid
- [ ] normal
- [ ] area
- [ ] components

---

# 44. README

說明：

```text
Mesh Graph Inspector
```

用途：

> Browser-based facet topology and dual-graph inspection tool for preparing simplified dental meshes for TeethGNN-style graph neural network experiments.

README 要明確寫：

```text
HalfEdge topology:
three-bvh-csg HalfEdgeMap

Visualization:
Three.js

Processing:
100% browser local
```

以及 limitation：

```text
The tool does not repair non-manifold geometry,
T-junctions, or unwelded seams.
```

---

# 45. Privacy

模型：

```text
browser memory only
```

不要：

- upload
- remote API
- analytics
- server processing

`.gitignore`：

```gitignore
*.ply
*.stl
*.obj
```

---

# 46. GitHub Pages

設定：

```text
main
↓
pnpm install
↓
pnpm test
↓
pnpm build
↓
deploy dist
```

---

# 47. 最重要的設計原則

不要重新造 Half-Edge engine。

Topology 的正式來源：

```text
three-bvh-csg HalfEdgeMap
```

自己的程式只負責：

```text
HalfEdgeMap
↓
Facet Graph
↓
CSR
↓
GNN edge index
↓
Inspection / QA
```

---

# 48. 這一階段的完成定義

這個工具完成後，我們應該能回答：

```text
這個約 10k-face 的 dental mesh：

1. HalfEdgeMap 能不能穩定建構？
2. 每個 facet 的 sibling triangle 是否合理？
3. open boundary 是否正常？
4. 是否存在 disconnected fragment？
5. degree distribution 是否正常？
6. 是否有 unwelded topology？
7. 是否存在 HalfEdgeMap 無法表達的 topology？
8. 最終能不能得到穩定的 TeethGNN facet graph？
```

如果答案是 Yes，

下一階段才開始：

```text
Mesh Graph
↓
TeethGNN feature tensor
↓
ONNX / Web inference
```

---

# 49. Codex 最終要求

請不要只輸出 Plan。

直接完成 implementation。

完成後：

1. 執行 unit tests。
2. 修正失敗測試。
3. 執行 `pnpm build`。
4. 修正所有 TypeScript error。
5. 確認 GitHub Pages build。
6. 回報 HalfEdgeMap 對以下 case 的實際行為：
   - open boundary
   - non-manifold edge
   - duplicated vertices
   - T-junction
7. 回報最終 graph representation。
8. 回報已知 limitation。
9. 不要在未實測前假定 HalfEdgeMap 對 pathological topology 的行為。
