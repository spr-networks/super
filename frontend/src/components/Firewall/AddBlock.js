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
    SrcIP: '',
    DstIP: '',
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
      SrcIP: this.state.SrcIP,
      DstIP: this.state.DstIP,
      Protocol: this.state.Protocol
    }

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('forward')
      }
    }

    firewallAPI.addBlock(block).then(done)
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
      { label: '0.0.0.0/0', value: '0.0.0.0/0' },
      { label: '1.2.3.4', value: '1.2.3.4' }
    ]

    let SrcIP = selOpt(this.state.SrcIP)
    let DstIP = selOpt(this.state.DstIP)

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
              <Label for="SrcIP">Src address</Label>
              <CreatableSelect
                name="SrcIP"
                value={SrcIP}
                options={IPs}
                onChange={(o) => this.handleChangeSelect('SrcIP', o)}
              />
              <Label for="SrcIP">Dst address</Label>
              <CreatableSelect
                name="DstIP"
                value={DstIP}
                options={IPs}
                onChange={(o) => this.handleChangeSelect('DstIP', o)}
              />

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
  notifyChange: PropTypes.func
}
