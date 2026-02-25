import { useState, useRef, useCallback } from 'react'
import { computeOrderID } from '../utils'
import { GAS_URL, SHEET_ID, SHEET_NAME } from '../config'

/**
 * 自定義 hook：管理訂單同步邏輯
 * 提取所有與雲端同步相關的狀態和函數
 */
export function useOrderSync() {
  const [orders, setOrders] = useState([])
  const [archives, setArchives] = useState([])
  const [lastRemoteIDs, setLastRemoteIDs] = useState(new Set())
  const [syncFailedOrders, setSyncFailedOrders] = useState(new Set())
  
  const recentSubmissionsRef = useRef(new Map())

  // 初始化本地數據
  const initializeFromLocal = useCallback(() => {
    try {
      const savedOrdersRaw = JSON.parse(localStorage.getItem('orders') || '[]')
      const savedOrders = Array.isArray(savedOrdersRaw)
        ? savedOrdersRaw.map(o => ({ ...o, orderID: o.orderID || computeOrderID(o.timestamp) }))
        : []
      const savedArchives = JSON.parse(localStorage.getItem('archives') || '[]')
      
      if (Array.isArray(savedOrders) && savedOrders.length > 0) {
        setOrders(savedOrders)
      }
      if (Array.isArray(savedArchives)) {
        setArchives(savedArchives)
      }
      
      return { savedOrders, savedArchives }
    } catch (e) {
      console.warn('載入本地訂單失敗', e)
      return { savedOrders: [], savedArchives: [] }
    }
  }, [])

  // 保存訂單到本地
  const saveOrdersToLocal = useCallback((ordersList) => {
    try {
      localStorage.setItem('orders', JSON.stringify(ordersList))
    } catch (e) {
      console.warn('儲存本地訂單失敗', e)
    }
  }, [])

  // 保存結算檔案到本地
  const saveArchivesToLocal = useCallback((archivesList) => {
    try {
      localStorage.setItem('archives', JSON.stringify(archivesList))
    } catch (e) {
      console.warn('儲存本地結算檔案失敗', e)
    }
  }, [])

  // 獲取已結算訂單的 ID 集合
  const getArchivedIDs = useCallback(() => {
    return new Set(
      archives.flatMap(a => 
        (Array.isArray(a.orders) ? a.orders : [])
          .map(o => String(o.orderID || computeOrderID(o.timestamp)))
          .filter(Boolean)
      )
    )
  }, [archives])

  // 從 Google Sheet 載入訂單（gviz 方式）
  const loadOrdersFromSheet = useCallback(async () => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`
      const res = await fetch(url)
      const text = await res.text()
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('Unexpected response from gviz')
      
      const data = JSON.parse(text.slice(start, end + 1))
      const rows = data?.table?.rows || []
      
      const parsed = rows.slice(1).map(r => {
        const c = r.c || []
        const ts = c[0]?.v || new Date().toISOString()
        const orderID = String(c[1]?.v || computeOrderID(ts))
        const uname = c[2]?.v || ''
        let items = []
        try { items = JSON.parse(c[3]?.v || '[]') } catch (_) {}
        const subtotal = Number(c[4]?.v || 0)
        const discountAmount = Number(c[5]?.v || 0)
        const total = Number(c[6]?.v || 0)
        const payment = c[7]?.v || 'cash'
        const promo = c[8]?.v || ''
        const deletedBy = c[9]?.v || ''
        const deletedAt = c[10]?.v || ''
        
        return { 
          user: uname, 
          items, 
          subtotal, 
          discountAmount, 
          total, 
          paymentMethod: payment, 
          promoCode: promo, 
          timestamp: ts, 
          deletedBy, 
          deletedAt, 
          orderID 
        }
      }).filter(o => o.orderID && String(o.orderID).length > 5)

      const remoteIDs = new Set(parsed.map(o => String(o.orderID)).filter(Boolean))
      setLastRemoteIDs(remoteIDs)

      return { remoteIDs, remoteOrders: parsed }
    } catch (e) {
      console.warn('載入雲端訂單失敗', e)
      return { remoteIDs: new Set(), remoteOrders: [] }
    }
  }, [])

  // 從 Google Apps Script API 載入訂單
  const loadOrdersFromApi = useCallback(async () => {
    try {
      const url = `${GAS_URL}?action=get`
      const res = await fetch(url, { method: 'GET' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      
      const data = await res.json()
      const list = Array.isArray(data?.orders) ? data.orders : []
      
      if (list.length === 0) return { remoteIDs: new Set(), remoteOrders: [] }

      const remoteIDs = new Set(list.map(o => String(o.orderID)).filter(Boolean))
      setLastRemoteIDs(remoteIDs)

      // Fallback：若 items 為空但有 itemsStr，嘗試解析
      list.forEach(o => {
        // normalize orderID to string to avoid type mismatches
        o.orderID = String(o.orderID || computeOrderID(o.timestamp))
        if ((!o.items || o.items.length === 0) && o.itemsStr) {
          try {
            o.items = JSON.parse(o.itemsStr)
          } catch (_) {
            o.items = []
          }
        }
      })

      return { remoteIDs, remoteOrders: list }
    } catch (e) {
      console.warn('從 API 載入訂單失敗', e)
      return { remoteIDs: new Set(), remoteOrders: [] }
    }
  }, [])

  // 處理同步結果的核心邏輯
  const processSyncResult = useCallback((remoteIDs = new Set(), remoteOrders = [], prevOrders = [], settledIDs = new Set()) => {
    const now = Date.now()
    const recentSubmissions = recentSubmissionsRef.current
    
    if (!Array.isArray(remoteOrders)) remoteOrders = []
    if (!Array.isArray(prevOrders)) prevOrders = []
    
    // 清理過期記錄（超過 2 分鐘）
    for (const [id, timestamp] of recentSubmissions.entries()) {
      if (now - timestamp > 120000) recentSubmissions.delete(id)
    }
    
    const archivedIDs = new Set(
      archives.flatMap(a => 
        (Array.isArray(a.orders) ? a.orders : [])
          .map(o => String(o.orderID || computeOrderID(o.timestamp)))
          .filter(Boolean)
      )
    )
    
    // 步驟1：處理已在遠端結算的訂單
    const ordersToArchive = prevOrders.filter(o => settledIDs.has(String(o.orderID)))
    if (ordersToArchive.length > 0) {
      setArchives(prev => [...prev, {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        orders: ordersToArchive,
        note: '從其他裝置同步的已結算訂單'
      }])
    }
    
    // 步驟2：合併遠端訂單
    const incomingOrders = remoteOrders.filter(o => 
      o.orderID && 
      !archivedIDs.has(String(o.orderID)) && 
      !settledIDs.has(String(o.orderID))
    )
    
    let merged = [...prevOrders.filter(o => !settledIDs.has(String(o.orderID)))]
    
    incomingOrders.forEach(remoteOrder => {
      const idx = merged.findIndex(localOrder => localOrder.orderID === remoteOrder.orderID)
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...remoteOrder }
      } else {
        merged.push(remoteOrder)
      }
    })
    
    // 步驟3：計算同步失敗的訂單
    const localIDs = new Set(merged.map(o => String(o.orderID)).filter(Boolean))
    const nextFailed = new Set()
    
    localIDs.forEach(id => { 
      if (!remoteIDs.has(id) && !recentSubmissions.has(id) && !settledIDs.has(id)) {
        nextFailed.add(id)
      }
    })
    setSyncFailedOrders(nextFailed)
    
    if (merged.length !== prevOrders.length || ordersToArchive.length > 0) {
      saveOrdersToLocal(merged)
    }
    
    return merged
  }, [archives, saveOrdersToLocal])

  // 手動同步
  const handleManualSync = useCallback(async (pushToast = () => {}) => {
    try {
      const { remoteIDs, remoteOrders } = await loadOrdersFromApi()
      
      let settledIDs = new Set()
      try {
          const settledResponse = await fetch(`${GAS_URL}?action=getSettledOrderIDs`)
          const settledData = await settledResponse.json()
          settledIDs = new Set((settledData.settledOrderIDs || []).map(String))
      } catch (err) {
        console.warn('獲取已結算訂單ID失敗', err)
      }
      
      setOrders(prev => processSyncResult(remoteIDs, remoteOrders, prev, settledIDs))
    } catch (err) {
      console.warn('doGet 同步失敗，嘗試 gviz fallback', err)
      try {
        const { remoteIDs, remoteOrders } = await loadOrdersFromSheet()
        setOrders(prev => processSyncResult(remoteIDs, remoteOrders, prev, new Set()))
      } catch (err2) {
        console.warn('同步失敗', err2)
        pushToast('同步失敗，請檢查網路連線', 'error')
      }
    }
  }, [processSyncResult, loadOrdersFromApi, loadOrdersFromSheet])

  return {
    orders,
    setOrders,
    archives,
    setArchives,
    syncFailedOrders,
    setSyncFailedOrders,
    lastRemoteIDs,
    recentSubmissionsRef,
    initializeFromLocal,
    saveOrdersToLocal,
    saveArchivesToLocal,
    getArchivedIDs,
    loadOrdersFromSheet,
    loadOrdersFromApi,
    processSyncResult,
    handleManualSync
  }
}
