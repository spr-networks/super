import React from 'react'
import { APIErrorContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'

import {
  Button,
  Col,
  Label,
  Form,
  FormGroup,
  FormText,
  Input,
  Row
} from 'reactstrap'

export default class DNSAddBlocklist extends React.Component {
  static contextType = APIErrorContext
  state = { URI: '', Enabled: true }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSwitchChange = this.handleSwitchChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    this.setState({ URI: event.target.value })
  }

  handleSwitchChange(el, Enabled) {
    this.setState({ Enabled })
  }

  handleSubmit(event) {
    event.preventDefault()

    let blocklist = { URI: this.state.URI, Enabled: this.state.Enabled }
    blockAPI
      .putBlocklist(blocklist)
      .then((res) => {
        this.props.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.reportError('API Failure: ' + error.message)
      })
  }

  render() {
    return (
      <Form onSubmit={this.handleSubmit}>
        <Row>
          <Label for="URI" sm={2}>
            URI
          </Label>
          <Col sm={10}>
            <FormGroup>
              <Input
                type="text"
                id="URI"
                placeholder="https://..."
                name="URI"
                value={this.state.URI}
                onChange={this.handleChange}
                autoFocus
              />
              <FormText tag="span">
                <a
                  target="_blank"
                  href="https://github.com/StevenBlack/hosts"
                  rel="noreferrer"
                >
                  See here
                </a>{' '}
                for examples of host files to use
              </FormText>
            </FormGroup>
          </Col>
        </Row>

        <Row>
          <Label for="Enabled" sm={2}>
            Enabled
          </Label>
          <Col sm={10}>
            <FormGroup check>
              <Label check className="mb-2">
                <Input
                  type="checkbox"
                  checked={this.state.Enabled}
                  onChange={(e) =>
                    this.handleSwitchChange(this, !this.state.Enabled)
                  }
                />
                <span className="form-check-sign" />
              </Label>
            </FormGroup>
          </Col>
        </Row>

        <Row>
          <Col sm={{ offset: 2, size: 10 }}>
            <Button
              className="btn-round"
              color="primary"
              size="md"
              type="submit"
              onClick={this.handleSubmit}
            >
              Save
            </Button>
          </Col>
        </Row>
      </Form>
    )
  }
}
