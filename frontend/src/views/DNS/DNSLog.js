import React, { Component } from "react"
import DNSLogHistoryList from "components/DNS/DNSLogHistoryList"

import {
  Row,
  Col,
} from "reactstrap"

export default class DNSLog extends Component {
  state = { logs: [], ip: '' }

  constructor(props) {
    super(props)

    let ip = props.match.params.ip
    if (ip && ip != ':ip') {
      this.state.ip = ip
    }
  }

  componentDidMount() {
  }

  render() {
    return (
      <div className="content">
				<Row>
          <Col md="12">
              <DNSLogHistoryList ip={this.state.ip} />
          </Col>
        </Row>
      </div>
    )
  }
}