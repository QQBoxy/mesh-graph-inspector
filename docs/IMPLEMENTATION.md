# 第一版實作與驗證紀錄

日期：2026-10-01（Asia/Taipei）。以本次安裝套件的 runtime tests 為依據，不以 API 宣告推定實際行為。

## 交付範圍

已完成 strict PLY source validation、非 indexed sequential index、HalfEdgeMap adapter、face geometry、diagnostics、CSR、components、degree statistics、1–5-hop BFS、Three.js viewer、raycast 選面、overlay highlights、未配對邊／邊界候選、HalfEdgeHelper、JSON export，以及 GitHub Pages build/deploy workflow。

採用修正版範圍：Binary／ZIP export、Worker、BVH picking 與 disjoint adjacency 延後；沒有未實作的匯出按鈕或預留空介面。沒有執行 TeethGNN、CSG 或 geometry repair。

## 鎖定版本與 HalfEdgeMap 實測

three 0.186.0、three-bvh-csg 0.0.18、three-mesh-bvh 0.9.15、Tweakpane 4.0.5。套件與 lockfile 已固定；Node.js 24、pnpm 10.21.0。

| Fixture | Library 原始結果 | 本工具處理 |
| --- | --- | --- |
| Single triangle | 三條 edge 都回傳 -1 | 1 node、0 graph edges、3 boundary candidates |
| Open quad，兩個三角面 | 內邊互為 sibling、4 unmatched half-edges | 2 nodes、1 undirected edge、1 component、4 boundary candidates |
| Tetrahedron | 所有邊配對 | 4 nodes、6 undirected edges、每面 degree 3、0 unmatched、1 component |
| 三面共一邊 | 六種面順序皆不 throw；選一對 sibling、另一面未配對，共 7 unmatched；原 fixture 的配對可能是 0↔1 或 1↔2 | exact edge incidence >2 警告；共邊 adjacency 排除，該 fixture 為 3 個孤立節點 |
| 相同位置、不同 vertex IDs | 可配對，不需要先 weld | 保留 6 vertices；記錄 1 unwelded edge candidate，graph 仍有 1 邊 |
| 配對邊偏移 1e-7 | 此 fixture 仍被雜湊配對 | exact reverse-coordinate 檢查發現 2 個 half-edge mismatch，排除該 graph adjacency |
| T-junction，長邊與部分反向短邊 | 普通模式不配對，6 unmatched | 2 components；明列任意 T-junction 未檢查，不能宣稱是乾淨 open boundary |
| Degenerate `[a,a,b]` | sibling faces 為 `[-1,0,0]`，存在 self-sibling | 零 normal、保留孤立 face、警告並排除異常 adjacency |
| 共享邊同方向 | 此 fixture 全部未配對 | 1 winding conflict，6 unmatched，但只有4 boundary candidates |
| 反向重複面 | 三條邊可配對 | 記錄兩個受影響 duplicate faces；全部 adjacency 排除 |

`new HalfEdgeMap(geometry)` 在此發布版不初始化 data，直接查 sibling 會 throw；`new HalfEdgeMap(); updateFrom(geometry)` 正常。Sentinel 為 -1。HalfEdgeHelper 可以 setHalfEdges，open quad 的線段位置皆為有限值。

## Graph 與診斷政策

- Graph 為 simple undirected CSR，face 順序維持載入結果；每列排序、去重、無 self-loop，且雙向一致。Directed edge index 用 Uint32 interleaved `[source,target]`，每個 undirected edge 輸出兩個方向。
- Components 按最小未訪問 face ID 起算；BFS 使用 typed-array queue。Hop 是 graph 最短距離，限制 1–5。
- Diagnostics 使用 exact Float32 coordinate edge incidence；不把近座標無條件當成相同幾何，也不取代 HalfEdgeMap 產生 graph。
- 多面共邊與重複面阻擋相關 adjacency；退化面 normal 為零、保留成孤立節點。面積退化門檻為 `1e-12 * boundingBoxDiagonal²`，實際值包含在 export。
- Unmatched 是 library 原始沒有 sibling 的 half-edge。Boundary candidates 只計算非退化、非重複且 exact incidence-one 的 unmatched half-edges，仍不能排除 T-junction。
- Matched／unmatched count 計數單位為 half-edge；undirected graph edge count 是去重後的面關係數，兩者不可混用。
- Raw sibling 仍可在 Inspector 與 JSON 查看；原始 sibling 與經過濾 graph neighbors 不一定一致，diagnostics 記錄過濾原因與數量。
- 載入 geometry 不被改動。分析 geometry 保留頂點與 face 順序，座標轉成 Float32；非精確精度轉換會警告。渲染只改 Group transform。drawRange／groups 不限制分析範圍。

