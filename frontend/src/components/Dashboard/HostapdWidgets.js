
import { Component } from 'react'
import { hostapdAllStations, hostapdStatus } from 'components/Helpers/Api.js'
import StatsWidget from './StatsWidget'

export class WifiClientCount extends Component {
  state = { numberOfClients: 0 }

  async componentDidMount() {
    const stations = await hostapdAllStations();
    this.setState({ numberOfWifiClients: Object.keys(stations).length })
  }

  render() {
    return (      
      <div>
        {this.state.numberOfWifiClients}
      </div>
    )
  }
}

export default class WifiClients extends Component {
  state = { numberOfClients: 0 }

  async componentDidMount() {
    const stations = await hostapdAllStations();
    this.setState({ numberOfWifiClients: Object.keys(stations).length })
  }

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
  state = { ssid: "TestAP", channel: 1024 }

  async componentDidMount() {
    let status = await hostapdStatus()
    this.setState({ssid: status['ssid[0]']})
    this.setState({channel: status['channel']})
   }

  render() {
    return (
      <StatsWidget
        icon="fa fa-wifi text-warning"
        title="Wifi AP"
        text={this.state.ssid}
        textFooter={"Channel " + this.state.channel}
        iconFooter="fa fa-wifi"
      />
    )
  }
}