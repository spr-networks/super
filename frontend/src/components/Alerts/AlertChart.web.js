import React, { useContext } from 'react'
import { Bar } from 'react-chartjs-2'
import 'chart.js/auto'

import { useColorMode } from '@gluestack-ui/themed'
import { AppContext } from 'AppContext'
import { themes } from 'Themes'

const AlertChart = ({ fieldCounts, onBarClick }) => {
  const entries = Object.entries(fieldCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
  const sourceLabels = entries.map(([label]) => label)
  const labels = sourceLabels.map((label) => {
    const separator = label.indexOf(':')
    if (separator === -1) return label
    const field = label.slice(0, separator).replace(/\./g, ' · ')
    const value = label.slice(separator + 1)
    // Chart.js renders array labels on separate lines. Preserve the complete
    // value (especially IPs/MACs) while keeping the field name scannable.
    return [field, value]
  })
  const values = entries.map(([, value]) => value)
  const colorMode = useColorMode()
  const isDark = colorMode === 'dark'
  const appContext = useContext(AppContext)
  const themeRecord =
    appContext.customThemes?.[appContext.theme] || themes[appContext.theme]
  const themeColors = themeRecord?.colors || {}
  const accent =
    themeColors.primary400 || (isDark ? '#38bdf8' : '#0ea5e9')
  const gridColor =
    themeColors[
      isDark ? 'borderColorCardDark' : 'borderColorCardLight'
    ] || (isDark ? '#262626' : '#e5e5e5')
  const secondaryText =
    themeColors[isDark ? 'textDark400' : 'textLight500'] ||
    (isDark ? '#a3a3a3' : '#737373')
  const labelText =
    themeColors[isDark ? 'textDark100' : 'textLight700'] ||
    (isDark ? '#e5e5e5' : '#404040')

  const data = {
    labels,
    datasets: [
      {
        label: 'Events',
        data: values,
        backgroundColor: accent,
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 12
      }
    ]
  }

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: gridColor
        },
        ticks: {
          precision: 0,
          font: {
            size: 11
          },
          color: secondaryText
        },
        border: { display: false }
      },
      y: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11,
            weight: '500'
          },
          color: labelText
        },
        border: { display: false }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (items) =>
            items.length ? sourceLabels[items[0].dataIndex] : ''
        }
      }
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index
        onBarClick(sourceLabels[index], values[index])
      }
    }
  }

  return (
    <div style={{ height: Math.max(120, entries.length * 36), width: '100%' }}>
      <Bar data={data} options={options} />
    </div>
  )
}

export default AlertChart
