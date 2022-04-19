import { Component, useEffect, useState } from 'react'
import { wifiAPI } from 'api/Wifi'
import StatsWidget from './StatsWidget'

import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Table,
  Row,
  Col
} from 'reactstrap'

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

export class WifiClients extends WifiClientCount {
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

export const Interfaces = (props) => {
  const [addrs, setAddrs] = useState([])

  useEffect(() => {
    wifiAPI.ipAddr().then((data) => {
      let ifaddrs = []
      for (let entry of data) {
        for (let address of entry.addr_info) {
          if (address.scope == 'global') {
            address.ifname = entry.ifname
            ifaddrs.push(address)
          }

          break
        }
      }

      setAddrs(ifaddrs)
    })
  })

  return (
    <Card>
      <CardBody>
        <Row>
          <Col lg={{ size: 8, offset: 2 }} md="10">
            <CardTitle tag="h7" className="text-muted">
              Interfaces
            </CardTitle>
            <CardBody>
              <Table responsive>
                <thead className="text-primary">
                  <tr>
                    <th>Interface</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {addrs.map((address) => (
                    <tr key={address.local}>
                      <td>{address.ifname}</td>
                      <td>
                        {address.local}/{address.prefixlen}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Col>
        </Row>
      </CardBody>
    </Card>
  )
}

export default WifiClients
