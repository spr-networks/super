import React, { Component } from 'react'
import DNSLogHistoryList from 'components/DNS/DNSLogHistoryList'
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import { Row, Col } from 'reactstrap'

export default class DNSLog extends Component {
  state = { enabled: true, logs: [], ips: [], filterText: '' }

  constructor(props) {
    super(props)

    let { ips, text } = props.match.params
    if (ips && ips != ':ips') {
      this.state.ips = ips.split(',')
    }

    if (text && text != ':text') {
      this.state.filterText = text
    }
  }

  componentDidMount() {
    logAPI.config().catch((error) => this.setState({ enabled: false }))
  }

  render() {
    if (!this.state.enabled) {
      return <PluginDisabled plugin="dns" />
    }

    return (
      <div className="content">
        <Row>
          <Col md="12">
            <DNSLogHistoryList
              ips={this.state.ips}
              filterText={this.state.filterText}
            />
          </Col>
        </Row>
      </div>
    )
  }
}
