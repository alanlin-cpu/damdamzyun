import React, { useState } from 'react'

// 分類顏色配置
export const categoryColors = {
  'film': '#FF6B9D',           // 粉紅色 - 菲林底片
  '自拍館': '#4ECDC4',         // 青綠色 - 自拍館
  'set': '#FFD93D',            // 金黃色 - 套餐
  '零售': '#95E1D3',           // 薄荷綠 - 零售商品
  '菲林鎖匙扣': '#A78BFA',     // 紫色 - 菲林鎖匙扣
  '周邊': '#FB8500'            // 橙色 - 周邊商品
}

export const menuItems = [
  // 菲林底片
  { id: 1, name: 'Mini', price: 25, category: 'film' },
  { id: 2, name: 'Wide', price: 35, category: 'film' },
  { id: 3, name: 'Polaroid GO', price: 35, category: 'film' },
  { id: 4, name: 'Polaroid 白', price: 45, category: 'film' },
  { id: 5, name: 'Polaroid 黑', price: 55, category: 'film' },
  { id: 6, name: 'Polaroid 金', price: 60, category: 'film' },
  { id: 7, name: 'Polaroid 特別', price: 65, category: 'film' },
  { id: 8, name: '斯拉片 黑白', price: 188, category: 'film' },
  { id: 9, name: '斯拉片 彩色', price: 488, category: 'film' },
  
  // 自拍館
  { id: 10, name: '自拍館Set', price: 129, category: '自拍館' },
  { id: 11, name: '加印', price: 20, category: '自拍館' },
  { id: 12, name: '自拍館單張', price: 69, category: '自拍館' },
  
  // 套餐
  { id: 16, name: '雙人餐', price: 138, category: 'set' },
  { id: 17, name: '三人餐', price: 188, category: 'set' },
  { id: 18, name: '咩都有', price: 228, category: 'set' },
  { id: 19, name: '今日優惠', price: 228, category: 'set' },
  { id: 20, name: '聖誕套餐', price: 199, category: 'set' },
  
  // 零售商品
  { id: 21, name: 'Fuji一次性菲林', price: 170, category: '零售' },
  { id: 22, name: 'Kodak一次性菲林 27張', price: 140, category: '零售' },
  { id: 23, name: 'Kodak一次性菲林 39張', price: 170, category: '零售' },
  { id: 24, name: 'Mini相紙', price: 145, category: '零售' },
  { id: 25, name: 'Wide相紙', price: 160, category: '零售' },
  { id: 26, name: '撕拉片相框', price: 30, category: '零售' },
  { id: 27, name: 'Mini相框(透明)', price: 20, category: '零售' },
  { id: 28, name: 'Mini相框(IG)', price: 20, category: '零售' },
  { id: 29, name: 'Wide相框(透明)', price: 20, category: '零售' },
  
  // 菲林鎖匙扣
  { id: 15, name: '菲林鎖匙扣', price: 45, category: '菲林鎖匙扣' },
  
  // 周邊商品
  { id: 13, name: 'Mini CD', price: 45, category: '周邊' },
  { id: 14, name: '半透菲林', price: 40, category: '周邊' },
  { id: 30, name: '摺機', price: 69, category: '周邊' },
  { id: 31, name: '大電視', price: 69, category: '周邊' },
  { id: 32, name: '小電視', price: 40, category: '周邊' }
]

// 需要客製化選項的類別
export const customizableCategories = ['菲林鎖匙扣']

// 菲林鎖匙扣選項
export const keychainQuantityOptions = [
  { label: '4張', price: 45 },
  { label: '7張', price: 53 }
]

export default function Menu({ menu = menuItems, onAddItem }) {
  const [selectedItem, setSelectedItem] = useState(null)
  const [quantity, setQuantity] = useState(keychainQuantityOptions[0])
  const [isCustom, setIsCustom] = useState(false)

  const handleItemClick = (item) => {
    // 如果是需要客製化的類別，打開彈窗
    if (customizableCategories.includes(item.category)) {
      setSelectedItem(item)
      setQuantity(keychainQuantityOptions[0])
      setIsCustom(false)
    } else {
      // 直接加入購物車
      if (onAddItem) {
        onAddItem({ item })
      }
    }
  }

  const addToCartWithOptions = () => {
    if (!selectedItem || !onAddItem) return
    
    if (selectedItem.category === '菲林鎖匙扣') {
      // 計算最終價格
      const finalPrice = quantity.price + (isCustom ? 15 : 0)
      const customOptions = `${quantity.label}${isCustom ? ' (訂製款)' : ''}`
      
      onAddItem({ 
        item: { ...selectedItem, price: finalPrice },
        customOptions
      })
    } else {
      onAddItem({ item: selectedItem })
    }
    setSelectedItem(null)
  }

  return (
    <>
      <div className="column">
        <h3 className="section-title">菜單</h3>
        <div className="menu-grid">
          {menu.map(item => (
            <div
              key={item.id}
              className="menu-card"
              onClick={() => handleItemClick(item)}
              style={{ borderLeft: `4px solid ${categoryColors[item.category] || '#ccc'}` }}
            >
              <div className="menu-card-name" style={{ color: categoryColors[item.category] || '#333' }}>{item.name}</div>
              <div className="menu-card-price" style={{ color: '#555' }}>${item.price}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 客製化彈出視窗 - 菲林鎖匙扣 */}
      {selectedItem && selectedItem.category === '菲林鎖匙扣' && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{selectedItem.name}</div>

            {/* 數量選項 */}
            <div className="options-group">
              <div className="options-title">選擇數量</div>
              <div className="options-buttons">
                {keychainQuantityOptions.map(opt => (
                  <button
                    key={opt.label}
                    className={`option-btn ${quantity.label === opt.label ? 'selected' : ''}`}
                    onClick={() => setQuantity(opt)}
                  >
                    {opt.label} - ${opt.price}
                  </button>
                ))}
              </div>
            </div>

            {/* 訂製款選項 */}
            <div className="options-group">
              <div className="options-title">訂製款 (+$15)</div>
              <div className="options-buttons">
                <button
                  className={`option-btn ${!isCustom ? 'selected' : ''}`}
                  onClick={() => setIsCustom(false)}
                >
                  否
                </button>
                <button
                  className={`option-btn ${isCustom ? 'selected' : ''}`}
                  onClick={() => setIsCustom(true)}
                >
                  是
                </button>
              </div>
            </div>

            {/* 顯示總價 */}
            <div className="options-group">
              <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', padding: '10px' }}>
                總價: ${quantity.price + (isCustom ? 15 : 0)}
              </div>
            </div>

            <div className="modal-buttons">
              <button className="modal-btn-cancel" onClick={() => setSelectedItem(null)}>取消</button>
              <button className="modal-btn-add" onClick={addToCartWithOptions}>加入購物車</button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
