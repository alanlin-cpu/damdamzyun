const SPREADSHEET_ID = '1q6tvxWyaPy5pr-IqxGG-uvBPZ2-NdQW2pk_4mPV5y44';
const ORDERS_SHEET = 'orders';
const LOGS_SHEET = 'Logs';
const USERS_SHEET = 'Users';

/**
 * 將 items 轉為人類可讀的排序字串：
 * 依 `name` 排序，格式為：
 * "品項名 x數量・$單價"；以分號（;）分隔
 */
function formatItemsHumanReadable(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return list
    .map(it => `${String(it.name || '')} x${Number(it.quantity || 0)}•$${Number(it.price || 0)}`)
    .join('; ');
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const payload = raw ? JSON.parse(raw) : {};

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 結算：寫入 Settlement 總表、建立批次明細工作表、清空 orders 內容
    if (payload.action === 'settlement') {
      const settlementSheet = ss.getSheetByName('Settlement') || ss.insertSheet('Settlement');
      const batchId = String(payload.batchId || '');
      const orders = Array.isArray(payload.orders) ? payload.orders : [];

      // 確保 Settlement 表有正確表頭
      if (settlementSheet.getLastRow() === 0) {
        settlementSheet.appendRow(['時間', '批次ID', '員工', '總筆數', '小計合計', '折扣合計', '總計合計', '備註', '工作表名稱']);
      }

      // 寫入結算總表（不含明細 JSON）
      // 欄位：時間, 批次ID, 員工, 總筆數, 小計合計, 折扣合計, 總計合計, 備註, 工作表名稱
      const summaryRow = [
        new Date(),
        batchId,
        String(payload.user || ''),
        Number(payload.count || orders.length || 0),
        Number(payload.subtotalSum || 0),
        Number(payload.discountSum || 0),
        Number(payload.totalSum || 0),
        String(payload.note || ''),
        ''  // 佔位符，會在下面建立工作表後更新
      ];
      settlementSheet.appendRow(summaryRow);

      // 建立批次明細工作表（名稱為日期格式：MM-DD）
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const baseSheetName = `${month}-${day}`;
      let detailSheetName = baseSheetName;
      
      // 如果同名工作表已存在，加上序號 (2), (3), (4)...
      let counter = 2;
      while (ss.getSheetByName(detailSheetName)) {
        detailSheetName = `${baseSheetName}(${counter})`;
        counter++;
      }
      
      const detailSheet = ss.insertSheet(detailSheetName);
      
      // 更新 Settlement 表的第 9 欄（工作表名稱）
      const lastRow = settlementSheet.getLastRow();
      settlementSheet.getRange(lastRow, 9).setValue(detailSheetName);
      
      // 計算支付方式彙總（只計算未刪除訂單）
      const paymentSummary = { cash: 0, mpay: 0, code: 0 };  // 初始化所有支付方式
      let totalChange = 0;
      let totalDiscount = 0;
      let totalIncome = 0;
      
      orders.forEach(o => {
        // 只計算未刪除的訂單
        if (o.deletedAt || o.deleted) {
          return;
        }
        
        const discount = Number(o.discountAmount || 0);
        const total = Number(o.total || 0);
        
        // 優先使用 paymentAmounts 物件（新格式）
        if (o.paymentAmounts && typeof o.paymentAmounts === 'object') {
          Object.entries(o.paymentAmounts).forEach(([method, amt]) => {
            const normalizedMethod = String(method || '').toLowerCase();
            paymentSummary[normalizedMethod] = (paymentSummary[normalizedMethod] || 0) + Number(amt || 0);
          });
        } else if (o.paymentMethod) {
          // Fallback: 解析 paymentMethod 字串（舊格式）
          const pmStr = String(o.paymentMethod);
          if (pmStr.includes(';')) {
            // 多支付方式格式："cash:70; mpay:30"
            pmStr.split(';').forEach(part => {
              const [method, amtStr] = part.trim().split(':');
              if (method) {
                const normalizedMethod = method.toLowerCase();
                paymentSummary[normalizedMethod] = (paymentSummary[normalizedMethod] || 0) + Number(amtStr || 0);
              }
            });
          } else if (pmStr.includes(':')) {
            // 單一支付方式帶金額："cash:70"
            const [method, amtStr] = pmStr.split(':');
            const normalizedMethod = method.toLowerCase();
            paymentSummary[normalizedMethod] = (paymentSummary[normalizedMethod] || 0) + Number(amtStr || 0);
          } else {
            // 單一支付方式不帶金額："cash" - 使用訂單總金額
            const normalizedMethod = pmStr.toLowerCase() || 'cash';
            paymentSummary[normalizedMethod] = (paymentSummary[normalizedMethod] || 0) + total;
          }
        }
        
        totalDiscount += discount;
        totalIncome += total;
        
        // 計算找續
        if (o.changeAmount !== undefined) {
          totalChange += Number(o.changeAmount || 0);
        } else if (o.change !== undefined) {
          totalChange += Number(o.change || 0);
        }
      });
      
      // 寫入結算資訊到表單頂部
      let currentRow = 1;
      
      // 第1列：結算編號
      detailSheet.getRange(currentRow, 1).setValue('結算編號');
      detailSheet.getRange(currentRow, 2).setValue(batchId);
      currentRow++;
      
      // 空一列
      currentRow++;
      
      // 支付與金額彙總標題
      detailSheet.getRange(currentRow, 1).setValue('支付與金額彙總');
      currentRow++;
      
      // 各種付款方式
      const paymentMethods = [
        { key: 'cash', label: 'Cash' },
        { key: 'mpay', label: 'Mpay' },
        { key: 'code', label: 'Code' }
      ];
      paymentMethods.forEach(({ key, label }) => {
        const amount = paymentSummary[key] || 0;
        detailSheet.getRange(currentRow, 1).setValue(`付款方式：${label}`);
        detailSheet.getRange(currentRow, 2).setValue(`$${amount}`);
        currentRow++;
      });
      
      // 已找續
      detailSheet.getRange(currentRow, 1).setValue('已找續');
      detailSheet.getRange(currentRow, 2).setValue(`-$${totalChange}`);
      currentRow++;
      
      // 折扣總數
      detailSheet.getRange(currentRow, 1).setValue('折扣總數');
      detailSheet.getRange(currentRow, 2).setValue(`-$${totalDiscount}`);
      currentRow++;
      
      // 總收入
      detailSheet.getRange(currentRow, 1).setValue('總收入');
      detailSheet.getRange(currentRow, 2).setValue(`$${totalIncome}`);
      currentRow++;
      
      // 空一列
      currentRow++;
      
      // 明細表頭
      detailSheet.getRange(currentRow, 1, 1, 11).setValues([[
        '時間', '訂單編號', '員工', '品項', '小計', '折扣', '總計', '付款方式', '折扣代碼', '刪除者', '刪除時間'
      ]]);
      currentRow++;
      
      // 寫入訂單明細
      orders.forEach(o => {
        const itemsStr = formatItemsHumanReadable(o.items || []);
        detailSheet.getRange(currentRow, 1, 1, 11).setValues([[
          new Date(o.timestamp || new Date()),
          String(o.orderID || ''),
          String(o.user || ''),
          itemsStr,
          Number(o.subtotal || 0),
          Number(o.discountAmount || 0),
          Number(o.total || 0),
          String(o.paymentMethod || ''),
          String(o.promoCode || ''),
          String(o.deletedBy || ''),
          String(o.deletedAt || '')
        ]]);
        currentRow++;
      });

      // 寫入產品銷量表到第 13 欄（M 欄）開始
      const productCounts = payload.productCounts || [];
      if (productCounts.length > 0) {
        // M1: "產品", N1: "數量"
        detailSheet.getRange(1, 13).setValue('產品');
        detailSheet.getRange(1, 14).setValue('數量');
        
        // M2, M3, ... : 產品名稱
        // N2, N3, ... : 數量
        productCounts.forEach((item, idx) => {
          const row = idx + 2;  // 從第 2 列開始
          const productName = String(item[0] || '');
          const count = Number(item[1] || 0);
          detailSheet.getRange(row, 13).setValue(productName);
          detailSheet.getRange(row, 14).setValue(count);
        });
      }

      // 清空 orders 工作表內容（保留表頭第1列）
      const ordersSheet = ss.getSheetByName(ORDERS_SHEET) || ss.insertSheet(ORDERS_SHEET);
      const lastRowOrders = ordersSheet.getLastRow();
      if (lastRowOrders > 1) {
        ordersSheet.getRange(2, 1, lastRowOrders - 1, ordersSheet.getLastColumn()).clearContent();
      }

      const logsSheet = ss.getSheetByName(LOGS_SHEET) || ss.insertSheet(LOGS_SHEET);
      logsSheet.appendRow([ new Date(), 'doPost_settlement', raw, JSON.stringify({ status: 'ok', batchId }) ]);

      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', batchId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 若是刪除操作，使用 orderID 尋找對應行，更新 deletedBy / deletedAt
    if (payload.action === 'delete') {
      const sheet = ss.getSheetByName(ORDERS_SHEET);
      if (sheet) {
        const range = sheet.getDataRange();
        const values = range.getValues();

        // orderID 放在第 2 欄（1-based），索引 1
        for (let i = 1; i < values.length; i++) {
          const rowOrderID = String(values[i][1] || '').trim();
          if (rowOrderID && rowOrderID === String(payload.orderID || '').trim()) {
            sheet.getRange(i + 1, 10).setValue(payload.deletedBy || '');
            sheet.getRange(i + 1, 11).setValue(payload.deletedAt || '');
            break;
          }
        }
      }

      const logsSheet = ss.getSheetByName(LOGS_SHEET) || ss.insertSheet(LOGS_SHEET);
      logsSheet.appendRow([ new Date(), 'doPost_delete', raw, JSON.stringify({ status: 'ok' }) ]);

      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 正常新增訂單
    const sheet = ss.getSheetByName(ORDERS_SHEET) || ss.insertSheet(ORDERS_SHEET);
    const itemsStr = formatItemsHumanReadable(payload.items || []);  // 人類可讀格式
    const itemsJson = JSON.stringify(payload.items || []);           // JSON 格式（第 12 欄）
    const row = [
      new Date(),                          // 1 時間
      payload.orderID || '',               // 2 訂單編號
      payload.user || '',                  // 3 員工
      itemsStr,                            // 4 品項（人類可讀：Coffee x1 · $50; ...）
      Number(payload.subtotal || 0),       // 5 小計
      Number(payload.discountAmount || 0), // 6 折扣
      Number(payload.total || 0),          // 7 總計
      payload.paymentMethod || '',         // 8 付款
      payload.promoCode || '',             // 9 折扣代碼
      payload.deletedBy || '',             // 10 刪除者
      payload.deletedAt || '',             // 11 刪除時間
      itemsJson                            // 12 品項 JSON（供 doGet 直接讀取）
    ];
    sheet.appendRow(row);

    // 自動隱藏第 12 欄（itemsJson 只供 API 使用，無需用戶看見）
    try {
      const col12 = sheet.getRange(1, 12, sheet.getMaxRows(), 1);
      sheet.hideColumns(12);
    } catch (_) {
      // 忽略隱藏欄位的錯誤（可能已隱藏）
    }

    const logsSheet = ss.getSheetByName(LOGS_SHEET) || ss.insertSheet(LOGS_SHEET);
    const responseObj = { status: 'ok' };
    logsSheet.appendRow([ new Date(), 'doPost', raw, JSON.stringify(responseObj) ]);

    Logger.log('doPost payload: %s', raw);
    Logger.log('doPost response: %s', JSON.stringify(responseObj));

    return ContentService
      .createTextOutput(JSON.stringify(responseObj))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    const errObj = { status: 'error', message: String(err) };
    Logger.log('doPost error: %s', errObj.message);
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const logsSheet = ss.getSheetByName(LOGS_SHEET) || ss.insertSheet(LOGS_SHEET);
      logsSheet.appendRow([ new Date(), 'doPost_error', (e && e.postData && e.postData.contents) || '', JSON.stringify(errObj) ]);
    } catch (e2) { Logger.log('log-to-sheet failed: %s', e2.message) }

    return ContentService
      .createTextOutput(JSON.stringify(errObj))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 預檢請求（仍不設 header，保持簡單可執行）
function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// 讀取訂單（JSON），供前端 `loadOrdersFromApi()` 使用
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 處理登入驗證請求
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'login') {
      const username = String(e.parameter.username || '').trim();
      const password = String(e.parameter.password || '').trim();
      
      if (!username || !password) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, message: '請輸入帳號和密碼' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // 確保 Users 工作表存在並有表頭
      let usersSheet = ss.getSheetByName(USERS_SHEET);
      if (!usersSheet) {
        usersSheet = ss.insertSheet(USERS_SHEET);
        usersSheet.appendRow(['帳號', '密碼', '姓名', '建立時間']);
        // 新增預設管理員帳號
        usersSheet.appendRow(['admin', 'admin123', '管理員', new Date()]);
      }
      
      // 檢查帳號密碼是否匹配
      const values = usersSheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const storedUsername = String(row[0] || '').trim();
        const storedPassword = String(row[1] || '').trim();
        const displayName = String(row[2] || '').trim();
        
        if (storedUsername === username && storedPassword === password) {
          return ContentService
            .createTextOutput(JSON.stringify({ 
              success: true, 
              username: username,
              displayName: displayName || username
            }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      
      // 帳號或密碼錯誤
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, message: '帳號或密碼錯誤' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 處理獲取已結算訂單ID請求
    if (action === 'getSettledOrderIDs') {
      const settledOrderIDs = [];
      
      // 讀取 Settlement 表，取得所有結算記錄對應的工作表
      const settlementSheet = ss.getSheetByName('Settlement');
      if (settlementSheet) {
        const settlementValues = settlementSheet.getDataRange().getValues();
        // 從第2列開始（跳過表頭），第9欄是工作表名稱
        for (let i = 1; i < settlementValues.length; i++) {
          const detailSheetName = String(settlementValues[i][8] || '').trim();  // 第9欄（索引8）
          if (!detailSheetName) continue;
          
          // 讀取對應的批次明細工作表
          const detailSheet = ss.getSheetByName(detailSheetName);
          if (detailSheet) {
            const detailValues = detailSheet.getDataRange().getValues();
            // 尋找訂單編號列（標題為"訂單編號"，通常在第2欄）
            let orderIDColumnIndex = 1;  // 預設為第2欄
            if (detailValues.length > 0) {
              // 掃描表頭找出「訂單編號」所在的欄位
              for (let k = 0; k < detailValues[0].length; k++) {
                if (String(detailValues[0][k] || '').includes('訂單編號')) {
                  orderIDColumnIndex = k;
                  break;
                }
              }
            }
            
            // 從第2列開始讀取訂單ID
            for (let j = 1; j < detailValues.length; j++) {
              const orderID = String(detailValues[j][orderIDColumnIndex] || '').trim();
              if (orderID && orderID !== '') {
                settledOrderIDs.push(orderID);
              }
            }
          }
        }
      }
      
      return ContentService
        .createTextOutput(JSON.stringify({ settledOrderIDs }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const sheet = ss.getSheetByName(ORDERS_SHEET);
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({ orders: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const values = sheet.getDataRange().getValues();
    const orders = [];
    // 假設第一列是表頭，從第 2 列開始
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const ts = row[0];           // 時間
      const orderID = row[1];      // 訂單編號
      const user = row[2];
      const itemsStr = String(row[3] || '');    // 第 4 欄：品項（人類可讀）
      const subtotal = Number(row[4] || 0);
      const discountAmount = Number(row[5] || 0);
      const total = Number(row[6] || 0);
      const paymentMethod = row[7] || 'cash';
      const promoCode = row[8] || '';
      const deletedBy = row[9] || '';
      const deletedAt = row[10] || '';
      const itemsJson = String(row[11] || '');  // 第 12 欄：品項 JSON（新架構）

      let items = [];
      // 優先從第 12 欄讀取 JSON
      if (itemsJson) {
        try {
          items = JSON.parse(itemsJson);
        } catch (err) {
          Logger.log('doGet: Failed to parse itemsJson, trying itemsStr fallback for orderID ' + orderID);
          // Fallback：嘗試解析第 4 欄（若是 JSON 格式）
          if (itemsStr && itemsStr.trim().startsWith('[')) {
            try {
              items = JSON.parse(itemsStr);
            } catch (_) {
              // itemsStr 不是 JSON，保留空陣列
            }
          }
        }
      } else if (itemsStr) {
        // 第 12 欄為空，嘗試從第 4 欄讀取 JSON（相容舊資料格式轉換期）
        if (itemsStr.trim().startsWith('[')) {
          try {
            items = JSON.parse(itemsStr);
          } catch (_) {
            // itemsStr 不是 JSON，保留空陣列
          }
        }
      }

      orders.push({
        orderID: String(orderID || ''),
        timestamp: (ts && ts.toISOString) ? ts.toISOString() : String(ts || ''),
        user: String(user || ''),
        items: items,
        subtotal: subtotal,
        discountAmount: discountAmount,
        total: total,
        paymentMethod: String(paymentMethod || 'cash'),
        promoCode: String(promoCode || ''),
        deletedBy: String(deletedBy || ''),
        deletedAt: String(deletedAt || ''),
        itemsStr: String(itemsStr || '')  // 備用：也傳回人類可讀格式，給前端最後 fallback
      });
    }

    // 可選：支援查詢參數過濾，例如只回未刪除
    // if (e && e.parameter && e.parameter.onlyActive === 'true') {
    //   orders = orders.filter(o => !o.deletedAt);
    // }

    return ContentService
      .createTextOutput(JSON.stringify({ orders }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const errObj = { status: 'error', message: String(err) };
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const logsSheet = ss.getSheetByName(LOGS_SHEET) || ss.insertSheet(LOGS_SHEET);
      logsSheet.appendRow([ new Date(), 'doGet_error', JSON.stringify(e && e.parameter || {}), JSON.stringify(errObj) ]);
    } catch (e2) { /* ignore logging errors */ }

    return ContentService
      .createTextOutput(JSON.stringify({ orders: [], error: errObj.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}