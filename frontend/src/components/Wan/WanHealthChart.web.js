import React from 'react'
import PropTypes from 'prop-types'
import 'chart.js/auto'
import { Line } from 'react-chartjs-2'
import 'chartjs-adapter-moment'
import { useColorMode } from '@gluestack-ui/themed'
import { buildWanSeries, withAlpha } from './wanChartData'

const WanHealthChart = ({ histories, metric }) => {
  const colorMode = useColorMode()
  const tickColor = colorMode == 'light' ? '#64748b' : '#94a3b8'
  const gridColor =
    colorMode == 'light' ? 'rgba(100,116,139,0.08)' : 'rgba(148,163,184,0.08)'

  const series = buildWanSeries(histories, metric)
  const ifaces = series.map((s) => s.label)

  const datasets = series.map((s) => ({
    label: s.label,
    data: s.points,
    borderColor: s.color,
    backgroundColor: withAlpha(s.color, colorMode == 'light' ? 0.08 : 0.14),
    fill: true,
    borderWidth: 1.5,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0.3,
    spanGaps: true
  }))

  const options = {
    animation: { duration: 0 },
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: ifaces.length > 1,
        position: 'top',
        align: 'end',
        labels: {
          color: tickColor,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 6,
          boxHeight: 6,
          font: { size: 11 }
        }
      },
      tooltip: {
        backgroundColor:
          colorMode == 'light' ? 'rgba(15,23,42,0.9)' : 'rgba(30,41,59,0.95)',
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
        callbacks: {
          label: (context) =>
            ` ${context.dataset.label}  ${context.parsed.y.toFixed(1)} ${
              metric == 'loss' ? '%' : 'ms'
            }`
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        ticks: {
          color: tickColor,
          maxTicksLimit: 8,
          font: { size: 11 }
        },
        grid: { display: false },
        border: { display: false }
      },
      y: {
        beginAtZero: true,
        max: metric == 'loss' ? 100 : undefined,
        ticks: {
          color: tickColor,
          maxTicksLimit: 6,
          font: { size: 11 },
          callback: (value) => `${value}${metric == 'loss' ? '%' : ' ms'}`
        },
        grid: { color: gridColor },
        border: { display: false }
      }
    }
  }

  return (
    <div style={{ height: 260, width: '100%' }}>
      <Line data={{ datasets }} options={options} />
    </div>
  )
}

WanHealthChart.propTypes = {
  histories: PropTypes.object,
  metric: PropTypes.string
}

export default WanHealthChart
