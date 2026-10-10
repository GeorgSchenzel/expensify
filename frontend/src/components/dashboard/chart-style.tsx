// Shared Recharts styling for all dashboard charts.
export const axisTick = { fontSize: 11, fill: '#6b7280' }
export const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }
export const legendLabel = (value: string) => (
  <span style={{ fontSize: 11, color: '#374151' }}>{value}</span>
)
export const euroTick = (v: number) => `€${v}`
