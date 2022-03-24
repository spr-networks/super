
import { getDevices } from "components/Helpers/Api.js";
import { Component } from "react";
import Device from "components/Devices/Device.js"
import {APIErrorContext} from 'layouts/Admin.js';
import React, { useContext } from 'react'
import ReactBSAlert from "react-bootstrap-sweetalert";

// reactstrap components
import {
  Button,
  ButtonGroup,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Label,
  FormGroup,
  Input,
  Table,
  Row,
  Col,
  UncontrolledTooltip,
} from "reactstrap";

export default class DeviceListing extends Component {

  state = { devices : {}, deviceRows: [] };

  async componentDidMount() {

    const setState = (v) => {
      this.setState(v)
    }

    async function refreshDevices() {
      const d = await getDevices().catch(error => {
        this.context.reportError("API Failure: " + error.message)
      })

      if (d) {
        let divs = []
        Object.keys(d).forEach(function(v) {
              const generatedID = Math.random().toString(36).substr(2, 9);

              divs.push( <Device key={generatedID} device={d[v]} notifyChange={notifyChange} /> )
           });

        setState({ devices: d, deviceRows: divs })

      }
    }

    const notifyChange = () => {
      refreshDevices()
    }

    refreshDevices = refreshDevices.bind(this)
    refreshDevices()

  }

  static contextType = APIErrorContext;

  render() {

    return (
      <div>
        {this.state.alert}
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <CardTitle tag="h4">Configured Devices</CardTitle>
              </CardHeader>
              <CardBody>
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th className="text-center">MAC</th>
                      <th className="d-none d-md-table-cell">IP</th>
                      <th>Name</th>
                      <th>Auth</th>
                      <th>Zones</th>
                      <th>Tags</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    { this.state.deviceRows }
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
    )
  }
}
