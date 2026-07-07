import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Line, getDatasetAtEvent, getElementAtEvent } from 'react-chartjs-2'
import 'chartjs-adapter-moment'

import { prettySize } from 'utils'

Tooltip.positioners.topLeft = (elements, eventPosition) => {
  return { x: 80, y: 100 }
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const TimeSeriesChart = (props) => {
  let options = {
    animation: { duration: 0 },

    //maintainAspectRatio: true,

    interaction: {
      mode: 'index',
      intersect: false
    },
    /*tooltips: {
      mode: 'index',
      axis: 'y'
    },*/
    elements: {
      point: {
        pointStyle: 'circle',
        radius: 0,
        hitRadius: 50,
        hoverRadius: 2
      }
    },
    scales: {
      y: {
        display: true,
        //stacked: true,
        type: 'logarithmic',
        ticks: {
          callback: (value, index, ticks) => {
            if (index % 9 == 0) {
              return prettySize(value, true)
            }
          }
        }
      },
      x: {
        grid: {
          display: false,
          drawBorder: false
        },
        type: 'timeseries',
        distribution: 'linear',
        ticks: {
          callback: function (value, index) {
            return index % 5 === 0 ? new Date(value).toLocaleTimeString() : ''
          }
        }
      }
    },
    plugins: {
      legend: {},
      tooltip: {
        intersect: false,
        position: 'nearest', //'topLeft',
        caretSize: 5,
        itemSort: (a, b) => b.raw.z - a.raw.z,
        callbacks: {
          label: (context) => {
            let label = context.dataset.label || ''
            let sz = prettySize(context.raw.z)

            return `${label}: ${sz}`
          }
        }
      }
    }
  }

  if (props.mode == 'percent') {
    options.scales.y = {
      stacked: true,
      min: 0,
      max: 1,
      ticks: {
        callback: function (value) {
          return (value * 100).toFixed(0) + '%' // convert it to percentage
        }
      }
    }

    delete options.scales.x.distribution
    //options.maintainAspectRatio = true

    options.plugins.legend.onClick = (e, legendItem, legend) => {
      const chart = legend.chart
      const index = legendItem.datasetIndex
      chart.setDatasetVisibility(index, !chart.isDatasetVisible(index))

      const datasets = chart.data.datasets
      const len = Math.max(...datasets.map((d) => d.data.length))
      for (let i = 0; i < len; i++) {
        let total = 0
        datasets.forEach((d, di) => {
          if (chart.isDatasetVisible(di) && d.data[i]) {
            total += d.data[i].z
          }
        })
        datasets.forEach((d, di) => {
          if (d.data[i]) {
            d.data[i].y =
              chart.isDatasetVisible(di) && total > 0 ? d.data[i].z / total : 0
          }
        })
      }
      chart.update()
    }
  }

  const chartRef = useRef(null)

  const onClick = (event) => {
    const { current } = chartRef

    if (!current) {
      console.log('[click] nochart')
      return
    }

    event.nativeEvent = event.native // TODO FIX
    let elements = getElementAtEvent(current, event)
    //console.log('[click] elems:', elements)

    if (elements.length) {
      let { datasetIndex, index } = elements[0]

      const dataset = props.data.datasets[datasetIndex]
      const { label: ip, data } = dataset

      props.onClick(ip, data[index])
    }
  }

  options.onClick = onClick

  return (
    <>
      {props.data.datasets ? (
        <Line ref={chartRef} data={props.data} options={options} />
      ) : null}
    </>
  )
}

TimeSeriesChart.propTypes = {
  type: PropTypes.string,
  title: PropTypes.string,
  data: PropTypes.object,
  handleTimeChange: PropTypes.func,
  onClick: PropTypes.func
}

export default TimeSeriesChart
