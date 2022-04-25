import React, { Component } from 'react'

import { wifiAPI, deviceAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'

import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  Table,
  Row,
  Col
} from 'reactstrap'

export default class WifiClients extends Component {
  state = { clients: [] }

  static contextType = APIErrorContext

  akmSuiteAuth = (suite) => {
    let suites = {
      '00-0f-ac-1': '802.1x',
      '00-0f-ac-2': 'WPA-PSK',
      '00-0f-ac-3': 'FT-802.1x',
      '00-0f-ac-4': 'WPA-PSK-FT',
      '00-0f-ac-5': '802.1x-SHA256',
      '00-0f-ac-6': 'WPA-PSK-SHA256',
      '00-0f-ac-7': 'TDLS',
      '00-0f-ac-8': 'WPA3-SAE',
      '00-0f-ac-9': 'FT-SAE',
      '00-0f-ac-10': 'AP-PEER-KEY',
      '00-0f-ac-11': '802.1x-suite-B',
      '00-0f-ac-12': '802.1x-suite-B-192',
      '00-0f-ac-13': 'FT-802.1x-SHA384',
      '00-0f-ac-14': 'FILS-SHA256',
      '00-0f-ac-15': 'FILS-SHA384',
      '00-0f-ac-16': 'FT-FILS-SHA256',
      '00-0f-ac-17': 'FT-FILS-SHA384',
      '00-0f-ac-18': 'OWE',
      '00-0f-ac-19': 'FT-WPA2-PSK-SHA384',
      '00-0f-ac-20': 'WPA2-PSK-SHA384'
    }

    return suites[suite] || 'unknown'
  }

  refreshClients = async () => {
    const stations = await wifiAPI.allStations().catch((error) => {
      this.context.reportError('API Failure:' + error.message)
    })

    const devices = await deviceAPI.list().catch((error) => {
      this.context.reportError('API Failure getDevices: ' + error.message)
    })

    let clients = Object.values(devices).filter((device) =>
      Object.keys(stations).includes(device.MAC)
    )

    clients = clients.map((client) => {
      let station = stations[client.MAC]
      client.Auth = this.akmSuiteAuth(station.AKMSuiteSelector)
      client.Signal = station.signal

      return client
    })

    this.setState({ clients })
  }

  async componentDidMount() {
    this.refreshClients()
  }

  render() {
    return (
      <>
        <Row>
          <Col md="12">
            {/*
            <Card>
              <CardHeader>
                <CardTitle tag="h4">Wifi Clients</CardTitle>
                <CardSubtitle className="text-muted">
                  Clients connected to AP
                </CardSubtitle>
              </CardHeader>
              <CardBody>*/}
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th>Device</th>
                  <th>MAC Address</th>
                  <th>IP Address</th>
                  <th>Auth</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {this.state.clients.map((row) => (
                  <tr>
                    <td>{row.Name}</td>
                    <td>{row.MAC}</td>
                    <td>{row.RecentIP}</td>
                    <td>{row.Auth}</td>
                    <td>{prettySignal(row.Signal)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {/*</CardBody>
            </Card>*/}
          </Col>
        </Row>
      </>
    )
  }
}
