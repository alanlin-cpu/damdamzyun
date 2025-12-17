# 訂單同步邏輯完整說明

## 📋 核心概念

### 訂單狀態
1. **本地訂單 (orders)**：localStorage + React state
2. **遠端訂單 (remote orders)**：Google Sheet orders 工作表
3. **已結算訂單 (settled)**：Google Sheet Settlement + 批次明細工作表
4. **本地歸檔 (archives)**：已結算的訂單本地備份

### 特殊機制
- **2分鐘寬限期**：剛提交的訂單不會立即檢查同步狀態
- **同步失敗標記 (syncFailedOrders)**：本地有但遠端沒有的訂單 (⚠️)
- **最近提交記錄 (recentSubmissionsRef)**：追蹤最近2分鐘內提交的訂單ID

---

## 🔄 完整同步流程

### 觸發時機
1. 登入後立即同步
2. 視窗重新聚焦時
3. 每 10 秒自動同步

### 同步步驟

```
handleManualSync()
  ├─ Step 1: 獲取遠端訂單 (loadOrdersFromApi)
  │   └─ 返回: { remoteIDs: Set, remoteOrders: Array }
  │
  ├─ Step 2: 獲取已結算訂單ID
  │   └─ 調用 GAS API: ?action=getSettledOrderIDs
  │   └─ 掃描所有 Settlement 批次明細工作表
  │   └─ 返回: settledIDs: Set
  │
  └─ Step 3: 處理同步結果 (processSyncResult)
      ├─ 3.1 清理過期的寬限期記錄 (>2分鐘)
      ├─ 3.2 處理已結算訂單
      ├─ 3.3 合併遠端訂單到本地
      ├─ 3.4 計算同步失敗訂單
      └─ 3.5 保存並返回最終訂單列表
```

---

## 📊 所有情況分析

### 情況1: 本地有，遠端有 ✅
**判定**：正常狀態
**處理**：
- 用遠端數據更新本地 (remoteData 覆蓋 localData)
- 無警告標記
- 保留在 orders 列表

**例子**：A裝置提交訂單 → 上傳成功 → B裝置同步 → 雙方都有

---

### 情況2: 本地有，遠端沒有，已結算 🗂️
**判定**：在其他裝置已結算
**檢查條件**：
```javascript
localOrder.orderID in settledIDs
```
**處理**：
- 自動歸檔到 archives
- 從 orders 列表移除
- 顯示 toast：「已自動歸檔 N 筆其他裝置結算的訂單」

**例子**：
1. A裝置和B裝置都有訂單#123
2. A裝置執行結算 → 訂單#123 移到 Settlement
3. B裝置同步 → 檢測到#123已結算 → 自動歸檔

---

### 情況3: 本地有，遠端沒有，未結算，在寬限期內 ⏳
**判定**：剛提交，網路上傳中
**檢查條件**：
```javascript
orderID in recentSubmissions && (now - submissionTime) < 120000ms
```
**處理**：
- 不標記警告
- 保留在 orders 列表
- 等待2分鐘後再檢查

**例子**：
1. 提交訂單#456
2. 立即記錄到 recentSubmissions
3. 背景上傳到 GAS (可能需要幾秒)
4. 5秒後觸發同步 → 遠端還沒有 → 但在寬限期內 → 不標記警告

---

### 情況4: 本地有，遠端沒有，未結算，超過寬限期 ⚠️
**判定**：同步失敗
**檢查條件**：
```javascript
!remoteIDs.has(orderID) && 
!recentSubmissions.has(orderID) && 
!settledIDs.has(orderID)
```
**處理**：
- 標記 ⚠️ 警告
- 保留在 orders 列表
- Admin 可選擇：重新上傳 或 刪除

**例子**：
1. 提交訂單#789
2. 網路斷線，上傳失敗
3. 2分鐘後同步 → 遠端沒有 → 標記警告
4. Admin 看到⚠️ → 點擊「重新上傳」

---

### 情況5: 本地沒有，遠端有 📥
**判定**：其他裝置提交的訂單
**處理**：
- 新增到本地 orders
- 不標記警告
- 正常顯示

**例子**：
1. A裝置提交訂單#999
2. B裝置同步 → 下載#999 → 顯示在訂單列表

---

### 情況6: 本地沒有，遠端沒有，但在歸檔中 ✅
**判定**：本裝置已結算
**檢查條件**：
```javascript
orderID in archivedIDs
```
**處理**：
- 不處理 (已在 archives)
- 遠端訂單過濾時排除

**例子**：
1. 本裝置結算訂單#111
2. 移到 archives
3. 同步時遠端也清空 → 不重新下載 (已歸檔)

---

## ⏰ 2分鐘寬限期的作用

### 為什麼需要？
- Google Apps Script 執行需要時間 (通常1-5秒)
- 網路延遲
- 多台裝置同時提交時的時間差

### 運作機制
```javascript
// 提交訂單時
submitOrder() {
  const orderID = computeOrderID(now)
  recentSubmissionsRef.current.set(orderID, Date.now())  // 記錄提交時間
  
  // ... 上傳到 GAS
}

// 同步時檢查
processSyncResult() {
  // 清理過期記錄
  for (const [id, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > 120000) {  // 2分鐘 = 120000ms
      recentSubmissions.delete(id)
    }
  }
  
  // 計算失敗訂單時排除寬限期內的
  if (!remoteIDs.has(id) && !recentSubmissions.has(id)) {
    // 標記為失敗
  }
}
```

