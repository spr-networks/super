import React, { useState, useEffect } from 'react'

import { blockAPI, wifiAPI } from 'api'
import WifiClients, { WifiInfo } from 'components/Dashboard/HostapdWidgets'
import {
  DNSMetrics,
  DNSBlockMetrics,
  DNSBlockPercent
} from 'components/Dashboard/DNSMetricsWidgets'

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

function Home() {
  const [addrs, setAddrs] = useState([])
  const [plugins, setPlugins] = useState([])

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

    // check if dns plugin is active
    blockAPI
      .config()
      .then((res) => setPlugins(plugins.concat('DNS')))
      .catch((error) => error)
  }, [])

  return (
    <>
      <div className="content">
        <Row>
          <Col md="8" sm="6">
            <Row>
              <Col sm="6">
                <WifiInfo />
              </Col>
              <Col sm="6">
                <WifiClients />
              </Col>
            </Row>

            <Card>
              <CardBody>
                <Row>
                  <Col lg={{ size: 8, offset: 2 }} md="10">
                    <p className="card-category">Interfaces</p>
                    {/*<CardTitle tag="h4"></CardTitle>*/}
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
          </Col>
          <Col sm="4">
            {plugins.includes('DNS') ? (
              <>
                <DNSMetrics />
                <DNSBlockMetrics />
                <DNSBlockPercent />
              </>
            ) : null}
          </Col>
        </Row>
      </div>
    </>
  )
}

export default Home
