import { Component } from 'react'
import { wifiAPI } from 'api/Wifi'
import StatsWidget from './StatsWidget'

export class WifiClientCount extends Component {
  state = { numberOfClients: 0 }

  async componentDidMount() {
    const stations = await wifiAPI.allStations()
    this.setState({ numberOfWifiClients: Object.keys(stations).length })
  }

  render() {
    return <div>{this.state.numberOfWifiClients}</div>
  }
}

export default class WifiClients extends WifiClientCount {
  render() {
    return (
      <StatsWidget
        icon="fa fa-laptop"
        title="Active WiFi Clients"
        text={this.state.numberOfWifiClients}
        textFooter="Online"
        iconFooter="fa fa-clock-o"
      />
    )
  }
}

export class WifiInfo extends Component {
  state = { ssid: '', channel: 0 }

  async componentDidMount() {
    let status = await wifiAPI.status()
    this.setState({ ssid: status['ssid[0]'] })
    this.setState({ channel: status['channel'] })
  }

  render() {
    return (
      <StatsWidget
        icon="fa fa-wifi text-info"
        title="Wifi AP"
        text={this.state.ssid}
        textFooter={'Channel ' + this.state.channel}
        iconFooter="fa fa-wifi"
      />
    )
  }
}
