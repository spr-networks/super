export const WAN_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444']

export const withAlpha = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export const metricSuffix = (metric) => (metric == 'loss' ? '%' : ' ms')

export const buildWanSeries = (histories, metric) =>
  Object.keys(histories || {}).map((iface, index) => ({
    label: iface,
    color: WAN_COLORS[index % WAN_COLORS.length],
    points: [...(histories[iface] || [])].reverse().map((sample) => ({
      x: sample.Time * 1000,
      y: metric == 'loss' ? sample.LossPct : sample.LatencyMs
    }))
  }))
