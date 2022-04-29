import React, { useContext, Component } from 'react'

import { APIErrorContext } from 'layouts/Admin'
import LogList from 'components/Logs/LogList'

import { Row, Col } from 'reactstrap'

export default class Logs extends Component {
  state = { containers: [] }
  static contextType = APIErrorContext

  constructor(props) {
    super(props)

    let { containers } = props.match.params
    if (containers && containers != ':containers') {
      this.state.containers = containers.split(',')
    }
  }

  render() {
    return (
      <div className="content">
        <Row>
          <Col md="12">
            <LogList containers={this.state.containers} />
          </Col>
        </Row>
      </div>
    )
  }
}
