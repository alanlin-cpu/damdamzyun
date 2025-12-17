# Netlify 部署指南（Vite 專案）

## 前置準備
- 安裝 Node.js 18+ 與 npm
- 專案已在 GitHub（如 repo: `OrderSystem`）
- Netlify 帳號（https://app.netlify.com）

## 專案設定
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables（需在 Netlify 設定）:
  - `VITE_GAS_URL`
  - `VITE_SHEET_ID`
  - `VITE_SHEET_NAME`

## 一、使用 Netlify 網站介面部署（推薦）
1) 推送程式碼到 GitHub。 
2) 登入 Netlify → `Add new site` → `Import an existing project`。 
3) 選擇 Git 提供者（GitHub），授權並選取 `OrderSystem`。 
4) 設定 Build options：
   - Build command: `npm run build`
   - Publish directory: `dist`
5) 在 `Site settings` → `Environment variables` 新增上述三個變數。 
6) 點擊 `Deploy site`。首次建置完成後，會取得公開網址。

### 單頁應用（SPA）路由處理
若使用前端路由，需在專案根目錄加入 `_redirects` 檔：
```
/*    /index.html   200
```
放入 repo 後重新部署即可。

## 二、使用 Netlify CLI（本機預覽與部署）
1) 安裝 CLI：`npm install -g netlify-cli`
2) 登入：`netlify login`
3) 連接站點（首次）：`netlify init`
   - 選擇現有站點或新建站點。
4) 設定環境變數：
   - `netlify env:set VITE_GAS_URL <value>`
   - `netlify env:set VITE_SHEET_ID <value>`
   - `netlify env:set VITE_SHEET_NAME <value>`
5) 本機預覽（含 serverless 模擬）：`netlify dev`
6) 部署正式環境：`netlify deploy --prod`
   - 建置時 CLI 會自動執行 `npm run build`，並上傳 `dist`。

## 三、常見問題
- **建置失敗（缺 env）**：確認 Netlify 的環境變數已設定並重新部署。
- **路由 404**：確保 `_redirects` 已加入且位置在發佈根目錄（Vite 打包後 `dist/_redirects` 也會存在）。
- **資產路徑錯誤**：若部署子路徑，需在 `vite.config.js` 設定 `base`，例：`base: '/ordersystem/'`。

## 四、快速檢查清單
- [ ] `npm run build` 在本機可成功
- [ ] Netlify Build command = `npm run build`
- [ ] Publish directory = `dist`
- [ ] 環境變數已填寫
- [ ] SPA 使用 `_redirects`
- [ ] 完成部署，取得網址並測試主要流程
