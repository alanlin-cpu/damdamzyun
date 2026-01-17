export const computeOrderID = (tsInput) => {
  try {
    const d = tsInput ? new Date(tsInput) : new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    return `${y}${m}${day}${hh}${mm}${ss}${ms}`
  } catch {
    return `${Date.now()}`
  }
}

export const formatCurrency = (n) => `$${Number(n || 0)}`

export const computeSettlementID = (tsInput) => {
  try {
    const d = tsInput ? new Date(tsInput) : new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    return `S-${y}${m}${day}${hh}${mm}${ss}${ms}`
  } catch {
    return `S-${Date.now()}`
  }
}
