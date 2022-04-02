import React, { useContext, Component } from 'react'
// react plugin used to create charts
import { Line } from "react-chartjs-2";
import { getTraffic, getTrafficHistory, getArp, getDevices } from "components/Helpers/Api.js";
import {APIErrorContext} from 'layouts/Admin.js';
import { UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from 'reactstrap';
//for 'timeseries'
import 'chartjs-adapter-moment';
import chroma from "chroma-js";

// reactstrap components
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Row,
  Col,
} from "reactstrap";

export default class PluginDisabled extends Component {
  render() {
    let title = this.props.title || "Plugin not enabled"

    return (
      <div className="content">
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <CardTitle tag="h4">{title}</CardTitle>
              </CardHeader>
              <CardBody>
                <p>
                Read more <a href="https://www.supernetworks.org/pages/api/0#section/API-Extensions" target="_blank">here</a> on how to activate plugins.
                </p>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
    )
  }
}