### 實際案例
```
00:00 - 提交訂單#123
00:00 - 記錄到 recentSubmissions
00:05 - 同步觸發 → 遠端還沒有 → 但在寬限期 → 不警告 ✅
00:30 - 同步觸發 → 遠端還沒有 → 但在寬限期 → 不警告 ✅
02:00 - 同步觸發 → 遠端還沒有 → 但在寬限期 → 不警告 ✅
02:05 - 寬限期過期，從記錄中清除
02:10 - 同步觸發 → 遠端還沒有 → 超過寬限期 → 標記⚠️警告 ⚠️
```

---

## 🔧 兩台裝置同時提交訂單

### 場景
- A裝置：12:00:00.123 提交訂單#001
- B裝置：12:00:00.456 提交訂單#002

### 流程
```
時間軸:

12:00:00.123 (A裝置)
  ├─ 生成 orderID = 20251216120000123
  ├─ 本地 orders: [#001]
  ├─ 記錄到 recentSubmissions
  └─ 背景上傳到 GAS

12:00:00.456 (B裝置)
  ├─ 生成 orderID = 20251216120000456
  ├─ 本地 orders: [#002]
  ├─ 記錄到 recentSubmissions
  └─ 背景上傳到 GAS

12:00:05 (GAS 處理完成)
  ├─ Sheet 新增: #001
  └─ Sheet 新增: #002

12:00:10 (A裝置同步)
  ├─ 下載遠端: [#001, #002]
  ├─ 本地: [#001]
  ├─ 合併: [#001(本地), #002(遠端)]
  └─ 結果: [#001, #002] ✅

12:00:10 (B裝置同步)
  ├─ 下載遠端: [#001, #002]
  ├─ 本地: [#002]
  ├─ 合併: [#002(本地), #001(遠端)]
  └─ 結果: [#001, #002] ✅
```

### 關鍵機制
1. **orderID 唯一性**：精確到毫秒 (YYYYMMDDHHMMSSmmm)
2. **合併策略**：遠端數據優先，但保留本地未上傳的
3. **寬限期保護**：避免誤判為同步失敗

---

## 🛡️ 潛在問題與解決方案

### 問題1: 訂單ID衝突
**可能性**：極低 (毫秒級精度)
**影響**：兩台裝置同一毫秒提交
**解決**：
- 當前：使用時間戳 + 3位毫秒
- 建議：可加入隨機數或裝置ID

### 問題2: 網路長時間斷線
**可能性**：中
**影響**：大量訂單標記⚠️
**解決**：
- 保留在本地不刪除
- 網路恢復後 Admin 批量重新上傳

### 問題3: 同步期間提交新訂單
**可能性**：高
**影響**：可能在同步過程中狀態不一致
**解決**：
- 使用 useState 批量更新
- 不會覆蓋正在提交的訂單

### 問題4: 多裝置同時結算
**可能性**：低
**影響**：可能重複結算相同訂單
**解決**：
- 建議：結算前先同步
- 未來：加入結算鎖定機制

---

## ✅ 最佳實踐

### 使用建議
1. **單一裝置結算**：盡量由一台裝置執行結算
2. **結算前同步**：確保所有裝置訂單都同步
3. **定期檢查警告**：Admin 定期處理⚠️訂單
4. **網路穩定**：確保網路連線穩定

### Admin 操作
1. 看到⚠️警告 → 檢查遠端是否真的沒有
2. 確認遠端沒有 → 點擊「重新上傳」
3. 重新上傳成功 → ⚠️消失
4. 若是重複訂單 → 點擊「刪除」

---

## 🔍 除錯方法

### 檢查同步狀態
```javascript
// 在 Console 執行
console.log('本地訂單:', orders.map(o => o.orderID))
console.log('同步失敗:', Array.from(syncFailedOrders))
console.log('寬限期內:', Array.from(recentSubmissionsRef.current.keys()))
console.log('已歸檔:', archives.flatMap(a => a.orders.map(o => o.orderID)))
```

### 手動觸發同步
```javascript
handleManualSync()
```

### 清空寬限期記錄
```javascript
recentSubmissionsRef.current.clear()
```

---

## 📝 總結

### 四種訂單狀態
1. ✅ **正常**：本地有 + 遠端有
2. 🗂️ **已結算**：本地有 + 遠端沒有 + 在結算記錄中
3. ⏳ **上傳中**：本地有 + 遠端沒有 + 在寬限期內
4. ⚠️ **同步失敗**：本地有 + 遠端沒有 + 超過寬限期 + 未結算

### 2分鐘寬限期
- 給予新提交訂單上傳到遠端的緩衝時間
- 避免誤判為同步失敗
- 自動清理過期記錄

### 多裝置場景
- 自動合併其他裝置的訂單
- 自動歸檔其他裝置結算的訂單
- orderID 唯一性保證不衝突

### 漏洞防護
- 不自動刪除本地訂單（除非已結算）
- Admin 有完整控制權（重新上傳/刪除）
- 寬限期機制防止誤判
