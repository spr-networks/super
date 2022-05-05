import React, { useContext, Component } from 'react'
// react plugin used to create charts
import { Chart as ChartJS } from 'chart.js/auto'
import { Bar } from 'react-chartjs-2'

import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import { Box, Heading, View } from 'native-base'

export default class SignalStrength extends Component {
  state = {
    signals: {},
    signals_rssi: {},
    signals_rxtx: {},
    signal_scale: 'All Time'
  }

  static contextType = AlertContext
  macToName = {}
  macToIP = {}

  clientLabelFromMAC(mac) {
    let name = this.macToName[mac]
    let ip = this.macToIP[mac]
    return `${name} ${ip}`
  }

  async fetchData() {
    const stations = await wifiAPI.allStations().catch((error) => {
      this.context.error('API Failure get traffic: ' + error.message)
    })

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

  async componentDidMount() {
    // this is for mac => ip lookup in tooltip
    const arp = await wifiAPI.arp().catch((error) => {
      this.context.error('API Failure get traffic: ' + error.message)
    })

    for (const a of arp) {
      //skip incomplete entries
      if (a.MAC == '00:00:00:00:00:00') {
        continue
      }

      this.macToIP[a.MAC] = a.IP
    }

    // get devices for mac => name lookup
    const devices = await deviceAPI.list().catch((error) => {
      this.context.error('API Failure get traffic: ' + error.message)
    })

    Object.keys(devices).forEach((mac) => {
      this.macToName[mac] = devices[mac].Name
    })

    const signals = await this.fetchData()
    this.setState({ signals })

    let signals_rssi = this.processData('RSSI')
    let signals_rxtx = this.processData(['RX', 'TX'])

    this.setState({ signals_rssi })
    this.setState({ signals_rxtx })
  }

  processData(labels = ['RSSI']) {
    labels = Array.isArray(labels) ? labels : [labels]

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

    let signals = this.state.signals
    for (const entry of signals) {
      data.labels.push(entry.MAC)

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

  render() {
    /*let handleScaleMenu = (e) => {
      let choice = e.target.parentNode.getAttribute('value')
      let scale = e.target.value

      this.processTrafficHistory(choice, scale).then((result) => {
        let o = {}
        o[choice + '_scale'] = scale
        o[choice] = result
        this.setState(o)
      })
    }*/

    let options = {
      indexAxis: 'x',
      plugins: {
        legend: { display: false },

        tooltip: {
          callbacks: {
            beforeBody: (tooltipItems) =>
              this.clientLabelFromMAC(tooltipItems[0].label)
          }
        }
      },
      scales: {}
    }

    let options_rssi = Object.assign(options, {
      scales: {
        RSSI: {
          position: 'right',
          type: 'linear',
          ticks: {
            includeBounds: true,
            color: '#9f9f9f'
          } /*
          grid: {
            zeroLineColor: 'transparent',
            display: true,
            drawBorder: false,
            color: '#f0f0f0'
          }*/
        }
      }
    })

    let options_rxtx = Object.assign(options, {
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
    })

    return (
      <View>
        <Box
          rounded="md"
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          width="100%"
          p="4"
          mb="4"
        >
          <Heading>Device Signal Strength (RSSI)</Heading>
          <Box>
            {this.state.signals_rssi.datasets ? (
              <Bar data={this.state.signals_rssi} options={options_rssi} />
            ) : null}
          </Box>
        </Box>
        <Box
          rounded="md"
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          width="100%"
          p="4"
          mb="4"
        >
          <Heading>Device RX/TX Rate</Heading>
          <Box>
            {this.state.signals_rxtx.datasets ? (
              <Bar data={this.state.signals_rxtx} options={options_rxtx} />
            ) : null}
          </Box>
        </Box>
      </View>
    )
  }
}
