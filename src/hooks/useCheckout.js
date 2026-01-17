import { useState, useCallback, useMemo } from 'react'
import { promoOptions } from '../components/CheckoutOptions'

/**
 * 自定義 hook：管理結帳邏輯（折扣、支付方式等）
 */
export function useCheckout(subtotal = 0) {
  const [discount, setDiscount] = useState(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoMessage, setPromoMessage] = useState('')
  const [paymentAmounts, setPaymentAmounts] = useState({})

  // 應用折扣代碼
  const applyPromoCode = useCallback((code) => {
    const trimmedCode = (code || '').toString().trim().toUpperCase()
    
    if (!trimmedCode) {
      setDiscount(null)
      setPromoCode('')
      setPromoMessage('請選擇折扣代碼')
      return
    }

    const opt = promoOptions[trimmedCode]
    if (opt) {
      setDiscount(opt)
      setPromoCode(trimmedCode)
      const msg = opt.type === 'percent' 
        ? `已套用折扣 ${trimmedCode}：${opt.value}% off` 
        : `已套用折扣 ${trimmedCode}：減 $${opt.value}`
      setPromoMessage(msg)
    } else {
      setDiscount(null)
      setPromoCode(trimmedCode)
      setPromoMessage('折扣代碼無效')
    }
  }, [])

  // 清除折扣
  const clearDiscount = useCallback(() => {
    setDiscount(null)
    setPromoCode('')
    setPromoMessage('')
  }, [])

  // 更新支付金額
  const updatePaymentAmounts = useCallback((amounts) => {
    setPaymentAmounts(amounts)
  }, [])

  // 計算折扣金額（使用 useMemo 避免重複計算）
  const discountAmount = useMemo(() => {
    if (!discount) return 0
    if (discount.type === 'percent') {
      return Math.round(subtotal * (discount.value / 100))
    }
    return Number(discount.value) || 0
  }, [discount, subtotal])

  // 計算總計
  const total = useMemo(() => {
    return Math.max(0, subtotal - discountAmount)
  }, [subtotal, discountAmount])

  // 計算實收金額
  const totalReceived = useMemo(() => {
    return Object.values(paymentAmounts).reduce((sum, amt) => sum + Number(amt || 0), 0)
  }, [paymentAmounts])

  // 計算找續
  const changeAmount = useMemo(() => {
    return totalReceived > 0 ? Math.max(0, totalReceived - total) : 0
  }, [totalReceived, total])

  // 檢查是否金額不足
  const isInsufficient = useMemo(() => {
    return totalReceived > 0 && totalReceived < total
  }, [totalReceived, total])

  // 清除所有結帳狀態
  const clearCheckout = useCallback(() => {
    clearDiscount()
    setPaymentAmounts({})
  }, [clearDiscount])

  return {
    discount,
    promoCode,
    promoMessage,
    paymentAmounts,
    discountAmount,
    total,
    totalReceived,
    changeAmount,
    isInsufficient,
    applyPromoCode,
    clearDiscount,
    updatePaymentAmounts,
    clearCheckout
  }
}
