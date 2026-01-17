import React from 'react'

export default function ConfirmDialog({ open, title, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        <div className="confirm-actions">
          <button className="btn-confirm cancel" onClick={onCancel}>取消</button>
          <button className="btn-confirm ok" onClick={onConfirm}>確認</button>
        </div>
      </div>
    </div>
  )
}
