import React, { useContext, useEffect, useState } from 'react'

import { ScrollView, VStack } from '@gluestack-ui/themed'

import { deviceAPI, trafficAPI } from 'api'
import { AppContext, AlertContext } from 'AppContext'
import chroma from 'chroma-js'

import TimeSeries from 'components/Traffic/TimeSeries'

const TrafficTimeSeries = ({ ...props }) => {
  const [data, setData] = useState({})
  const [chartModes, setChartModes] = useState({})
  const [scales, setScales] = useState({})

  const context = useContext(AppContext)
  const alertContext = useContext(AlertContext)

  let cached_traffic_data = null

  const fetchData = async () => {
    let traffic_data
    if (cached_traffic_data !== null) {
      traffic_data = cached_traffic_data
    } else {
      traffic_data = cached_traffic_data = await trafficAPI
        .history()
        .catch((error) => {
          alertContext.error(
            'API Failure get traffic history: ' + error.message
          )
        })
    }

    return traffic_data
  }

  const buildTimeSeries = async (
    target = '',
    chartMode = 'percent',
    scale = 'All Time'
  ) => {
    // data = [ {1 minute array of IP => stats, }, ...]
    let traffic_data = await fetchData()

    const scaleOffset = {
      '1 Hour': 60 - 1,
      '1 Day': 60 * 24 - 1,
      '15 Minutes': 15 - 1,
      'All Time': traffic_data.length - 1
    }

    let offset = scaleOffset[scale] || 0
    traffic_data = offset ? traffic_data.slice(0, offset) : traffic_data

    // array or { IP => [ 11, 22 ] }
    let ipStats = {}
    for (let entry of traffic_data) {
      for (let ip in entry) {
        if (!ipStats[ip]) {
          ipStats[ip] = []
        }
      }
    }

    let ips = Object.keys(ipStats)

    //calculate total changed per step in first pass
    let deltaSlices = []
    for (let idx = 0; idx < traffic_data.length; idx++) {
      let delta = 0
      for (let ip of ips) {
        if (
          !traffic_data[idx][ip] ||
          !traffic_data[idx + 1] ||
          !traffic_data[idx + 1][ip]
        ) {
        } else {
          // = this-next
          delta +=
            traffic_data[idx][ip][target] - traffic_data[idx + 1][ip][target]
        }
      }

      deltaSlices.push(delta)
    }

    // set ipstats[ip] = [ { x, y, z }, ... ]
    let date = new Date()
    for (let idx = 0; idx < traffic_data.length; idx++) {
      date.setMinutes(date.getMinutes() - 1)

      let x = new Date(date),
        y = 0,
        z = 0

      for (let ip of ips) {
        if (
          !traffic_data[idx][ip] ||
          !traffic_data[idx + 1] ||
          !traffic_data[idx + 1][ip]
        ) {
          ipStats[ip].push({ x, y, z })
        } else {
          // calculate the delta change between the most recent (idx) and
          // the measurement before (idx+1) convert to % of total change
          if (chartMode == 'percent') {
            let diff =
              traffic_data[idx][ip][target] - traffic_data[idx + 1][ip][target]

            z = diff
            y = diff / deltaSlices[idx]
          } else {
            //y = z = traffic_data[idx][ip][target]
            y = z =
              traffic_data[idx][ip][target] - traffic_data[idx + 1][ip][target]
          }

          ipStats[ip].push({ x, y, z })
        }
      }
    }

    const drop_quarter_samples = (traffic_data, number_target_events = 125) => {
      //if we have a lot of points, drop intermediate ones.
      while (traffic_data.length > number_target_events) {
        //drop every fourth
        let new_series = []
        for (let i = 0; i < traffic_data.length; ) {
          new_series.push(traffic_data[i++])
          if (!traffic_data[i]) break
          new_series.push(traffic_data[i++])
          if (!traffic_data[i]) break
          new_series.push(traffic_data[i++])
          if (!traffic_data[i]) break
          i++
        }

        traffic_data = new_series
      }

      return traffic_data
    }

    const labelByIP = (ip) => {
      return context.getDevice(ip, 'RecentIP')?.Name || ip
    }

    // setup datasets
    let datasets = []

    let colors = chroma
      .scale('Spectral')
      .mode('lch')
      .colors(Object.keys(ipStats).length)

    let index = 0
    for (let ip in ipStats) {
      const c = chroma(colors[index++]).alpha(0.85).css()
      let data = drop_quarter_samples(ipStats[ip])
      let label = labelByIP(ip)

      datasets.push({
        label,
        data_target: target,
        hidden: false,
        stepped: true,
        borderColor: c,
        borderWidth: 0,
        backgroundColor: c,
        fill: true,
        data
      })
    }

    // setState
    return datasets
  }

  const initData = async () => {
    let targets = ['WanOut', 'WanIn', 'LanOut', 'LanIn']
    let data = {}
    for (let target of targets) {
      let datasets = await buildTimeSeries(target)
      data[target] = { datasets }
    }

    setData(data)
  }

  useEffect(() => {
    //init selects
    let targets = ['WanOut', 'WanIn', 'LanOut', 'LanIn']

    setChartModes(
      targets.reduce((m, o) => {
        m[o] = 'percent'
        return m
      }, {})
    )
    setScales(
      targets.reduce((m, o) => {
        m[o] = 'All Time'
        return m
      }, {})
    )

    initData()
  }, [])

  /*useEffect(() => {
    initData()
  }, [context.devices])*/

  const handleChangeTime = (value, type) => {
    setScales({ ...scales, [type]: value })
    buildTimeSeries(type, chartModes[type], value).then((datasets) => {
      setData({ ...data, [type]: { datasets } })
    })
  }

  const handleChangeMode = (value, type) => {
    setChartModes({ ...chartModes, [type]: value })
    buildTimeSeries(type, value, scales[type]).then((datasets) => {
      setData({ ...data, [type]: { datasets } })
    })
  }

  const prettyTitle = (type) => {
    return {
      WanIn: 'WAN incoming',
      WanOut: 'WAN outgoing',
      LanIn: 'LAN incoming',
      LanOut: 'LAN outgoing'
    }[type]
  }

  return (
    <ScrollView h="$full">
      <VStack space="md">
        {Object.keys(data).length ? (
          <>
            {['WanOut', 'WanIn', 'LanIn', 'LanOut'].map((type) => (
              <TimeSeries
                key={`${type}:${chartModes[type]}`}
                type={type}
                title={prettyTitle(type)}
                data={data[type]}
                chartMode={chartModes[type] || 'percent'}
                scale={scales[type] || 'All Time'}
                handleChangeTime={handleChangeTime}
                handleChangeMode={handleChangeMode}
              />
            ))}
          </>
        ) : null}
      </VStack>
    </ScrollView>
  )
}

export default TrafficTimeSeries
