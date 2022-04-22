import React from 'react'
import PropTypes from 'prop-types'
import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'

import { APIErrorContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
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

export default class AddForward extends React.Component {
  static contextType = APIErrorContext
  state = {
    SIface: 'wlan1',
    Protocol: 'tcp',
    SrcIP: '',
    SrcPort: 0,
    DstIP: '',
    DstPort: 0
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleChangeSelect = this.handleChangeSelect.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    //TODO verify IP && port
    let name = event.target.name,
      value = event.target.value
    this.setState({ [name]: value })
  }

  handleChangeSelect(name, opt) {
    this.setState({ [name]: opt.value })
  }

  handleSubmit(event) {
    event.preventDefault()

    let rule = {
      SIface: this.state.SIface,
      Protocol: this.state.Protocol,
      SrcIP: this.state.SrcIP,
      SrcPort: this.state.SrcPort,
      DstIP: this.state.DstIP,
      DstPort: this.state.DstPort
    }

    firewallAPI.addForward(rule).then((res) => {
      console.log('submitted')
      if (this.props.notifyChange) {
        this.props.notifyChange('forward')
      }
    })
  }

  componentDidMount() {}

  render() {
    let selOpt = (value) => {
      return { label: value, value }
    }

    let SIfaces = [
      { label: 'wlan0', value: 'wlan0' },
      { label: 'wlan1', value: 'wlan1' }
    ]

    let SIface = selOpt(this.state.SIface)

    let Protocols = ['tcp', 'udp'].map((p) => {
      return { label: p, value: p }
    })

    let Protocol = selOpt(this.state.Protocol)

    let SrcIPs = [
      { label: '1.1.1.1', value: '1.1.1.1' },
      { label: '1.1.1.2', value: '1.1.1.2' }
    ]

    let SrcIP = selOpt(this.state.SrcIP)

    return (
      <Form onSubmit={this.handleSubmit}>
        <Row>
          <Col md={8}>
            <FormGroup>
              <Label for="SrcIP">Source IP address</Label>
              <CreatableSelect
                name="SrcIP"
                value={SrcIP}
                options={SrcIPs}
                onChange={(o) => this.handleChangeSelect('SrcIP', o)}
              />
            </FormGroup>
          </Col>
          <Col md={4}>
            <FormGroup>
              <Label for="SrcPort">Source Port</Label>
              <Input
                type="number"
                id="SrcPort"
                placeholder="Port .. range"
                name="SrcPort"
                value={this.state.SrcPort}
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

        <Row>
          <Col md={8}>
            <FormGroup>
              <Label for="DstIP">Destination IP address</Label>
              <ClientSelect
                isCreatable
                skipAll
                name="DstIP"
                value={this.state.DstIP}
                onChange={(o) => this.handleChangeSelect('DstIP', o)}
              />
              {/*<FormText tag="span">IP address</FormText>*/}
            </FormGroup>
          </Col>
          <Col md={4}>
            <FormGroup>
              <Label for="DstPort">Dest Port</Label>
              <Input
                type="number"
                id="DstPort"
                placeholder="Port .. range"
                name="DstPort"
                value={this.state.DstPort}
                onChange={this.handleChange}
              />
            </FormGroup>
          </Col>
        </Row>

        <hr />

        <Row className="mt-4">
          <Label for="SIface" md="2">
            Interface
          </Label>
          <Col md={4}>
            <FormGroup>
              <Select
                value={SIface}
                options={SIfaces}
                onChange={(o) => this.handleChangeSelect('SIface', o)}
              />
              {/*<Input
                type="text"
                id="AllowedIPs"
                placeholder="192.168.3.2/32"
                name="AllowedIPs"
                value={this.state.AllowedIPs}
                onChange={this.handleChange}
                autoFocus
              />*/}
            </FormGroup>
          </Col>

          <Label for="Protocol" md="2">
            Protocol
          </Label>
          <Col md={4}>
            <FormGroup>
              <Select
                options={Protocols}
                value={Protocol}
                onChange={(o) => this.handleChangeSelect('Protocol', o)}
              />
            </FormGroup>
          </Col>
        </Row>

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

AddForward.propTypes = {
  notifyChange: PropTypes.func
}
