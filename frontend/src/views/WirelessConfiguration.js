import React, { useState, useContext, Component } from 'react'

import { hostapdConfiguration } from "components/Helpers/Api.js";
import {APIErrorContext} from 'layouts/Admin.js';

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

export default class WirelessConfiguration extends Component {

  state = {configText: ""}

  static contextType = APIErrorContext;

  async componentDidMount() {

    hostapdConfiguration().then((data) => {
      this.setState({configText: data})
    }).catch((err) => {
      this.context.reportError("API Failure get traffic: " + err.message)
    });

  }

  render() {
    return (
        <div className="content">
          <Row>
            <Col>
              <Card>
                <CardHeader>
                  <h3>Hostapd Configuration:</h3>
                </CardHeader>
                <CardBody>
                  <pre>
                  {this.state.configText}
                  </pre>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </div>
    );
  }
}
