
import { Component } from 'react'
import { hostapdAllStations } from 'components/Helpers/Api.js'

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Row,
  Col,
} from 'reactstrap'

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
      <Card className="card-stats">
      <CardBody>
        <Row>
          <Col md="4" xs="5">
            <div className="icon-big text-center icon-warning">
              <i className="fa fa-wifi text-info" />
            </div>
          </Col>
          <Col md="8" xs="7">
            <div className="numbers">
              <p className="card-category">Active WiFi Clients</p>                
              <div>
                <WifiClientCount />
              </div>
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
    )
  }
}