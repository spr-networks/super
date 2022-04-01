import { Component } from 'react'
import { blockAPI } from 'api/DNS'

import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Row,
  Col,
} from 'reactstrap'

export default class DNSMetrics extends Component {
  state = {TotalQueries: 0, BlockedQueries: 0}
  async componentDidMount() {
    const metrics = await blockAPI.metrics()
    this.setState({ TotalQueries: metrics.TotalQueries })
    this.setState({ BlockedQueries: metrics.BlockedQueries })
  }

  render() {
    return (
      <Card className="card-stats">
      <CardBody>
        <Row>
          <Col md="4" xs="5">
            <div className="icon-big text-center icon-warning">
              <i className="nc-icon nc-world-2 text-info" />
            </div>
          </Col>
          <Col md="8" xs="7">
            <div className="numbers">
              <p className="card-category">DNS Metrics</p>
              <div>
                {this.state.TotalQueries}
                <small className="text-muted"> queries</small>
              </div>
            </div>
          </Col>
        </Row>
      </CardBody>
      <CardFooter>
        <hr />
        <div className="stats">
          <i className="fa fa-ban" />
          {this.state.BlockedQueries} blocked
        </div>
      </CardFooter>
    </Card>
  )
  }
}
