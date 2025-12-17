# OrderSystem

簡介
-
一個以 Vite + React 建置的簡易訂購範例應用。

本檔說明如何在本機開發、建置、以 GitHub Pages 發佈，以及如何部署 Google Apps Script（GAS）並與本專案串接。

快速上手
-
1. 安裝相依套件

```bash
npm install
```

2. 本機開發（開啟 Vite 開發伺服器）

```bash
npm run dev
```

3. 建置

```bash
npm run build
```

4. 發佈到 GitHub Pages

預設使用 `gh-pages` 發佈 `dist` 目錄。請確認 `package.json` 的 `homepage` 已設定為你的 GitHub Pages URL，例如：

```
"homepage": "https://alanlin-cpu.github.io/OrderSystem/"
```

如要發佈：

```bash
npm run deploy
```

重要設定說明
-
- 若使用 GitHub Pages（User/Project pages），請在 `vite.config.js` 中把 `base` 設為 `/<repo-name>/`（本專案為 `/OrderSystem/`），範例：

```js
export default defineConfig({
  base: '/OrderSystem/',
  plugins: [react()]
})
```

- 在 `index.html` 中使用相對路徑載入 entry（`src/main.jsx`），讓 Vite 在建置時自動加上 `base`。

檢查與驗證
-
- 建置完成後，開啟 `dist/index.html`，確認資源路徑為 `/OrderSystem/assets/...`（或對應的 `homepage` 路徑）。
- 若使用自訂網域或 GitHub Pages 設定不同，請調整 `homepage` 與 `vite.config.js` 的 `base`。

環境變數設定（前端 → GAS/Sheet）
-
- 於專案根目錄建立 `.env.local`（或 `.env`），設定下列變數：

```bash
VITE_GAS_URL="https://script.google.com/macros/s/你的部署ID/exec"  # Apps Script Web App 的 exec URL
VITE_SHEET_ID="你的 Google Sheet ID"                               # 例如 https://docs.google.com/spreadsheets/d/<這段>/edit
VITE_SHEET_NAME="Orders"                                         # 你的訂單工作表名稱（預設 Orders）
```

- 這些變數會在執行/打包時被注入至前端的設定，對應檔案為 [src/config.js](src/config.js)。
- `VITE_GAS_URL` 可於 Apps Script 部署為 Web App 後取得，請參考下方「Google Apps Script 操作」。

其他
-
若要我幫你直接發佈或更新 `homepage`、提交檔案，我可以代為執行。

**Google Apps Script 操作（本專案版）**
-

概覽
-
- 本專案已附上參考腳本：[Code.gs](Code.gs)。它提供四個端點：
  - `doPost`（建立訂單）
  - `doPost` with `action="delete"`（標記刪除：更新 `deletedBy/At`）
  - `doPost` with `action="settlement"`（結算：寫入 `Settlement` 總表 + 產生批次明細表，並清空 `orders`）
  - `doGet`（讀取當前訂單 JSON，供前端同步）

前置準備
-
- 建立 Google 試算表，記下網址中的 Sheet ID（`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`）。
- 於試算表建立工作表：`orders`、`Settlement`（可於首次執行時自動建立）。
- 建議在 `orders` 第一列保留表頭（可留空，腳本會從第 2 列開始寫入）。

部署 Apps Script
-
1) 在試算表中選單 `Extensions` → `Apps Script` 建立專案。
2) 將本倉庫的 [Code.gs](Code.gs) 內容複製到 Apps Script 編輯器。
3) 依你的環境修改腳本頂部常數：

```javascript
const SPREADSHEET_ID = '你的 SHEET_ID';
const ORDERS_SHEET = 'orders';
const LOGS_SHEET = 'Logs';
```

4) 首次執行任一方法（例如 `doGet` 測試函式）並完成授權。
5) 點選 `Deploy` → `New deployment` → 類型選 `Web app`：
   - `Execute as`: `Me`
   - `Who has access`: 建議 `Anyone`（測試方便；正式可改為限登入或加入驗證）
   - 部署後取得 `exec` URL，填入前端 `.env.local` 的 `VITE_GAS_URL`

資料欄位（orders 工作表）
-
- 新增訂單時會 append 一列，欄位順序如下：
  1) 時間（日期）
  2) 訂單編號（`orderID`）
  3) 員工（`user`）
  4) 品項（人類可讀字串，例如 `美式 x2•$45; 拿鐵 x1•$60`）
  5) 小計（`subtotal`）
  6) 折扣（`discountAmount`）
  7) 總計（`total`）
  8) 付款方式（`paymentMethod`；本專案會塞入「方式:金額; …」的彙總字串）
  9) 折扣代碼（`promoCode`）
  10) 刪除者（`deletedBy`）
  11) 刪除時間（`deletedAt`）
  12) 品項 JSON（完整 items 陣列；此欄會自動隱藏）

端點與前端對接
-
- `POST /exec`（建立訂單）
  - 前端來源：[src/App.jsx](src/App.jsx) 會送出 payload，包含：
    - `orderID`, `timestamp`, `user`, `items`（含甜度/冰塊）、`subtotal`, `discountAmount`, `total`
    - `paymentMethod`：以「`cash:100; card:50`」形式的字串（兼容欄位）
    - `paymentAmounts`：物件（`{ cash:100, card:50 }`），目前未直接寫入欄位，但存在於結算 payload
    - `receivedAmount`, `changeAmount`, `promoCode`, `deletedBy`, `deletedAt`
- `POST /exec` with `action="delete"`
  - 以 `orderID` 搜尋並更新第 10/11 欄位（刪除者/刪除時間）。
- `POST /exec` with `action="settlement"`
  - 寫入 `Settlement` 總表一列（含小計/折扣/總計合計數），再以 `batchId` 建立/覆蓋批次明細工作表並逐筆展開。
  - 結算完成後清空 `orders` 第 2 列以下資料（保留表頭）。
- `GET /exec`（讀取訂單）
  - 回傳 `{ orders: [...] }`，欄位對應前述「資料欄位」。

前端設定重點
-
- 將 Web App `exec` URL 設至 `.env.local` 的 `VITE_GAS_URL`；Sheet ID 與表名設定於 `VITE_SHEET_ID` / `VITE_SHEET_NAME`。
- 運作模式使用 `fetch(..., { mode: 'no-cors' })` 以簡化跨域；回傳不會被前端讀取，屬於「背景投遞」。如需讀取回應/錯誤碼，請改為可回應 CORS 的部署策略或以後端代理。

安全性與最佳實務
-
- 若 Web App 設為 `Anyone` 可存取，建議：
  - 在 [Code.gs](Code.gs) 內加入簡易 API Key 驗證或來源檢查。
  - 將試算表權限限制於必要人員，僅透過 Apps Script 存取。
- 若需更嚴格控管與回應處理，建議改走：前端 → 自家後端（驗證/簽名）→ Google Sheets API。

驗證與常見問題
-
- 前端測試：
  - 設定 `.env.local` 後，執行 `npm run dev`，在 UI 送出一筆訂單，確認 `orders` 表新增一列且「付款方式」欄帶有金額彙總字串。
- 結算測試：
  - 在「訂單記錄」頁觸發結算，檢查 `Settlement` 總表與以 `batchId` 命名的明細表是否寫入成功，且 `orders` 已清空。
- 讀取同步：
  - 重新載入頁面，檢查是否能從 `doGet` 抓回未結算的訂單。
- CORS：
  - 目前採 `no-cors` 背景投遞；如需確認回應，請調整 GAS 在 `doPost`/`doGet` 回應正確 CORS header 並將前端改為 `cors`。