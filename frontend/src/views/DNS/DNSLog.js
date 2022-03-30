import React, { Component, useContext } from "react"
import DNSLogList from "components/DNS/DNSLogList"
import { APIErrorContext } from 'layouts/Admin'
import { logAPI } from 'api/DNS'

import {
  Row,
  Col,
  Card, CardHeader, CardTitle, CardBody, CardFooter,
} from "reactstrap";

export default class DNSLog extends Component {
  state = { config: "", HostPrivacyIPList: [], DomainIgnoreList: [] }
  static contextType = APIErrorContext

  constructor(props) {
    super(props)
  }

  async componentDidMount() {
    await this.refreshConfig()
  }

  async refreshConfig() {
    try {
      let config = await logAPI.config()

      this.setState({HostPrivacyIPList: config.HostPrivacyIPList})
      this.setState({DomainIgnoreList: config.DomainIgnoreList})
    } catch (error) {
      this.context.reportError("API Failure: " + error.message)
    }
  }

  // list ip | list domains

  render() {
    return (
      <div className="content">
				<Row>
          <Col md="12">
           <DNSLogList type="IP" title="Host Privacy IP List" />
           <DNSLogList type="Domain" title="Domain Ignore List" />
          </Col>
        </Row>
      </div>
    );

  }
}
