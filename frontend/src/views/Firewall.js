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
    console.log(this.state.config.BlockRules)
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
              title="Block IP Source or Destination"
              list={this.state.config.BlockRules}
              notifyChange={this.fetchConfig}
            />
          </Col>
        </Row>
      </div>
    )
  }
}
