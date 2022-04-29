import React, { Component } from 'react'

import PluginList from 'components/Plugins/PluginList'

import { Row, Col } from 'reactstrap'

export default class PLugins extends Component {
  render() {
    return (
      <div className="content">
        <Row>
          <Col md="12">
            <PluginList />
          </Col>
        </Row>
      </div>
    )
  }
}
