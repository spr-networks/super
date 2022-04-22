import React from 'react'
import PropTypes from 'prop-types'

import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'
import { APIErrorContext } from 'layouts/Admin'
import { firewallAPI } from 'api'

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

export default class AddBlock extends React.Component {
  static contextType = APIErrorContext
  state = {
    IP: '',
    Port: 0,
    Protocol: 'tcp'
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleChangeSelect = this.handleChangeSelect.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    //TODO verify IP && port
    console.log('change:', event)
    let name = event.target.name,
      value = event.target.value
    this.setState({ [name]: value })
  }

  handleChangeSelect(name, opt) {
    this.setState({ [name]: opt.value })
  }

  handleSubmit(event) {
    event.preventDefault()

    let block = {
      IP: this.state.IP,
      Port: this.state.Port,
      Protocol: this.state.Protocol
    }

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('forward')
      }
    }

    if (this.props.type.toLowerCase() == 'src') {
      firewallAPI.addBlockSrc(block).then(done)
    } else {
      firewallAPI.addBlockDst(block).then(done)
    }
  }

  componentDidMount() {}

  render() {
    let selOpt = (value) => {
      return { label: value, value }
    }

    let Protocols = ['tcp', 'udp'].map((p) => {
      return { label: p, value: p }
    })

    let Protocol = selOpt(this.state.Protocol)

    let IPs = [
      { label: '1.1.1.1', value: '1.1.1.1' },
      { label: '1.1.1.2', value: '1.1.1.2' }
    ]

    let IP = selOpt(this.state.IP)

    return (
      <Form onSubmit={this.handleSubmit}>
        <Row>
          <Col md={3}>
            <FormGroup>
              <Label for="Protocol">Protocol</Label>
              <Select
                options={Protocols}
                value={Protocol}
                onChange={(o) => this.handleChangeSelect('Protocol', o)}
              />
            </FormGroup>
          </Col>
          <Col md={6}>
            <FormGroup>
              <Label for="SrcIP">IP address</Label>
              <CreatableSelect
                name="SrcIP"
                value={IP}
                options={IPs}
                onChange={(o) => this.handleChangeSelect('IP', o)}
              />
            </FormGroup>
          </Col>
          <Col md={3}>
            <FormGroup>
              <Label for="Port">Port</Label>
              <Input
                type="number"
                id="Port"
                placeholder="Port .. range"
                name="Port"
                value={this.state.Port}
                onChange={this.handleChange}
              />
              {/*<FormText tag="span">Port</FormText>*/}
            </FormGroup>
          </Col>
        </Row>

        {/*<Row>
          <Col md="12" className="text-center text-muted">
            <i className="fa fa-long-arrow-down fa-3x" />
          </Col>
        </Row>*/}

        <Row className="mt-4">
          <Col sm={{ offset: 0, size: 12 }} className="text-center">
            <Button
              className="btn-wd"
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

AddBlock.propTypes = {
  type: PropTypes.string.isRequired,
  notifyChange: PropTypes.func
}
