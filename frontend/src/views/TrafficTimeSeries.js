import React, { useContext, Component } from 'react'

import { View, VStack } from 'native-base'

import { deviceAPI, trafficAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'
import chroma from 'chroma-js'

import TimeSeries from 'components/Traffic/TimeSeries'

class TrafficTimeSeries extends Component {
  state = {
    clients: [],
    WanIn_scale: 'All Time',
    LanIn_scale: 'All Time',
    WanOut_scale: 'All Time',
    LanOut_scale: 'All Time',
    WanIn: {},
    WanOut: {},
    LanIn: {},
    LanOut: {},
    chartModes: {}
  }

  constructor(props) {
    super(props)
    let chartModes = {},
      types = ['WanOut', 'WanIn', 'LanIn', 'LanOut']

    types.map((type) => (chartModes[type] = 'data'))
    this.state.chartModes = chartModes
  }

  static contextType = APIErrorContext

  cached_traffic_data = null

  async fetchData() {
    let traffic_data
    if (this.cached_traffic_data !== null) {
      traffic_data = this.cached_traffic_data
    } else {
      traffic_data = this.cached_traffic_data = await trafficAPI
        .history()
        .catch((error) => {
          this.context.reportError(
            'API Failure get traffic history: ' + error.message
          )
        })
    }

    return traffic_data
  }

  async buildTimeSeries(target = '') {
    let chartMode = this.state.chartModes[target]
    // data = [ {1 minute array of IP => stats, }, ...]
    let traffic_data = await this.fetchData()

    const scaleOffset = {
      '1 Hour': 60 - 1,
      '1 Day': 60 * 24 - 1,
      '15 Minutes': 15 - 1
    }

    let scale = this.state[`${target}_scale`]

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
      let client = this.state.clients.filter((client) => client.IP == ip)
      client = client ? client[0] : null
      return client && client.Name ? client.Name : ip
    }

    // setup datasets
    let datasets = []

    let colors = chroma
      .scale('Spectral')
      .mode('lch')
      .colors(Object.keys(ipStats).length)

    let index = 0
    for (let ip in ipStats) {
      const c = chroma(colors[index++])
        .alpha(0.85)
        .css()
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

  componentDidMount() {
    let targets = ['WanOut', 'WanIn', 'LanOut', 'LanIn']

    deviceAPI.list().then((devices) => {
      let clients = Object.values(devices).map((d) => {
        return { Name: d.Name, IP: d.RecentIP, MAC: d.MAC }
      })

      this.setState({ clients })
    })

    targets.map(async (target) => {
      let datasets = await this.buildTimeSeries(target)
      this.setState({ [target]: { datasets } })
    })
  }

  render() {
    const rebuildTimeSeries = (type) => {
      this.buildTimeSeries(type).then((datasets) => {
        this.setState({ [type]: { datasets: datasets } })
      })
    }

    const handleChangeTime = (value, type) => {
      this.setState({ [`${type}_scale`]: value })
      rebuildTimeSeries(type)
    }

    const handleChangeMode = (value, type) => {
      let chartModes = this.state.chartModes
      chartModes[type] = value
      this.setState({ chartModes }, () => rebuildTimeSeries(type))
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
      <View>
        <VStack>
          {['WanOut', 'WanIn', 'LanIn', 'LanOut'].map((type) => {
            return (
              <TimeSeries
                key={type}
                type={type}
                title={prettyTitle(type)}
                data={this.state[type]}
                chartMode={this.state.chartModes[type]}
                handleChangeTime={handleChangeTime}
                handleChangeMode={handleChangeMode}
              />
            )
          })}
        </VStack>
      </View>
    )
  }
}

export default TrafficTimeSeries
