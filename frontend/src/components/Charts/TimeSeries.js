import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
//import { Chart as ChartJS } from 'chart.js/auto'
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
import Select from 'react-select'

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

import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Row,
  Col
} from 'reactstrap'

const TimeSeries = (props) => {
  const scales = [
    /*
    { value: 0, label: 'All time' },
    { value: 24 * 60, label: 'Last day' },
    { value: 60, label: 'Last hour' },
    { value: 15, label: 'Last 15 minutes' }
    */
    { value: 'All Time', label: 'All Time' },
    { value: '1 Day', label: 'Last day' },
    { value: '1 Hour', label: 'Last hour' },
    { value: '15 Minutes', label: 'Last 15 minutes' }
  ]

  const [scale, setScale] = useState('All Time')
  const [offset, setOffset] = useState(0)

  const handleTimeChange = (newValue) => {
    setScale(newValue.label)
    setOffset(newValue.value)
    if (props.handleTimeChange) {
      props.handleTimeChange(newValue.value, props.type)
    }
  }

  const prettySize = (sz, round = false) => {
    let szType = 'bytes'

    if (sz >= 1e6) {
      sz /= 1e6
      szType = 'MB'
    } else if (sz >= 1e3) {
      sz /= 1e3
      szType = 'kB'
    }

    sz = round ? Math.floor(sz) : sz.toFixed(2)
    sz = sz.toLocaleString()
    return `${sz} ${szType}`
  }

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
      /*y: {
        stacked: true,
        min: 0,
        max: 1,
        ticks: {
          callback: (value) => (value * 100).toFixed(0) + '%'
        }
      },*/
      x: {
        grid: {
          display: false,
          drawBorder: false
        },
        //type: 'timeseries',
        type: 'timeseries',
        distribution: 'linear',
        ticks: {
          callback: (value, index, labels) => (index % 5 === 0 ? value : '')
        }
      }
    },
    plugins: {
      legend: {},
      tooltip: {
        intersect: false,
        position: 'nearest', //'topLeft',
        caretSize: 5,
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

      props.handleClientClick(ip, data[index])
    }
  }

  options.onClick = onClick

  return (
    <>
      <Card>
        <CardHeader>
          <Row>
            <Col md="9">
              <CardTitle tag="h4">{props.title || props.type}</CardTitle>
            </Col>
            <Col md="3">
              <Select
                onChange={handleTimeChange}
                options={scales}
                value={{ value: offset, label: scale }}
              />
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {props.data.datasets ? (
            <Line ref={chartRef} data={props.data} options={options} />
          ) : null}
        </CardBody>
      </Card>
    </>
  )
}

TimeSeries.propTypes = {
  type: PropTypes.string,
  title: PropTypes.string,
  data: PropTypes.object,
  handleTimeChange: PropTypes.func,
  handleClientClick: PropTypes.func
}

export default TimeSeries