## 輸入與匯出

PLY preflight 逐一驗證 header、scalar／list 型別、資料數量、face list 長度 3、finite values 與 index 範圍；接受 PLY 1.0 ASCII 與 binary little-endian。整數欄位拒絕 scientific notation，避免與 loader 的 parseInt 行為不同。

JSON schema version 1 包含 geometry、CSR、directed edge index、face geometry／退化 flags、raw sibling face／edge、unmatched／boundary candidates、component IDs／sizes、graph statistics、diagnostics、timings 及來源資訊。Vertex IDs 指載入後的 geometry，不承諾保留 PLY 原始 ID；coordinate unit 為 unknown。

與上游的相容性測試使用相同 Three.js PLYExporter 及 `binary:true, littleEndian:true` 產生合成模型，並驗證重新載入的頂點、indices、faces 與 adjacency。這不等於已使用真實牙科掃描完成整合驗收。

## 驗證結果

- `pnpm test`：25 tests，包括 pathological fixtures 的順序排列、strict ASCII／binary input、CSR invariants、components、N-hop、JSON round-trip、faceIndex／raycast 對照與 10k／100k smoke。
- `pnpm build`：TypeScript typecheck 與 production build 通過；`dist` 的資源路徑使用 `/mesh-graph-inspector/`。
- 瀏覽器：Codex 內建瀏覽器與 Chrome 載入合成示範；內建瀏覽器實際載入 binary quad PLY、選面、顯示 helper／未配對邊；非法 index 檔案被拒絕且前一模型保留。桌面與窄螢幕布局已查看。
- JSON serializer round-trip 已通過。瀏覽器 Export handler 能產生資料且沒有 console errors，但自動化 download-event 等待逾時，尚未確認實際下載檔案落盤；介面文字僅表示已要求瀏覽器下載。
- GitHub Actions workflow 已完成，尚未推送或在 GitHub runner 執行；沒有發布網站。

合成曲面網格在本機 macOS、Node v24.20.0 下，三次計算的 median（含 topology、face geometry、diagnostics、graph、components 與 normals/bounds；不含 PLY parse、GPU 或 JSON）初次量測：

| Faces | Compute median |
| --- | --- |
| 10,082 | 約 55 ms |
| 100,352 | 約 563 ms |

這只是合成 fixture 的本機數據，不是所有裝置或牙科掃描的效能保證。瀏覽器主執行緒在大型模型計算期間仍可能短暫阻塞；後續以真實模型實測決定是否加入 Worker。

## 已知限制

不完整分類任意 T-junction、vertex non-manifold、self-intersection、接近但不相同的接縫／量化漏配。不驗證 TeethGNN tensor contract。來源 Float64 轉 Float32 有精度限制。HalfEdgeMap 固定雜湊可能在大座標發生 Int32 alias；本工具警告並排除不精確的 sibling，但不能證明没有漏配。

PLY 使用嚴格宣告政策，包含尾端資料數量一致；不是容錯型 PLY repair loader。PLY 顏色及 UV 不作 graph feature，viewer 使用中性色。真實患者模型不提交、不上傳。

Production JS 目前約 750 kB（gzip 約 185 kB），Vite 有 chunk-size warning；Node tests 有上游 CJS Three.js deprecation warning，均不影響 tests／build 通過。新增 Worker 或 code splitting 應由實測需求決定。
