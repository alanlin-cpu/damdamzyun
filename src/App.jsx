import React, { useState, useEffect, useCallback, useMemo, startTransition } from 'react'
import { GAS_URL } from './config'
import { computeOrderID, computeSettlementID } from './utils'
import { useCart } from './hooks/useCart'
import { useCheckout } from './hooks/useCheckout'
import { useOrderSync } from './hooks/useOrderSync'
import ToastContainer from './components/Toast'
import './App.css'
import OrderHistory from './OrderHistory'
import Menu from './Menu(dam).jsx'
import { PromoSelector, PaymentSelector } from './components/CheckoutOptions'

export default function App() {
  // Custom hooks
  const { cart, handleAddItem, updateQuantity, clearCart, subtotal } = useCart()
  const checkout = useCheckout(subtotal)
  const {
    orders,
    setOrders,
    archives,
    setArchives,
    syncFailedOrders,
    initializeFromLocal,
    saveOrdersToLocal,
    saveArchivesToLocal,
    loadOrdersFromApi,
    loadOrdersFromSheet,
    processSyncResult,
    handleManualSync: handleManualSyncFromHook
  } = useOrderSync()

  // Auth state
  const [user, setUser] = useState(null)
  const [currentPage, setCurrentPage] = useState('menu')

  // Toast state
  const [toasts, setToasts] = useState([])

  const pushToast = useCallback((message, type = 'success', ttl = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ttl)
  }, [])

  // Initialize: load user, orders, archives from localStorage
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('user')
      if (savedUser) setUser(savedUser)
      
      const { savedOrders, savedArchives } = initializeFromLocal()
    } catch (e) {
      console.warn('載入本地數據失敗', e)
    }
  }, [initializeFromLocal])

  // Persist orders to localStorage
  useEffect(() => {
    const timer = setTimeout(() => saveOrdersToLocal(orders), 300)
    return () => clearTimeout(timer)
  }, [orders, saveOrdersToLocal])

  // Persist archives to localStorage
  useEffect(() => {
    saveArchivesToLocal(archives)
  }, [archives, saveArchivesToLocal])

  // Persist user to localStorage
  useEffect(() => {
    try {
      if (user) localStorage.setItem('user', user)
    } catch (e) {
      console.warn('儲存使用者失敗', e)
    }
  }, [user])

  // Manual sync with pushToast
  const handleManualSync = useCallback(async () => {
    await handleManualSyncFromHook(pushToast)
  }, [handleManualSyncFromHook, pushToast])

  // Auto-sync after login
  useEffect(() => {
    if (!user) return
    handleManualSync()
  }, [user, handleManualSync])

  // Auto-sync on window focus + periodic sync every 10 seconds
  useEffect(() => {
    if (!user) return

    const onFocus = () => { handleManualSync() }
    window.addEventListener('focus', onFocus)

    const syncInterval = setInterval(() => {
      handleManualSync()
    }, 10000)

    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(syncInterval)
    }
  }, [user, handleManualSync])

  // Login handler
  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    const username = e.target.username.value.trim()
    const password = e.target.password.value.trim()

    if (!username || !password) {
      pushToast('請輸入帳號和密碼', 'error')
      return
    }

    pushToast('登入中...', 'info', 2000)

    try {
      const url = `${GAS_URL}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        setUser(data.username)
        pushToast(`歡迎 ${data.displayName || username}！`, 'success')
      } else {
        pushToast(data.message || '登入失敗', 'error', 4000)
      }
    } catch (error) {
      console.error('登入驗證失敗:', error)
      pushToast('無法連接到伺服器，請檢查網路連線', 'error', 4000)
    }
  }, [pushToast])

  // Logout handler
  const handleLogout = useCallback(() => {
    setUser(null)
    try { localStorage.removeItem('user') } catch {}
  }, [])

  // Computed values using useMemo
  const discountAmount = useMemo(() => checkout.discountAmount, [checkout.discountAmount])
  const total = useMemo(() => checkout.total, [checkout.total])
  const totalReceived = useMemo(() => checkout.totalReceived, [checkout.totalReceived])
  const changeAmount = useMemo(() => checkout.changeAmount, [checkout.changeAmount])
  const isInsufficient = useMemo(() => checkout.isInsufficient, [checkout.isInsufficient])

  // Wrapper for PromoSelector callback (expects { code, discount, message } object)
  const handlePromoChange = useCallback(({ code, discount, message }) => {
    checkout.applyPromoCode(code)
  }, [checkout])

  // Submit order handler
  const submitOrder = useCallback(async () => {
    if (cart.length === 0) {
      alert('購物車為空')
      return
    }

    if (isInsufficient) {
      pushToast(
        `實收金額不足！應收 $${total}，實收 $${totalReceived}，差額 $${total - totalReceived}`,
        'error',
        5000
      )
      return
    }

    const itemsForPayload = cart
      .map(entry => ({
        ...entry.item,
        quantity: entry.quantity,
        customOptions: entry.customOptions
      }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

    const now = new Date()
    const orderID = computeOrderID(now)
    const paymentBreakdown = Object.entries(checkout.paymentAmounts)
      .map(([method, amt]) => `${method}:${Number(amt || 0)}`)
      .join('; ')

    const payload = {
      orderID,
      timestamp: now.toISOString(),
      user,
      items: itemsForPayload,
      subtotal,
      discountAmount,
      total,
      paymentMethod: paymentBreakdown || Object.keys(checkout.paymentAmounts).join(', '),
      paymentAmounts: checkout.paymentAmounts,
      receivedAmount: totalReceived,
      changeAmount,
      promoCode: checkout.discount ? checkout.promoCode.trim().toUpperCase() : '',
      deletedBy: null,
      deletedAt: null
    }

    pushToast('已送出訂單！', 'success')

    startTransition(() => {
      setOrders((prev) => [...prev, payload])
    })

    clearCart()
    checkout.clearCheckout()

    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.error('背景上傳失敗:', err)
      pushToast('訂單已送出，本機保留；雲端暫時失敗', 'error')
    })
  }, [cart, subtotal, discountAmount, total, totalReceived, changeAmount, isInsufficient, checkout, user, clearCart, setOrders, pushToast])

  // Delete order handler
  const handleDeleteOrder = useCallback((index) => {
    const orderToDelete = orders[index]
    if (!orderToDelete) return

    const deletedAt = new Date().toISOString()

    setOrders((prev) => {
      const newOrders = [...prev]
      newOrders[index] = { ...newOrders[index], deleted: true, deletedBy: user, deletedAt }
      return newOrders
    })

    const deletePayload = {
      action: 'delete',
      orderID: orderToDelete.orderID || computeOrderID(orderToDelete.timestamp),
      deletedBy: user,
      deletedAt
    }

    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(deletePayload)
    }).catch(err => {
      console.error('同步刪除狀態失敗:', err)
      pushToast('刪除已標記，本機完成；雲端同步失敗', 'error')
    })
  }, [orders, user, pushToast])

  // Settlement to GAS
  const sendSettlementToGas = useCallback(async (settledOrders, note = '') => {
    const ts = new Date().toISOString()
    const batchId = computeSettlementID(ts)
    const subtotalSum = settledOrders.reduce((s, o) => s + Number(o.subtotal || 0), 0)
    const discountSum = settledOrders.reduce((s, o) => s + Number(o.discountAmount || 0), 0)
    const totalSum = settledOrders.reduce((s, o) => s + Number(o.total || 0), 0)

    const productCounts = {}
    settledOrders.forEach(o => {
      if (o.deletedAt || o.deleted) return
      o.items.forEach(it => {
        productCounts[it.name] = (productCounts[it.name] || 0) + (it.quantity || 1)
      })
    })
    const sortedProducts = Object.entries(productCounts).sort((a, b) => String(a[0]).localeCompare(String(b[0])))

    const payload = {
      action: 'settlement',
      batchId,
      user,
      count: settledOrders.length,
      subtotalSum,
      discountSum,
      totalSum,
      note,
      orders: settledOrders,
      productCounts: sortedProducts
    }

    const deletedOrders = settledOrders.filter(o => o.deleted || o.deletedAt)
    deletedOrders.forEach(o => {
      const delPayload = {
        action: 'delete',
        orderID: o.orderID || computeOrderID(o.timestamp),
        deletedBy: o.deletedBy || user,
        deletedAt: o.deletedAt || ts
      }
      fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(delPayload)
      }).catch(() => {})
    })

    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    }).catch(err => console.warn('結算上傳失敗', err))

    return { batchId }
  }, [user])

  // Settle selected orders
  const handleSettleOrders = useCallback(async (indicesToSettle) => {
    const settled = indicesToSettle.map(i => orders[i]).filter(Boolean)
    if (settled.length === 0) return

    await sendSettlementToGas(settled)

    setArchives((prev) => [...prev, { id: Date.now(), timestamp: new Date().toISOString(), orders: settled }])
    const remaining = orders.filter((_, idx) => !indicesToSettle.includes(idx))
    setOrders(remaining)
    saveOrdersToLocal(remaining)
  }, [orders, sendSettlementToGas, setArchives, setOrders, saveOrdersToLocal])

  // Settle all orders
  const handleSettleAllOrders = useCallback(async () => {
    if (!orders || orders.length === 0) return

    await sendSettlementToGas(orders)

    setArchives((prev) => [...prev, { id: Date.now(), timestamp: new Date().toISOString(), orders }])
    setOrders([])
    saveOrdersToLocal([])
  }, [orders, sendSettlementToGas, setArchives, setOrders, saveOrdersToLocal])

  // Retry upload
  const handleRetryUpload = useCallback(async (index) => {
    const orderToRetry = orders[index]
    if (!orderToRetry) return

    pushToast('重新上傳中...', 'info', 2000)

    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(orderToRetry)
      })

      pushToast('重新上傳成功！', 'success')
    } catch (err) {
      console.error('重新上傳失敗:', err)
      pushToast('重新上傳失敗，請稍後再試', 'error', 4000)
    }
  }, [orders, pushToast])

  if (!user) return (
    <>
      <div className="login-container">
        <h2>員工登入</h2>
        <form onSubmit={handleLogin}>
          <input name="username" placeholder="帳號" required />
          <input name="password" type="password" placeholder="密碼" required />
          <button type="submit">登入</button>
        </form>
      </div>
      <ToastContainer toasts={toasts} />
    </>
  )

  if (currentPage === 'history') {
    return (
      <>
        <OrderHistory
          orders={orders}
          user={user}
          onBack={() => setCurrentPage('menu')}
          onDeleteOrder={handleDeleteOrder}
          onSettleOrders={handleSettleOrders}
          onSettleAllOrders={handleSettleAllOrders}
          onRetryUpload={handleRetryUpload}
          syncFailedOrders={syncFailedOrders}
          pushToast={pushToast}
        />
        <ToastContainer toasts={toasts} />
      </>
    )
  }

  return (
    <div className="container">
      <div className="header-with-nav">
        <h2 className="header">歡迎 {user}</h2>
        <div style={{display:'flex', gap:8}}>
          <button className="btn-nav-history" onClick={() => setCurrentPage('history')}>📋 訂單記錄</button>
          <button className="btn-nav-history" onClick={handleLogout}>🚪 登出</button>
        </div>
      </div>

      <ToastContainer toasts={toasts} />

      <div className="layout">
        <Menu onAddItem={handleAddItem} />

        <div className="column">
          <h3 className="section-title">目前餐點 (購物車)</h3>
          {cart.length === 0 ? (
            <div className="empty-cart">購物車為空</div>
          ) : (
            <ul className="cart-list">
              {cart.map((entry, index) => (
                <li key={index} className="cart-item">
                  <span>
                    {entry.item.name} x{entry.quantity} • ${entry.item.price}<br />
                    {entry.customOptions && <small>{entry.customOptions}</small>}
                  </span>
                  <div className="quantity-controls">
                    <button className="quantity-btn quantity-btn-minus" onClick={() => updateQuantity(index, -1)}>−</button>
                    <span className="quantity">{entry.quantity}</span>
                    <button className="quantity-btn quantity-btn-plus" onClick={() => updateQuantity(index, 1)}>+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="checkout-box">
            <div>小計: ${subtotal}</div>

            <PromoSelector
              selectedPromo={checkout.promoCode}
              onPromoChange={handlePromoChange}
              message={checkout.promoMessage}
            />

            <PaymentSelector
              paymentAmounts={checkout.paymentAmounts}
              onPaymentAmountsChange={checkout.updatePaymentAmounts}
              total={total}
            />

            <div className="total">總計: ${total}</div>
            <button className="btn-submit" onClick={submitOrder}>送出訂單</button>
          </div>
        </div>
      </div>
    </div>
  )
}