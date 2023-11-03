import React, { useContext, useEffect, useState } from 'react'
// react plugin used to create charts
import { Chart as ChartJS } from 'chart.js/auto'
import { Bar } from 'react-chartjs-2'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import { Box, Heading, ScrollView, VStack } from '@gluestack-ui/themed'

export default (props) => {
  const context = useContext(AlertContext)

  const [devices, setDevices] = useState(null)
  const [signals, setSignals] = useState(null)

  const fetchData = async () => {
    const interfaces = await wifiAPI.interfaces('AP')
    let stations = {}

    for (let iface of interfaces) {
      const new_stations = await wifiAPI.allStations(iface).catch((error) => {
        context.error('API failed to get stations', error)
      })

      stations = { ...stations, ...new_stations }
    }

    let signals = []
    for (let mac in stations) {
      let station = stations[mac]

      signals.push({
        MAC: mac,
        Signal: parseInt(station.signal),
        TX: parseInt(station.tx_rate_info),
        RX: parseInt(station.rx_rate_info)
      })
    }

    return signals
  }

  const signalToColor = (signal) => {
    if (signal >= -60) {
      return 'rgb(24, 206, 15)'
    } else if (signal >= -70) {
      return 'rgb(44, 168, 255)'
    } else if (signal >= -80) {
      return 'rgb(255, 178, 54)'
    }

    return 'rgb(255, 54, 54)'
  }

  const clientLabelFromMAC = (mac) =>
    devices[mac] ? `${devices[mac].RecentIP}\n${mac}\n` : mac

  const deviceFieldByMAC = (mac, field) =>
    devices && devices[mac] ? devices[mac][field] : mac

  const deviceByName = (name) =>
    Object.values(devices).find((d) => d.Name == name)

  const processData = (signals, labels) => {
    let data = {
      labels: [],
      datasets: []
    }

    let labelColor = {
      RX: '#4cbd4c',
      TX: '#4cbdd7',
      RSSI: []
    }

    labels.map((label) => {
      let backgroundColor = labelColor[label]
      let dataset = {
        label,
        fill: true,
        backgroundColor,
        borderWidth: 1,
        barPercentage: 0.5,
        data: []
      }

      // if multiple datasets - use the same yAxis
      if (labels.length > 1) {
        dataset.yAxisID = labels.join('')
      }

      data.datasets.push(dataset)
    })

    // set the data
    for (const entry of signals) {
      // used for id
      let name = deviceFieldByMAC(entry.MAC, 'Name') || entry.MAC
      data.labels.push(name)

      labels.map((label, index) => {
        if (label == 'RSSI') {
          data.datasets[index].data.push(entry.Signal)

          let color = signalToColor(entry.Signal)
          data.datasets[index].backgroundColor.push(color)
        }

        if (label == 'RX') {
          data.datasets[index].data.push(entry.RX)
        }

        if (label == 'TX') {
          data.datasets[index].data.push(entry.TX)
        }
      })
    }

    return data
  }

  useEffect(() => {
    fetchData()
      .then(setSignals)
      .catch((err) => context.error('Failed to fetch signals', err))

    deviceAPI
      .list()
      .then(setDevices)
      .catch((err) => context.error('API failed to get devices', err))
  }, [])

  if (!signals) {
    return <></>
  }

  let options = {
    indexAxis: 'x',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (tooltipItems) =>
            deviceByName(tooltipItems[0].label)?.RecentIP ||
            tooltipItems[0].label,
          beforeBody: (tooltipItems) =>
            deviceByName(tooltipItems[0].label)?.MAC || tooltipItems[0].label
        }
      }
    },
    scales: {}
  }

  let optionsRSSI = {
    ...options,
    scales: {
      RSSI: {
        position: 'right',
        type: 'linear',
        ticks: {
          includeBounds: true,
          color: '#9f9f9f'
        }
      }
    }
  }

  let optionsRXTX = {
    ...options,
    scales: {
      RXTX: {
        position: 'right',
        type: 'linear',
        ticks: {
          includeBounds: true,
          color: '#9f9f9f'
        }
      }
    }
  }

  let signalsRSSI = processData(signals, ['RSSI'])
  let signalsRXTX = processData(signals, ['RX', 'TX'])

  return (
    <ScrollView sx={{ '@md': { height: '92vh' } }}>
      <Heading size="sm" p="$4">
        Device Signal Strength (RSSI)
      </Heading>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
      >
        {signalsRSSI ? <Bar data={signalsRSSI} options={optionsRSSI} /> : null}
      </Box>

      <Heading size="sm" p="$4">
        Device RX/TX Rate
      </Heading>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
      >
        {signalsRXTX ? <Bar data={signalsRXTX} options={optionsRXTX} /> : null}
      </Box>
    </ScrollView>
  )
}
