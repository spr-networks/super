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
import WifiClientCount from "components/Dashboard/HostapdWidgets.js"

// reactstrap components
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Label,
  FormGroup,
  Input,
  Table,
  Row,
  Col,
  UncontrolledTooltip,
} from "reactstrap";

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
            r.push( <tr> <td> <p className="mb-0">{entry.ifname}</p> </td> <td> {address.local}/{address.prefixlen} </td> </tr>)
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
            <Card className="card-stats">
              <CardBody>
                <Row>
                  <Col md="4" xs="5">
                    <div className="icon-big text-center icon-warning">
                      <i className="nc-icon nc-vector text-danger" />
                    </div>
                  </Col>
                  <Col md="8" xs="7">
                    <div className="numbers">
                      <p className="card-category">Active WiFi Clients</p>
                      <WifiClientCount/>
                      <p />
                    </div>
                  </Col>
                </Row>
              </CardBody>
              <CardFooter>
                <hr />
                <div className="stats">
                  <i className="fa fa-clock-o" />
                  Online
                </div>
              </CardFooter>
            </Card>
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
  );
}

export default Home;
