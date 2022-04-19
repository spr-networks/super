import React, { useState, useEffect } from 'react'

import { pluginAPI } from 'api'
import {
  WifiClients,
  Interfaces,
  WifiInfo
} from 'components/Dashboard/WifiWidgets'
import { TotalTraffic } from 'components/Dashboard/TrafficWidgets'
import {
  DNSMetrics,
  DNSBlockMetrics,
  DNSBlockPercent
} from 'components/Dashboard/DNSMetricsWidgets'

import { Row, Col } from 'reactstrap'

function Home() {
  const [pluginsEnabled, setPluginsEnabled] = useState([])

  useEffect(() => {
    pluginAPI
      .list()
      .then((plugins) =>
        setPluginsEnabled(plugins.filter((p) => p.Enabled).map((p) => p.Name))
      )
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
            <Row>
              <Col sm="12">
                <TotalTraffic />
              </Col>
            </Row>
            <Row>
              <Col sm="12">
                <Interfaces />
              </Col>
            </Row>
          </Col>
          <Col sm="4">
            {pluginsEnabled.includes('dns-block') ? (
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
