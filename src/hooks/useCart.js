import { useState, useCallback } from 'react'

/**
 * 自定義 hook：管理購物車邏輯
 * 提取所有與購物車相關的狀態和函數
 */
export function useCart() {
  const [cart, setCart] = useState([])

  // 加入購物車
  const handleAddItem = useCallback(({ item, customOptions }) => {
    if (!item) return
    
    setCart((prev) => {
      const existing = prev.find(
        entry => entry.item.id === item.id &&
                 entry.item.price === item.price &&
                 entry.customOptions === customOptions
      )
      
      if (existing) {
        return prev.map(entry =>
          entry.item.id === item.id && 
          entry.item.price === item.price && 
          entry.customOptions === customOptions
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        )
      }
      return [...prev, { item, quantity: 1, customOptions }]
    })
  }, [])

  // 更新數量
  const updateQuantity = useCallback((index, delta) => {
    setCart((prev) => {
      return prev
        .map((entry, i) => i === index ? { ...entry, quantity: entry.quantity + delta } : entry)
        .filter(entry => entry.quantity > 0)
    })
  }, [])

  // 清空購物車
  const clearCart = useCallback(() => {
    setCart([])
  }, [])

  // 計算小計
  const subtotal = cart.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0)

  return {
    cart,
    setCart,
    handleAddItem,
    updateQuantity,
    clearCart,
    subtotal
  }
}
