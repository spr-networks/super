/*!

=========================================================
* Paper Dashboard PRO React - v1.3.0
=========================================================

* Product Page: https://www.creative-tim.com/product/paper-dashboard-pro-react
* Copyright 2021 Creative Tim (https://www.creative-tim.com)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React, {useState, useEffect} from "react";
// react plugin used to create charts
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { hostapdAllStations, ipAddr } from "components/Helpers/Api.js";
import WifiClients from "components/Dashboard/HostapdWidgets.js"
import DNSMetrics from "components/Dashboard/DNSMetricsWidgets.js"

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Table,
  Row,
  Col,
} from 'reactstrap'

function Home() {

  const [ipInfo, setipInfo] = useState([]);

  function hostapdcount() {
    hostapdAllStations(function(data) {
    })

  }

  useEffect( () => {
    ipAddr().then((data) => {
      let r = []
      for (let entry of data) {
        for (let address of entry.addr_info) {
          if (address.scope == "global") {
            const generatedID = Math.random().toString(36).substr(2, 9);
            r.push( <tr key={generatedID}><td>{entry.ifname}</td><td> {address.local}/{address.prefixlen} </td></tr>)
          }
          break
        }
      }
      setipInfo(r)
    })
  }, [])


  return (
    <>
      <div className="content">
        <Row>
          <Col lg="4" md="6" sm="6">
            <WifiClients />
          </Col>
          <Col lg="4" md="6" sm="6">
            <DNSMetrics />
          </Col>
        </Row>
        <Row>
          <Col lg="8" md="6" sm="6">
            <Card className="card-stats">
              <CardBody>
                <Row>
                  <Col md="2" xs="5">
                    <div className="icon-big text-center icon-warning">
                      <i className="nc-icon nc-globe text-warning" />
                    </div>
                  </Col>
                  <Col md="8" xs="7">
                    <p className="card-category">Interfaces</p>
                    <CardTitle tag="h4"></CardTitle>
                    <CardBody>
                      <Table responsive>
                        <thead className="text-primary">
                          <tr>
                            <th>Interface</th>
                            <th>IP Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ipInfo}
                        </tbody>
                      </Table>

                    </CardBody>
                    <p />
                  </Col>
                </Row>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
    </>
  )
}

export default Home
