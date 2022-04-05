import React, { useContext, Component } from 'react'
import { withRouter } from 'react-router'
import { trafficAPI } from 'api/Traffic'
import { deviceAPI } from 'api/Device'
import { APIErrorContext } from 'layouts/Admin.js'
//import 'chartjs-adapter-moment'
import chroma from 'chroma-js'

import TimeSeries from 'components/Charts/TimeSeries'

class TrafficTimeSeries extends Component {
  state = {
    WanIn_scale: 'All Time',
    LanIn_scale: 'All Time',
    WanOut_scale: 'All Time',
    LanOut_scale: 'All Time',
    WanIn: {},
    WanOut: {},
    LanIn: {},
    LanOut: {}
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

    /*
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
    */

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
          let z = traffic_data[idx][ip][target]
          //let diff =
          //  traffic_data[idx][ip][target] - traffic_data[idx + 1][ip][target]
          //y = diff / deltaSlices[idx]
          y = z
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
      datasets.push({
        label: ip,
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

    /*deviceAPI.list().then((devices) => {
      let clients = Object.values(devices).map((d) => {
        return { Name: d.Name, IP: d.RecentIP, MAC: d.MAC }
      })
    })*/

    targets.map(async (target) => {
      let datasets = await this.buildTimeSeries(target)
      this.setState({ [target]: { datasets } })
    })
  }

  render() {
    const handleTimeChange = (value, type) => {
      this.setState({ [`${type}_scale`]: value })

      // rebuild selected time series
      this.buildTimeSeries(type).then((datasets) => {
        this.setState({ [type]: { datasets: datasets } })
      })
    }

    const handleClientClick = (ip, datapoint) => {
      const { x: ts } = datapoint
      let d = new Date(ts)
      let filterText = d.toISOString()
      filterText += '-' + new Date(d.getTime() + 60 * 1e3).toISOString()
      this.props.history.push(`/admin/dnsLog/${ip}/${filterText}`)
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
      <div className="content">
        {['WanIn', 'WanOut' /*, 'LanIn', 'LanOut',*/].map((type) => {
          return (
            <TimeSeries
              type={type}
              title={prettyTitle(type)}
              data={this.state[type]}
              handleTimeChange={handleTimeChange}
              handleClientClick={handleClientClick}
            />
          )
        })}
      </div>
    )
  }
}

const TrafficTimeSeriesWithRouter = withRouter(TrafficTimeSeries)

export default TrafficTimeSeriesWithRouter
