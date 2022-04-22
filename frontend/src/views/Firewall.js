import React, { Component } from 'react'

//import PluginList from 'components/Firewall/BlockList'

import { Row, Col } from 'reactstrap'

export default class Firewall extends Component {
  render() {
    return (
      <div className="content">
        <Row>
          <Col md="12">Firewall</Col>
        </Row>
      </div>
    )
  }
}
