import React, { Component, useContext } from "react"
import DNSLogList from "components/DNS/DNSLogList"
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import {
  Row,
  Col,
} from "reactstrap"

export default class DNSLogEdit extends Component {
  state = { enabled: true }
  componentDidMount() {
    logAPI.config()
      .catch(error => this.setState({enabled: false}))  
  }

  render() {
    if (!this.state.enabled) {
      return (<PluginDisabled plugin="dns" />)
    }

    return (
      <div className="content">
				<Row>
          <Col md="12">
           <DNSLogList type="IP" title="Host Privacy IP List" description="List of Client IPs to exclude from logging" />
           <DNSLogList type="Domain" title="Domain Ignore List" description="List of domains to exclude from logging" />
          </Col>
        </Row>
      </div>
    )
  }
}
