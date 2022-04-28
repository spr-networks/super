import React, { Component } from 'react'

import { firewallAPI } from 'api'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'

import { Row, Col } from 'reactstrap'

export default class Firewall extends Component {
  state = { config: {} }

  constructor(props) {
    super(props)
  }

  fetchConfig = () => {
    firewallAPI.config().then((config) => this.setState({ config }))
  }

  componentDidMount() {
    this.fetchConfig()
  }

  render() {
    return (
      <div className="content">
        <Row>
          <Col md="12">
            <ForwardList />
          </Col>
        </Row>

        <Row>
          <Col md="12">
            <BlockList
              type="Src"
              title="Block Incoming IP Source"
              list={this.state.config.BlockSrc}
              notifyChange={this.fetchConfig}
            />
            <BlockList
              type="Dst"
              title="Block Outgoing IP Destination "
              list={this.state.config.BlockDst}
              notifyChange={this.fetchConfig}
            />
          </Col>
        </Row>
      </div>
    )
  }
}
