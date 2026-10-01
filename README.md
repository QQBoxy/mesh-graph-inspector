# Mesh Graph Inspector

瀏覽器端的三角面拓樸與 dual-graph 檢查工具，接續 [QQBoxy/mesh-simplifier](https://github.com/QQBoxy/mesh-simplifier) 匯出的 PLY，提供 TeethGNN 前處理實驗用的 QA graph。第一版不執行 GNN、不修復幾何。

## 開發與驗證

使用 Node.js 24 與 pnpm 10.21.0：

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

開啟開發伺服器顯示的 `/mesh-graph-inspector/` 路徑。`pnpm build` 先執行 TypeScript typecheck；`pnpm test` 包含鎖定 library 行為、PLY validation、graph／匯出與 10k／100k 合成模型 smoke tests。

## 操作

1. 開啟 Mesh Simplifier 下載的 binary little-endian PLY，或按「合成示範網格」。同時支援 ASCII 三角面 PLY。
2. 左鍵旋轉、滾輪縮放、右鍵平移；點一下三角面或輸入 Face ID 選面。拖曳旋轉不會選面。
3. 調整 1–5 Hop depth，檢查相鄰面、每條 edge 的原始 sibling、centroid、normal、area 與 component。
4. 切換未配對邊（粉紅）、邊界候選（綠）、HalfEdgeHelper 或網格線；選面為黃，鄰域依 hop 著色。
5. 查看 diagnostics 與未檢查項目，再下載 Graph JSON。它是 QA 交換格式，不表示模型已經 GNN-ready。

## 資料與限制

- Topology：`three-bvh-csg 0.0.18` 的 HalfEdgeMap，明確呼叫 updateFrom，固定普通 1:1、position 配對模式。
- Visualization：Three.js 與 Tweakpane。Processing：100% browser local；模型不上傳，沒有 analytics 或遠端推論 API。
- Runtime graph：`Uint32Array offsets / neighbors` CSR；所有 face 保留為節點。Directed edge index 為交錯 `[source, target, ...]`，shape `[E,2]`，無 self-loop；未宣稱相容任何指定 GNN 的 tensor。
- Graph 僅接受 reciprocal 且座標精確反向相同的 library sibling。退化、重複幾何面、多面共邊與雜湊錯配相關 adjacency 被排除。
- 非 indexed geometry 只補連續 index，不焊接頂點。座標使用 Float32，來源精度轉換會警告；模型顯示置中／縮放不改匯出座標。單位為 unknown。
- Unmatched 不等於 boundary。「邊界候選」是精確座標 incidence-one 的未配對邊；任意 T-junction、vertex non-manifold、self-intersection 和近座標接縫不做完整分類。
- 可診斷同座標不同 index 的疑似未焊接接縫，但屬性接縫也可能造成此結果。PLYLoader 展開 face UV／color 時，載入後 vertex ID 可能不同於來源 PLY。
- 嚴格拒絕多邊形、point cloud、截斷資料、非法 index 與非有限數值。第一版僅接受 PLY 1.0 ASCII／binary little-endian。
- 不 repair、remesh、simplify 或執行 CSG。Binary／ZIP export、Worker、BVH picking 與 disjoint adjacency 延後。

Graph JSON 包含 positions、indices、CSR、directed edges、face geometry、原始 sibling、components、diagnostics、timings、來源數量及套件版本；僅按下 Export 時產生。詳見 [實作與驗證紀錄](docs/IMPLEMENTATION.md)。

## GitHub Pages

網站網址：[Mesh Graph Inspector](https://qqboxy.github.io/mesh-graph-inspector/)。

Vite base 是 `/mesh-graph-inspector/`。Workflow 在 PR 與 main 執行 frozen install、tests、typecheck／build，僅 main 部署 `dist`。Repository 的 Settings → Pages → Source 已設定為 GitHub Actions；後續推送至 main 會自動測試、建置與部署。

## 文件

- [Implementation Plan](docs/PLAN.md)：保留原始需求與既有專案資訊。
- [Plan Review](docs/PLAN_REVIEW.md)：初次檢查及建議修正。
- [Implementation & Validation](docs/IMPLEMENTATION.md)：實際政策、測試結果與限制。
