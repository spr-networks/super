import React from 'react'
import PropTypes from 'prop-types'
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
  Spinner,
  Row
} from 'reactstrap'

export default class DNSAddBlocklist extends React.Component {
  static contextType = APIErrorContext
  state = { URI: '', Enabled: true, pending: false }

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

    this.setState({ pending: true })

    blockAPI
      .putBlocklist(blocklist)
      .then(() => {
        this.setState({ pending: false })
        this.props.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.reportError('API Failure: ' + error.message)
      })

    setTimeout(() => {
      // can take some time - close modal
      if (this.state.pending) {
        this.props.notifyChange('blocklists')
      }
    }, 5000)
  }

  render() {
    if (this.state.pending) {
      return (
        <div className="text-center text-muted">
          <Spinner
            style={{ fontSize: '2rem', width: '10rem', height: '10rem' }}
          />
          <p className="mt-4">Updating blocklists...</p>
        </div>
      )
    }

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

DNSAddBlocklist.propTypes = {
  notifyChange: PropTypes.func
}
