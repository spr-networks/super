import React, { Component } from "react"
import DNSLogHistoryList from "components/DNS/DNSLogHistoryList"

import {
  Row,
  Col,
} from "reactstrap"

export default class DNSLog extends Component {
  state = { logs: [], ips: [] }

  constructor(props) {
    super(props)

    let ips = props.match.params.ips
    if (ips && ips != ':ips') {
      this.state.ips = ips.split(',')
    }
  }

  componentDidMount() {
  }

  render() {
    return (
      <div className="content">
				<Row>
          <Col md="12">
              <DNSLogHistoryList ips={this.state.ips} />
          </Col>
        </Row>
      </div>
    )
  }
}