import React, { useContext, useEffect, useState } from 'react'

import { BarChart } from 'react-native-chart-kit'
import chroma from 'chroma-js'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import { Dimensions } from 'react-native'
import { Box, Heading, ScrollView, useColorMode } from '@gluestack-ui/themed'

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

  const processData = (signals, labels) => {
    if (!signals) {
      return
    }

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
      let dataset = {
        label,
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
        let key = label == 'RSSI' ? 'Signal' : label
        data.datasets[index].data.push(entry[key])
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

  const colorMode = useColorMode()

  let colors =
    colorMode == 'light'
      ? chroma.scale('BuPu').mode('lch').colors(4)
      : ['#cc0000', '#cccc00', '#00cccc', '#cc00cc']

  const options = {
    backgroundColor:
      colorMode == 'light' ? '$backgroundCardLigt' : '$backgroundCardDark',
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    color: (opacity = 1) => chroma(colors[1]).darken().alpha(opacity).css()
  }

  let optionsRSSI = {
    ...options
  }

  let optionsRX = {
    ...options,
    color: (opacity = 1) => chroma(colors[2]).alpha(opacity).css()
  }
  let optionsTX = {
    ...options,
    color: (opacity = 1) => chroma(colors[3]).alpha(opacity).css()
  }

  let signalsRSSI = processData(signals, ['RSSI'])
  /*signalsRSSI = {
    labels: ['January', 'February', 'March', 'April', 'May', 'June'],
    datasets: [
      {
        data: [20, 45, 28, 80, 99, 43]
      }
    ]
  }*/
  let signalsRX = processData(signals, ['RX'])
  let signalsTX = processData(signals, ['TX'])

  const width = Dimensions.get('window').width - 50

  return (
    <ScrollView>
      <Heading size="sm" p="$4">
        Device Signal Strength (RSSI)
      </Heading>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
        mb="$4"
      >
        {signalsRSSI ? (
          <BarChart
            style={{
              marginVertical: 8
            }}
            width={width}
            height={220 + 180}
            chartConfig={optionsRSSI}
            verticalLabelRotation={30}
            data={signalsRSSI}
          />
        ) : null}
      </Box>

      {signalsRX ? (
        <>
          <Heading size="sm" p="$4">
            Device RX Rate
          </Heading>

          <Box
            bg="$backgroundCardLight"
            sx={{
              _dark: { bg: '$backgroundCardDark' }
            }}
            p="$4"
          >
            <BarChart
              width={width}
              height={220 + 180}
              chartConfig={optionsRX}
              verticalLabelRotation={30}
              data={signalsRX}
            />
          </Box>
        </>
      ) : null}

      {signalsTX ? (
        <>
          <Heading size="sm" p="$4">
            Device TX Rate
          </Heading>

          <Box
            bg="$backgroundCardLight"
            sx={{
              _dark: { bg: '$backgroundCardDark' }
            }}
            p="$4"
            mb="$4"
            pb="$16"
          >
            <BarChart
              width={width}
              height={220 + 180}
              chartConfig={optionsTX}
              verticalLabelRotation={30}
              data={signalsTX}
            />
          </Box>
        </>
      ) : null}
    </ScrollView>
  )
}
