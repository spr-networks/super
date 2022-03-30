import React, { Component, useContext } from "react"
import { getDNSConfig, getDNSBlocklists, updateDNSBlocklist, deleteDNSBlocklist } from "components/Helpers/Api"
import DNSBlocklist from "components/DNS/DNSBlocklist"
import DNSOverrideList from "components/DNS/DNSOverrideList"
import { APIErrorContext } from 'layouts/Admin'

import {
  Row,
  Col,
} from "reactstrap";

export default class DNSLog extends Component {
  state = { config: "" };
  static contextType = APIErrorContext;

  constructor(props) {
    super(props)
  }

  async componentDidMount() {
    await this.refreshConfig()
  }

  async refreshConfig() {
    /*
    try {
      let config = await getDNSConfig()

      this.setState({BlockDomains: config.BlockDomains})
      this.setState({PermitDomains: config.PermitDomains})
    } catch (error) {
      this.context.reportError("API Failure: " + error.message)
    }
    */
  }

  render() {
    return (
      <div className="content">
				<Row>
          <Col md="12">
            <h1>TODO DNS log</h1>
          </Col>
        </Row>
      </div>
    );

  }
}
