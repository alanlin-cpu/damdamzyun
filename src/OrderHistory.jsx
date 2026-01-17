import React, { useState, useMemo } from 'react'
import ConfirmDialog from './components/ConfirmDialog'

export default function OrderHistory({ orders, user, onBack, onDeleteOrder, onSettleOrders, onSettleAllOrders, onRetryUpload, syncFailedOrders = new Set(), pushToast }) {
  const [searchUser, setSearchUser] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [settleOpen, setSettleOpen] = useState(false)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null)
  const [isSettling, setIsSettling] = useState(false)
  const [retryingOrders, setRetryingOrders] = useState(new Set())

  const isDeleted = (o) => o.deleted || !!o.deletedAt

  // 篩選訂單 - 使用 useMemo 快取
  const paymentMap = { cash: 'Cash', mpay: 'Mpay', code: 'Code' }

  const filtered = useMemo(() => {
    return orders.filter(order => {
      const userMatch = !searchUser || order.user.toLowerCase().includes(searchUser.toLowerCase())
      if (!filterPayment) return userMatch

      // 新格式：paymentAmounts 可能存在多個付款方式
      if (order.paymentAmounts && typeof order.paymentAmounts === 'object') {
        return Object.keys(order.paymentAmounts).includes(filterPayment) && userMatch
      }

      // 舊格式：單一 paymentMethod 字串
      return userMatch && order.paymentMethod === filterPayment
    })
  }, [orders, searchUser, filterPayment])

  // 刪除訂單（軟刪除，標記為已刪除）
  const deleteOrder = (index) => {
    setConfirmDeleteIndex(index)
  }

  // 統計：只計算未刪除的訂單 - 使用 useMemo 快取
  const activeOrders = useMemo(() => filtered.filter(o => !isDeleted(o)), [filtered])

  return (
    <div className="order-history-container">
      <div className="order-history-header">
        <h2>訂單記錄</h2>
        <div style={{display:'flex', gap:8}}>
          <button className="btn-back" onClick={onBack}>← 返回</button>
        </div>
      </div>

      {/* 搜尋與篩選 */}
      <div className="order-filters">
        <div className="filter-row">
          <label>員工名稱</label>
          <input
            type="text"
            placeholder="搜尋員工..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
          />
        </div>
        <div className="filter-row">
          <label>付款方式</label>
          <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
            <option value="">-- 全部 --</option>
            <option value="cash">Cash</option>
            <option value="mpay">Mpay</option>
            <option value="code">Code</option>
          </select>
        </div>
        <div className="filter-result">
          共 {filtered.length} 筆記錄 ({activeOrders.length} 筆有效訂單)
        </div>
      </div>

      {/* 訂單表格（桌面版） */}
      {filtered.length === 0 ? (
        <div className="empty-orders">查無訂單</div>
      ) : (
        <>
        <div className="orders-table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>編號</th>
                <th>員工</th>
                <th>品項</th>
                <th>小計</th>
                <th>折扣</th>
                <th>總計</th>
                <th>付款</th>
                <th>刪除者及時間</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, idx) => (
                <tr key={idx} className={`order-row ${isDeleted(order) ? 'deleted' : ''}`}>
                  <td className="time">{new Date(order.timestamp).toLocaleString('zh-TW')}</td>
                  <td className="order-id">
                    {order.orderID || '—'}
                    {syncFailedOrders.has(order.orderID) && (
                      <span title="本機保留，雲端同步失敗" style={{marginLeft: '6px', fontSize: '16px'}}>⚠️</span>
                    )}
                  </td>
                  <td className="user">{order.user}</td>
                  <td className="items">
                    <details open>
                      <summary>{order.items.length} 項</summary>
                      <ul className="item-details">
                        {order.items.map((item, i) => (
                          <li key={i}>
                            {item.name} x{item.quantity} • ${item.price}
                            {item.sweetness && <span className="option"> • {item.sweetness}</span>}
                            {item.ice && <span className="option"> • {item.ice}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className="subtotal">${order.subtotal}</td>
                  <td className="discount">
                    {order.discountAmount > 0 ? (
                      <span className="discount-badge">
                        -${order.discountAmount}
                        {order.promoCode && ` (${order.promoCode})`}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="total">${order.total}</td>
                  <td className="payment">
                    {order.paymentAmounts && Object.keys(order.paymentAmounts).length > 0 ? (
                      <div style={{display:'flex', flexDirection:'column', gap:4}}>
                        {Object.entries(order.paymentAmounts).map(([method, amount]) => (
                          <span key={method}>{paymentMap[method] || method}: ${amount}</span>
                        ))}
                        <small style={{color:'#555'}}>實收：${Object.values(order.paymentAmounts).reduce((s,a)=>s+Number(a||0),0)}</small>
                      </div>
                    ) : (
                      paymentMap[order.paymentMethod] || order.paymentMethod || '-'
                    )}
                  </td>
                  <td className="deleted-info">
                    {isDeleted(order) || order.deletedBy ? (
                      <div className="deleted-badge">
                        <div>【已刪除】</div>
                        {order.deletedBy && <div><small>刪除者: {order.deletedBy}</small></div>}
                        {order.deletedAt && <div><small>{new Date(order.deletedAt).toLocaleString('zh-TW')}</small></div>}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="actions">
                    {!isDeleted(order) && (
                      <>
                        {user === 'admin' && syncFailedOrders.has(order.orderID) && (
                          <button 
                            className="btn-retry" 
                            onClick={async () => {
                              const orderID = order.orderID
                              if (retryingOrders.has(orderID)) return
                              setRetryingOrders(prev => new Set(prev).add(orderID))
                              try {
                                await onRetryUpload(idx)
                              } finally {
                                setRetryingOrders(prev => {
                                  const next = new Set(prev)
                                  next.delete(orderID)
                                  return next
                                })
                              }
                            }}
                            disabled={retryingOrders.has(order.orderID)}
                          >
                            {retryingOrders.has(order.orderID) ? '上傳中...' : '🔄 重新上傳'}
                          </button>
                        )}
                        <button className="btn-delete" onClick={() => deleteOrder(idx)}>🗑 刪除</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 訂單卡片（移動版） */}
        <div className="orders-cards-wrapper">
          {filtered.map((order, idx) => (
            <div key={idx} className={`order-card ${isDeleted(order) ? 'deleted' : ''}`}>
              {/* 卡片標題：時間 + 編號 */}
              <div className="order-card-header">
                <div className="order-card-time">
                  {new Date(order.timestamp).toLocaleString('zh-TW')}
                </div>
                <div className="order-card-id">
                  #{order.orderID || '—'}
                  {syncFailedOrders.has(order.orderID) && (
                    <span title="本機保留，雲端同步失敗" style={{marginLeft: '4px'}}>⚠️</span>
                  )}
                </div>
              </div>

              {/* 卡片內容 */}
              <div className="order-card-body">
                {/* 員工 */}
                <div className="order-card-section">
                  <div className="order-card-label">員工</div>
                  <div style={{fontWeight: 'bold', color: '#333'}}>{order.user}</div>
                </div>

                {/* 品項列表 */}
                <div className="order-card-section">
                  <div className="order-card-label">品項 ({order.items.length})</div>
                  <div className="order-card-items">
                    {order.items.map((item, i) => (
                      <div key={i} className="order-card-item">
                        <div className="order-card-item-name">
                          {item.name} x{item.quantity} • ${item.price}
                        </div>
                        {(item.sweetness || item.ice) && (
                          <div className="order-card-item-option">
                            {item.sweetness && <span>{item.sweetness}</span>}
                            {item.sweetness && item.ice && <span> • </span>}
                            {item.ice && <span>{item.ice}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 金額區塊 */}
                <div className="order-card-amounts">
                  <div className="order-card-amount">
                    <span>小計</span>
                    <span className="amount-value">${order.subtotal}</span>
                  </div>
                  <div className="order-card-amount">
                    <span>折扣</span>
                    <span className="order-card-discount">
                      {order.discountAmount > 0 ? (
                        <>-${order.discountAmount}
                        {order.promoCode && <small> ({order.promoCode})</small>}
                        </>
                      ) : '-'}
                    </span>
                  </div>
                  <div className="order-card-amount total">
                    <span>總計</span>
                    <span className="amount-value">${order.total}</span>
                  </div>
                </div>

                {/* 付款方式 */}
                <div className="order-card-section">
                  <div className="order-card-label">付款方式</div>
                  <div className="order-card-payment">
                    {order.paymentAmounts && Object.keys(order.paymentAmounts).length > 0 ? (
                      <>
                        {Object.entries(order.paymentAmounts).map(([method, amount]) => (
                          <div key={method} className="order-card-payment-method">
                            {paymentMap[method] || method}: ${amount}
                          </div>
                        ))}
                        <div style={{marginTop: 4, fontSize: '0.85em', color: '#666'}}>
                          實收：${Object.values(order.paymentAmounts).reduce((s,a)=>s+Number(a||0),0)}
                        </div>
                      </>
                    ) : (
                      <div className="order-card-payment-method">
                        {paymentMap[order.paymentMethod] || order.paymentMethod || '-'}
                      </div>
                    )}
                  </div>
                </div>

                {/* 刪除資訊 */}
                {(isDeleted(order) || order.deletedBy) && (
                  <div className="order-card-deleted-info">
                    <div style={{fontWeight: 'bold', marginBottom: 4}}>【已刪除】</div>
                    {order.deletedBy && <div>刪除者: {order.deletedBy}</div>}
                    {order.deletedAt && <div>{new Date(order.deletedAt).toLocaleString('zh-TW')}</div>}
                  </div>
                )}
              </div>

              {/* 操作按鈕 */}
              {!isDeleted(order) && (
                <div className="order-card-footer">
                  {user === 'admin' && syncFailedOrders.has(order.orderID) && (
                    <button 
                      className="btn-retry" 
                      onClick={async () => {
                        const orderID = order.orderID
                        if (retryingOrders.has(orderID)) return
                        setRetryingOrders(prev => new Set(prev).add(orderID))
                        try {
                          await onRetryUpload(idx)
                        } finally {
                          setRetryingOrders(prev => {
                            const next = new Set(prev)
                            next.delete(orderID)
                            return next
                          })
                        }
                      }}
                      disabled={retryingOrders.has(order.orderID)}
                    >
                      {retryingOrders.has(order.orderID) ? '上傳中...' : '🔄 重新上傳'}
                    </button>
                  )}
                  <button className="btn-delete" onClick={() => deleteOrder(idx)}>🗑 刪除</button>
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {/* 自訂刪除確認對話框 */}
      <ConfirmDialog
        open={confirmDeleteIndex !== null}
        title="確定要刪除此訂單嗎？此訂單記錄將保留但顯示為已刪除。"
        onCancel={() => setConfirmDeleteIndex(null)}
        onConfirm={() => { onDeleteOrder(confirmDeleteIndex); setConfirmDeleteIndex(null) }}
      />

      {/* 統計 */}
      {activeOrders.length > 0 && (
        <div className="order-stats">
          <div className="stat-item">
            <span className="stat-label">總收入</span>
            <span className="stat-value">${activeOrders.reduce((sum, o) => sum + o.total, 0)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">總折扣</span>
            <span className="stat-value">-${activeOrders.reduce((sum, o) => sum + o.discountAmount, 0)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">訂單數</span>
            <span className="stat-value">{activeOrders.length}</span>
          </div>
        </div>
      )}
      <div style={{marginTop:20}}>
        <button 
          className="btn-settle" 
          onClick={() => setSettleOpen(true)}
          disabled={isSettling}
        >
          {isSettling ? '結算處理中...' : '🔔 結算'}
        </button>
      </div>

      {/* 結算 Modal */}
      {settleOpen && (
        <div className="modal-overlay" onClick={() => setSettleOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>結算預覽</h3>
            <p>本次結算將處理 {activeOrders.length} 筆有效訂單（不包含已刪除的訂單）</p>

            {/* 1. 每樣產品販售數量 (忽略客製化) */}
            <div className="settle-body">
              <div className="settle-left">
                <h4>產品銷量</h4>
                <table className="settle-table" style={{width:'100%',marginBottom:12}}>
                  <thead>
                    <tr><th>產品</th><th>數量</th></tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const counts = {}
                      const payTotals = {cash:0,mpay:0,code:0}
                      let totalDiscount = 0
                      let totalRevenue = 0
                      let totalChange = 0
                      
                      // 一次遍歷計算所有統計 - 只計算未刪除的訂單（所有用戶／裝置）
                      activeOrders.forEach(o => {
                        o.items.forEach(it => { 
                          counts[it.name] = (counts[it.name]||0) + (it.quantity||1) 
                        })
                        if (o.paymentAmounts && typeof o.paymentAmounts === 'object') {
                          // 新格式：paymentAmounts 物件 { cash: 50, mpay: 20 }
                          Object.entries(o.paymentAmounts).forEach(([method, amt]) => {
                            payTotals[method] = (payTotals[method]||0) + Number(amt||0)
                          })
                        } else if (o.paymentMethod) {
                          // 舊格式：paymentMethod 可能是 "cash:70; mpay:30" 或單一 "cash" 或 "mpay:70"
                          const pmStr = String(o.paymentMethod)
                          if (pmStr.includes(';')) {
                            // 多支付方式字串格式："cash:70; mpay:30"
                            pmStr.split(';').forEach(part => {
                              const [method, amtStr] = part.trim().split(':')
                              if (method) {
                                payTotals[method] = (payTotals[method]||0) + Number(amtStr || o.total || 0)
                              }
                            })
                          } else if (pmStr.includes(':')) {
                            // 單一支付方式帶金額："mpay:70"
                            const [method, amtStr] = pmStr.split(':')
                            payTotals[method] = (payTotals[method]||0) + Number(amtStr || 0)
                          } else {
                            // 單一支付方式不帶金額："cash"
                            payTotals[pmStr] = (payTotals[pmStr]||0) + Number(o.total||0)
                          }
                        }
                        totalDiscount += Number(o.discountAmount||0)
                        totalRevenue += Number(o.total||0)
                        totalChange += Number(o.changeAmount||0)
                      })
                      
                      // 儲存到 window 供其他區塊使用（避免重複計算）
                      window._settlementCache = { counts, payTotals, totalDiscount, totalRevenue, totalChange }
                      
                      return Object.keys(counts).sort((a,b)=>String(a).localeCompare(String(b))).map((name) => (
                        <tr key={name}><td>{name}</td><td style={{textAlign:'right'}}>{counts[name]}</td></tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="settle-right">
                <h4>銷量柱狀圖</h4>
                {(() => {
                  const { counts } = window._settlementCache || {}
                  if (!counts) return null
                  const entries = Object.entries(counts).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
                  const chartHeight = Math.max(200, entries.length * 40) // 每項40px，最少200px
                  return (
                    <div className="bar-chart" style={{height: `${chartHeight}px`}}>
                      {(() => {
                        const max = entries.reduce((m,[,v]) => Math.max(m,v), 1)
                        return entries.map(([name, v]) => (
                          <div className="bar-row" key={name}>
                            <div className="bar-label">{name}</div>
                            <div className="bar-wrap">
                              <div className="bar" style={{width: `${(v/max)*100}%`}}>{v}</div>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* 2. 各支付方式統計、折扣總數、總收入 */}
            <div style={{marginTop:16}}>
              <h4>支付與金額彙總</h4>
              <table className="settle-summary" style={{width:'100%'}}>
                <tbody>
                    {(() => {
                      const { payTotals, totalDiscount, totalRevenue, totalChange } = window._settlementCache || { payTotals: {cash:0,mpay:0,code:0}, totalDiscount: 0, totalRevenue: 0, totalChange: 0 }
                      return (
                        <>
                          <tr><td>付款方式：Cash</td><td style={{textAlign:'right'}}>${payTotals.cash}</td></tr>
                          <tr><td style={{paddingLeft:'20px',fontSize:'0.9em',color:'#666'}}>已找續</td><td style={{textAlign:'right',fontSize:'0.9em',color:'#666'}}>-${totalChange}</td></tr>
                          <tr><td>付款方式：Mpay</td><td style={{textAlign:'right'}}>${payTotals.mpay}</td></tr>
                          <tr><td>付款方式：Code</td><td style={{textAlign:'right'}}>${payTotals.code}</td></tr>
                          <tr><td style={{paddingLeft:'20px',fontSize:'0.9em',color:'#666'}}>折扣總數</td><td style={{textAlign:'right',fontSize:'0.9em',color:'#666'}}>-${totalDiscount}</td></tr>
                          <tr><td>總收入</td><td style={{textAlign:'right'}}>${totalRevenue}</td></tr>
                        </>
                      )
                    })()}
                </tbody>
              </table>
            </div>

            <div style={{display:'flex',gap:12,justifyContent:'flex-end',marginTop:18}}>
              <button className="btn-cancel" onClick={() => setSettleOpen(false)} disabled={isSettling}>取消</button>
              <button 
                className="btn-save" 
                onClick={async () => {
                  if (isSettling) return
                  setIsSettling(true)
                  try {
                    if (typeof pushToast === 'function') {
                      pushToast('結算處理中...', 'info', 4000)
                    }
                    await onSettleAllOrders()
                    setSettleOpen(false)
                  } catch (err) {
                    console.error('結算失敗:', err)
                  } finally {
                    setIsSettling(false)
                  }
                }}
                disabled={isSettling}
              >
                {isSettling ? '處理中...' : '確認結算並刪除全部訂單'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
