# Mesh Graph Inspector — Plan 檢查報告

檢查日期：2026-10-01（Asia/Taipei）。對照文件：[PLAN.md](./PLAN.md)。

## 結論與檢查範圍

整體方向可行：使用 HalfEdgeMap 建立 face adjacency，再轉 CSR，足以作為第一版 topology inspector 的核心。但原計畫存在會誤判 QA 結果的假設，應先修正再實作。

首次檢查時 repository 僅有 README，沒有 package.json、lockfile 或程式碼。首次檢查完成文件檢查與官方來源核對；沒有安裝套件、執行 topology fixtures、跑 build 或部署。下列來源是查閱時的上游分支，可能持續變更；實作時必須鎖定實際套件版本，再用該版本的 source 與 tests 確認行為。本報告保留初次檢查建議；使用者後續已授權實作，實際政策與驗證結果請見 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。

## 既有專案的核對補充

上游工具是 [QQBoxy/mesh-simplifier](https://github.com/QQBoxy/mesh-simplifier)，本機位於 `/Users/qqboxy/data/project-qqboxy/mesh-simplifier`。已讀取本機 README、package.json 與 src/main.ts：確認它以 PLYExporter 輸出 binary little-endian PLY，simplified geometry 為 indexed geometry，並有 BVH 頂點投影功能。完整引用與銜接政策已補入 [Plan](./PLAN.md)。

因此 §7 的主要輸入格式與上游 exporter 設定一致，但仍需實際匯出／重新載入測試；格式相符不等於拓樸已通過 QA。可沿用既有滑鼠操作及開檔互動方式。本專案的 Pages base 必須設為自己的 repository 路徑，不能照抄 `/mesh-simplifier/`。

## 開始實作前必須修正

### 1. 建構 HalfEdgeMap 必須明確呼叫 updateFrom（原 §3、§9）

官方 README 與型別宣告仍接受 constructor geometry，但查閱到的 JS constructor 不使用參數。單靠 `new HalfEdgeMap(geometry)` 可能沒有初始化資料。建議統一使用以下形式，並加最小 fixture 驗證：

```ts
const halfEdges = new HalfEdgeMap();
halfEdges.updateFrom(geometry);
```

來源：[JS implementation](https://github.com/gkjohnson/three-bvh-csg/blob/main/src/core/HalfEdgeMap.js)、[官方型別](https://github.com/gkjohnson/three-bvh-csg/blob/main/src/index.d.ts)、[README](https://github.com/gkjohnson/three-bvh-csg/blob/main/README.md)。

### 2. Unmatched 不等於 Boundary（原 §11、§23、§24）

找不到 sibling 只能標示為 unmatched；邊界分類另需 diagnostics。建議 UI 先顯示「Unmatched Half-Edges」，並把未執行分類的 `boundaryEdgeCount` 設為 null，避免把非流形或繞序問題算成正常開放邊界。上述區分是依來源行為提出的 QA 設計建議。[HalfEdgeMap source](https://github.com/gkjohnson/three-bvh-csg/blob/main/src/core/HalfEdgeMap.js)

### 3. 不能用 degree 或 sibling 證明沒有 unwelded seam（原 §17、§31、§48）

預設配對看 position hash，而不是 vertex ID，且尋找反向邊。因此不同 index 的同座標頂點可能仍有 sibling；繞序錯誤則可能沒有 sibling。建議 diagnostics 同時記錄「index 共享」與「座標候選共享」，將接縫和方向不一致列為獨立警告。這不改動幾何，也不取代 graph engine。[HalfEdgeMap source](https://github.com/gkjohnson/three-bvh-csg/blob/main/src/core/HalfEdgeMap.js)

座標雜湊使用固定量化寬度與整數轉換。座標尺度、接近量化門檻及大座標碰撞應納入測試；不可把配對結果視為任意尺度下的精確相等，也不可靜默縮放輸入。[hashUtils source](https://github.com/gkjohnson/three-bvh-csg/blob/main/src/core/utils/hashUtils.js)

### 4. 非 indexed 轉換必須明定不焊接（原 §8、§16、§31）

建議 `ensureIndexed()` 僅補 `0, 1, 2, ...` sequential index，保留所有頂點、face 順序及座標。不要使用 mergeVertices。新增 index 屬於表示方式轉換，需要記錄 `indexOrigin: original | generated`。

PLYLoader 可能因 face UV 或 face color 展開成 non-indexed geometry；此時 loader 的 vertex ID 不一定等於 PLY 原始 vertex ID。若要承諾保留「原始 PLY index」，需要額外保留來源 mapping；否則改寫為「保留載入後 geometry 的 index」。[PLYLoader source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/PLYLoader.js)

### 5. 只檢查 BufferGeometry 無法保證原始 PLY 全是三角形（原 §7、§8）

查閱到的 PLYLoader 會把 quad 拆成兩個 triangle，其他長度的 face list 未走三角面輸出分支。因此只驗證載入結果，會漏掉來源已被轉換或忽略的 faces。[PLYLoader source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/PLYLoader.js)

建議第一版嚴格限定來源 face list 長度為 3：在 loader 前驗證 ASCII／binary 的 face records 與實際數量，拒絕多邊形、point cloud、截斷檔案與缺少 face index 的輸入。檢查 header 的 face count 不足以證明每個 face 都有三個 index。這個驗證是原計畫額外需要排入的工作。

### 6. Diagnostics 不能全部是 optional（原 §24、§25、§48）

如果完成定義包含回答 non-manifold 與 unwelded topology，簡單 edge diagnostics 應列為必要。至少以 index edge 和座標候選 edge 分別統計 incidence、方向與涉及的 face，標示超過兩面共享、重複面、同方向邊及疑似接縫。

座標候選分組需寫清楚容差規則；量化雜湊只能找候選，不能無條件當精確幾何判斷。第一版不承諾完整 vertex non-manifold、self-intersection 或任意 T-junction 分類。若省略 edge diagnostics，必須把上述完成定義改成「unknown／未檢查」，不能用零警告表示乾淨模型。

### 7. Degenerate face 的 normal 與 graph 政策未定（原 §15、§30）

零面積法向量無法 normalize 成單位向量。建議保留 face ID，退化面輸出有限的 `[0, 0, 0]` normal、area 與 per-face flag；近零判準以模型尺度定義，例如 `area <= relativeTolerance * boundingBoxDiagonal²`，並記錄實際 tolerance。

建議退化面保留為孤立 graph node；排除其 adjacency 並在 diagnostics 記錄原因，避免 self-loop／虛假配對污染 graph。這是明確的 graph 過濾政策，不是刪面或修復幾何。若要保留原始 sibling，Inspector 可另外顯示 library 原始結果。

### 8. Graph 契約必須補齊（原 §12–§14、§17、§38）

建議採 simple undirected graph，保留所有 face nodes；有效 sibling 關係經檢查後轉 CSR：

- `offsets.length === faceCount + 1`，第一項為 0，單調不減，最後一項等於 neighbors 長度。
- Neighbor ID 必須在範圍內、排除自己、每列排序且去重；每筆 A→B 必須存在 B→A。
- 驗證 sibling edge ID、反向 lookup 與 reciprocal 關係；異常配對記錄並排除，不能默默補對稱掩蓋問題。
- `undirectedEdgeCount = neighbors.length / 2`；`directedEdgeCount = neighbors.length`；`averageDegree = neighbors.length / faceCount`。
- 1:1、每面三條邊的模式下，去重後 degree 最大為 3。Degree >3 是契約違反指標，不能當完整 non-manifold detector。
- Components 依最小未訪問 face ID 起算，確保輸出穩定；BFS queue 使用 cursor，不用反覆 Array.shift。

上述規則是建議的應用層契約；建立測試後才能宣稱符合。

## 需要補齊的規格與驗收

| 項目 | 問題與建議 |
| --- | --- |
| 普通與 disjoint adjacency（§4、§29） | V1 固定普通 1:1 sibling 模式；查閱到的 source 另有 disjoint 配對選項。第一版不要默默啟用；若未來啟用，要另定 1-to-many 與 degree 契約。[source](https://github.com/gkjohnson/three-bvh-csg/blob/main/src/core/HalfEdgeMap.js) |
| Sentinel（§11） | 查閱 source 為 -1；鎖版後在 adapter 統一處理並用 test 固定，不必讓 UI 到處自行判斷。[source](https://github.com/gkjohnson/three-bvh-csg/blob/main/src/core/HalfEdgeMap.js) |
| Draw range／groups | 分析整份 mesh；確保分析和 viewer 範圍一致，將半開區間及三角面對齊列為驗證。不要讓 faceCount 與 topology 分析範圍不同。 |
| JSON export（§34） | 現有範例沒有 positions，無法單靠輸出重建 mesh。補 positions、indices、CSR、diagnostics、indexOrigin、座標單位與 topology 套件版本；建立 schema version 與 round-trip 驗證。 |
| GNN edge index（§13） | interleaved `[s0,t0,s1,t1]` 可以當此工具的交換格式，但不可宣稱直接相容 TeethGNN。明記 shape `[E,2]`、dtype u32、layout、沒有 self-loop；未來模型 adapter 再處理實際 tensor 格式。 |
| Binary export（§35） | 決定是否屬 V1 驗收。建議先完成 JSON，Binary 延後，不建立沒有實作的介面或按鈕。真正實作時需 manifest：endianness、dtype、shape、byte length、schema 與座標 metadata。 |
| Face ID／BVH | 先用原生 raycast。若日後建 BVH，注意它可能重排 geometry index；用保留順序的配置或 mapping，並測 picking→graph→export ID 一致。[MeshBVH source](https://github.com/gkjohnson/three-mesh-bvh/blob/master/src/core/MeshBVH.js) |
| Vertex colors（§21） | Indexed 頂點共享，改頂點色可能把鄰面一起染色。建議使用獨立 overlay triangles 做選面及 N-hop 高亮，避免修改分析 geometry。 |
| Viewer 座標 | 縮放／置中只改顯示 transform；centroid、area、normal 與 export 維持輸入座標系。PLY 沒提供可依賴的單位時，明記 unknown，不自行宣稱 mm。 |
| Mouse interaction（§20、§33） | 加 pointer movement threshold，區分旋轉拖曳和點選；忽略 UI 點擊；確認背面可選需求。 |
| Non-manifold export | 允許 QA debug export，但附上 diagnostics 與未檢查項目；不能以 graph 成功建立表示 GNN-ready。 |
| Privacy（§45） | 保持模型本機解析；依賴與資源打包，避免 analytics、遠端模型 API。頁面／靜態資源請求與模型上傳需區分。 |
| Performance（§39） | 10k、100k 是目標，不是目前證明。記錄測試瀏覽器、裝置、檔案規模、load／compute／render 時間；實測出現阻塞再導入 Worker。 |
| Lifecycle | 換檔時 dispose geometry、material、overlay，清除選面狀態；處理連續開檔的非同步競爭及錯誤訊息。 |
| 檔案拆分（§9、§36） | buildHalfEdgeMap.ts 和 halfEdgeTopology.ts 命名不一致。採用後者即可；模組依責任拆分，不必一開始每個 helper 都建 class／獨立檔案。 |
| Dependencies（§2） | 鎖定相容版本與 pnpm lockfile；three-mesh-bvh 作為 CSG peer dependency 仍須滿足，不代表必須建立 picking BVH。查閱上游 package 的 peers 是 three >=0.179.0、three-mesh-bvh >=0.9.7；實際發布版再核對。[package.json](https://github.com/gkjohnson/three-bvh-csg/blob/main/package.json) |
| HalfEdgeHelper（§19、§43） | 原文一處 optional、一處 required。建議列為次要功能；正常可用就加入，否則記錄版本限制，不阻塞核心驗收。 |
| GitHub Pages（§46） | 補 Node／pnpm 版本、frozen-lockfile、tsc typecheck、repo base path 與部署 workflow。Vite build 不能代替 TypeScript typecheck。 |
| Fixtures／gitignore（§42、§45） | 使用程式生成 fixtures 或只允許 tests/fixtures 的合成 PLY，避免全部 *.ply 被忽略而測試缺檔；真實牙科掃描不提交。 |

## 建議實作順序

1. **套件可行性驗證**：鎖定版本，驗證 constructor／updateFrom、helper、sentinel、配對選項及 pathological fixtures；記錄版本和實測結果。
2. **輸入與資料核心**：嚴格 PLY validation、sequential index、face geometry、必要 diagnostics、CSR、components、stats 和 N-hop。
3. **Inspector**：Three.js viewer、click picking、overlay、unmatched 線段與 Tweakpane；確認 face ID 全流程一致。
4. **交付**：JSON schema 與 round-trip、README／limitations、typecheck／tests／build、GitHub Pages workflow 與部署路徑驗證。
5. **按需要追加**：Binary export、Worker、BVH picking、disjoint adjacency；以實測或下一階段需求決定。

## 建議補入的必要測試

除原 §42 的 fixtures，再加入：

- 相鄰面的 winding 不一致、重複面、self-sibling；不可用這些結果宣稱 boundary 正常。
- Non-manifold 三面共邊的多種 face 順序及方向；記錄 actual sibling 和被排除的關係。
- 同座標不同 index，以及座標非常接近但不同；對照 index 和幾何診斷結果。
- Quad／polygon／point cloud／truncated ASCII／truncated binary／非有限座標／非法 index。
- 空資料、index 長度不是 3 倍數、position itemSize 不為 3；必須明確拒絕。
- 退化 normal／area 永遠有限，退化節點不產生 self-loop。
- CSR invariants、edge count、deterministic components、N-hop 最短距離與去重。
- JSON round-trip、face picking ID 對應、連續換檔及 GitHub Pages 路徑 smoke check。

## 建議修正版完成定義

第一版成功表示：在已記錄的套件版本與輸入政策下，能建立可重現的 facet graph、檢視 sibling／unmatched／components、揭露已知異常並輸出有 metadata 的資料。它不保證模型已完成 manifold 修復，不保證完整識別所有 pathological topology，也不保證輸出已符合尚未指定的 TeethGNN tensor contract。

原 §48 的每個問題應各自回答「通過／異常／未支援／未檢查」，而不是以一個 Yes 代表全部成功。
