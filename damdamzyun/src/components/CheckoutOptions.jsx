import React, { useState } from 'react'

// 折扣選項配置
export const promoOptions = {
  A: { type: 'percent', value: 10 }, // 10% off
  B: { type: 'percent', value: 20 }, // 20% off
  C: { type: 'fixed', value: 20 },   // minus $20
  D: { type: 'fixed', value: 30 },    // minus $30
  '送/廢': { type: 'percent', value: 100 } // 100% off
}

// 付款方式選項配置
export const paymentOptions = [
  { value: 'cash', label: '現金', icon: '💵' },
  { value: 'card', label: '信用卡', icon: '💳' },
  { value: 'linepay', label: 'Line Pay', icon: '💲' }
]

// 折扣選擇器組件
export function PromoSelector({ selectedPromo, onPromoChange, message }) {
  const handleSelect = (code) => {
    if (code === '') {
      onPromoChange({ code: '', discount: null, message: '' })
    } else {
      const opt = promoOptions[code]
      const msg = opt.type === 'percent' 
        ? `已套用折扣 ${code}：${opt.value}% off` 
        : `已套用折扣 ${code}：減 $${opt.value}`
      onPromoChange({ code, discount: opt, message: msg })
    }
  }

  return (
    <div className="selection-group">
      <label className="selection-label">折扣代碼</label>
      <div className="selection-buttons">
        <button
          className={`selection-btn ${!selectedPromo ? 'selected' : ''}`}
          onClick={() => handleSelect('')}
        >
          無折扣
        </button>
        {Object.keys(promoOptions).map(code => {
          const opt = promoOptions[code]
          const desc = opt.type === 'percent' ? `${opt.value}% off` : `減 $${opt.value}`
          return (
            <button
              key={code}
              className={`selection-btn ${selectedPromo === code ? 'selected' : ''}`}
              onClick={() => handleSelect(code)}
            >
              {code}<br/><small>{desc}</small>
            </button>
          )
        })}
      </div>
      {message && (
        <div className={`message ${selectedPromo ? 'success' : 'error'}`}>{message}</div>
      )}
    </div>
  )
}

// 付款方式選擇器組件 (支持多選並輸入金額)
export function PaymentSelector({ paymentAmounts = {}, onPaymentAmountsChange, total = 0 }) {
  const handleToggle = (value) => {
    const newAmounts = { ...paymentAmounts }
    if (value in newAmounts) {
      // 已選中，移除
      delete newAmounts[value]
    } else {
      // 未選中，加入並設置預設金額為0
      newAmounts[value] = 0
    }
    onPaymentAmountsChange(newAmounts)
  }

  const handleAmountChange = (method, amount) => {
    const newAmounts = { ...paymentAmounts, [method]: amount }
    onPaymentAmountsChange(newAmounts)
  }

  const selectedMethods = Object.keys(paymentAmounts)
  const totalReceived = Object.values(paymentAmounts).reduce((sum, amt) => sum + Number(amt || 0), 0)
  const change = totalReceived > 0 ? totalReceived - total : 0
  const isInsufficient = totalReceived > 0 && totalReceived < total

  return (
    <div className="payment-selector-group">
      <label className="selection-label">付款方式 (可多選)</label>
      
      {/* 付款方式按鈕 */}
      <div className="selection-buttons">
        {paymentOptions.map(option => (
          <button
            key={option.value}
            className={`selection-btn ${option.value in paymentAmounts ? 'selected' : ''}`}
            onClick={() => handleToggle(option.value)}
          >
            {option.icon} {option.label}
          </button>
        ))}
      </div>

      {/* 已選擇的付款方式金額輸入 */}
      {selectedMethods.length > 0 && (
        <div className="payment-amounts-container">
          <div className="payment-amounts">
            {selectedMethods.map(method => {
              const option = paymentOptions.find(o => o.value === method)
              const current = Number(paymentAmounts[method] || 0)
              const remaining = Math.max(0, total - (totalReceived - current))
              return (
                <div key={method} className="payment-amount-row">
                  <label className="payment-amount-label">
                    {option.icon} {option.label}
                  </label>
                  <div className="payment-amount-input-field">
                    <span className="currency-symbol">$</span>
                    <input
                      type="number"
                      value={paymentAmounts[method] || ''}
                      onChange={(e) => handleAmountChange(method, Number(e.target.value) || 0)}
                      placeholder="0"
                      className="payment-amount-input"
                      min="0"
                    />
                    <button
                      type="button"
                      className="quick-fill-btn"
                      onClick={() => handleAmountChange(method, remaining)}
                      title="填入應收金額或剩餘差額"
                    >
                      填入應收
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 收取總額與找續 */}
          <div className="payment-summary">
            <div className="payment-summary-row">
              <span className="summary-label">應收金額：</span>
              <span className="summary-value">${total}</span>
            </div>
            <div className="payment-summary-row">
              <span className="summary-label">實收金額：</span>
              <span className="summary-value highlight">${totalReceived}</span>
            </div>
            {totalReceived > 0 && (
              <div className={`payment-summary-row change-row ${isInsufficient ? 'insufficient' : 'success'}`}>
                <span className="summary-label">
                  {isInsufficient ? '差額：' : '找續：'}
                </span>
                <span className="summary-value">
                  {isInsufficient ? `-$${Math.abs(change)}` : `$${change}`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
