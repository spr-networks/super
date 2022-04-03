import { Component } from 'react'

import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Row,
  Col,
} from 'reactstrap'

export default class StatsWidget extends Component {
  render() {
    return (
      <Card className="card-stats">
      <CardBody>
        <Row>
          <Col md="4" xs="5">
            <div className="icon-big text-center">
              <i className={"text-info " + this.props.icon} />
            </div>
          </Col>
          <Col md="8" xs="7">
            <div className="numbers">
              <p className="card-category">{this.props.title}</p>
              <CardTitle tag="p">
                {this.props.text}
              </CardTitle>
            </div>
          </Col>
        </Row>
      </CardBody>
      {this.props.textFooter ? (
      <CardFooter>
        <hr />
        <div className="stats">
          <i className={this.props.iconFooter} />
          {this.props.textFooter}
        </div>
      </CardFooter>
      ) : (null)}
    </Card>
  )
  }
}
