import React from 'react'

import PropTypes from 'prop-types'

import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'
import { APIErrorContext } from 'layouts/Admin'
import { wifiAPI } from 'api'

import {
  Button,
  Card,
  CardBody,
  CardTitle,
  Col,
  Label,
  Form,
  FormGroup,
  FormText,
  Input,
  Row
} from 'reactstrap'

export default class WifiChannelParameters extends React.Component {
  static contextType = APIErrorContext

  Bandwidth5 =  [{label: "20 MHz", value: 20}, {label: "40 MHz", value: 40}, {label: "80 MHz", value: 80}, {label: "160 MHz", disabled: true, value: 160}, {label: "80+80 MHz", disabled: true, value: 8080}]
  Bandwidth24 =  [{label: "20 MHz", value: 20}, {label: "40 MHz", value: 40}]

  state = {
    Iface: '',
    Channel: {},
    Bandwidth: {},
    Mode: {label: '5 GHz', value: 'a'},
    HT_Enable: true,
    VHT_Enable: true,
    HE_Enable: true,

    devs: [],
    iws: [],
    loadedDevs: false,
  }

  constructor(props) {
    super(props)
    this.handleChange = this.handleChange.bind(this)
    this.handleChangeSelect = this.handleChangeSelect.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    let name = event.target.name,
      value = event.target.value
    this.setState({ [name]: value })
  }

  handleChangeSelect(name, opt) {
    if (name == "Mode") {
      this.state.Channel = {}
      this.state.Bandwidth = {}
    }
    this.setState({ [name]: opt })
  }

  handleSubmit(event) {
    event.preventDefault()

    let wifiParameters = {
      Interface: this.state.Iface,
      Channel: parseInt(this.state.Channel.value),
      Mode: this.state.Mode.value,
      Bandwidth: parseInt(this.state.Bandwidth.value),
      HT_Enable: this.state.HT_Enable,
      VHT_Enable: this.state.Mode.value == 'a' ? this.state.VHT_Enable : false,
      HE_Enable: this.state.HE_Enable,
    }

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange({...wifiParameters, ...res})
      }
    }

    wifiAPI.setChannel(wifiParameters).then(done)
  }

  enumerateChannelOptions() {
    let validChannels = []

    let expectedFreq = ''
    if (this.state.Mode.value == 'a') {
      expectedFreq = '5'
    } else if (this.state.Mode.value == 'g') {
      expectedFreq = '2'
    }

    for (let iw of this.state.iws) {
      if (iw.devices[this.props.config.interface]) {
        for (let band of iw.bands) {
          //if the band does not match the current mode, skip it
          if (band.frequencies && band.frequencies[0][0] == expectedFreq) {
            for (let freq of band.frequencies) {
              let channelNumber = freq.split(" ")[2].slice(1,-1)
              let channelLabel = channelNumber
              let is_disabled = false
              if (freq.includes("disabled")) {
                is_disabled = true
                channelLabel += " disabled"
              } else if (freq.includes("no IR")) {
                is_disabled = true
                channelLabel += " No Initial Radiation (No-IR)"
              } else if (freq.includes("radar")) {
                channelLabel += " DFS"
                if (this.props.config.ieee80211h !== 1) {
                  is_disabled = true
                }
              }
              validChannels.push({value: channelNumber, label: channelLabel, toolTip: freq, disabled: is_disabled})
            }
          }
        }
      }
    }

    return validChannels
  }

  async componentDidMount() {

    wifiAPI.iwDev().then((devs) => {

      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })

        for (let iw of iws) {
          if (iw.devices[this.props.config.interface]) {
            let cur_device = iw.devices[this.props.config.interface]
            if (!cur_device) continue

            //Enable 160 MHz if supported by the card

            for (let band of iw.bands) {
              if (band.vht_capabilities) {
                for (let capability of band.vht_capabilities) {
                  if (capability.includes("160 MHz")) {
                    this.Bandwidth5[3].disabled = false
                  }
                }
              }
            }

            //get bandwidth and cahnnel
            if (cur_device.channel) {
              let parts = cur_device.channel.split(",")
              let channel = parts[0].split(" ")[0]
              let bw = parts[1].split(" ")[2]
              this.setState({Channel: {label: channel, value: channel} })
              this.setState({Bandwidth: {label: bw + " MHz", value: bw} })

              let start_freq = parts[0].split(" ")[1].substring(1)[0]
              if (start_freq == '2') {
                this.setState({Mode: {label: "2.4 GHz", value: 'g'}})
              } else if (start_freq == '5') {
                this.setState({Mode: {label: "5 GHz", value: 'a'}})
              }
            }

          }
        }

        this.setState({devs})
        this.setState({iws})
        this.setState({loadedDevs: true})
      })

    })
  }


  render() {

    const onSelectWifiInterface = (opt) => {
      let { value } = opt
      this.setState({Iface: opt.value})
    }


    let Modes = [{label: '5 GHz', value: 'a'}, {label: '2.4 GHz', value: 'g'}]


    let devsScan = []
    let defaultDev = null
    for (let phy in this.state.devs) {
      for (let iface in this.state.devs[phy]) {
        let type = this.state.devs[phy][iface].type
        let label = `${iface} ${type}`

        devsScan.push({ value: iface, disabled: !type.includes('AP'), label })
        if (iface == this.props.config.interface) {
          defaultDev = devsScan[devsScan.length-1]
        }
      }
    }

    let Bandwidths
    if (this.state.Mode.value == 'a') {
      Bandwidths = this.Bandwidth5
    } else if (this.state.Mode.value == 'g') {
      Bandwidths = this.Bandwidth24
    }

    return (
      <Form onSubmit={this.handleSubmit}>
        <Card className="wifi-parameters">
        <CardBody>
          <Row>
            <Col>
              <div className="numbers text-center">
                <CardTitle tag="p">
                  Channel Selection
                </CardTitle>
              </div>
            </Col>
          </Row>
          <Row>
            <Col md={3}>
            <Label>WiFi Interface</Label>
            {this.state.loadedDevs ?
              <Select
                options={devsScan}
                defaultValue={defaultDev}
                isOptionDisabled={(option) => option.disabled}
                onChange={onSelectWifiInterface}
              /> : null
            }
            </Col>
            <Col md={3}>
              <FormGroup>
                <Label for="Mode">Frequency Band</Label>
                <Select
                  options={Modes}
                  value={this.state.Mode}
                  onChange={(o) => this.handleChangeSelect('Mode', o)}
                />
              </FormGroup>
            </Col>
            <Col md={3}>
              <FormGroup>
                <Label for="Bandwidth">Bandwidth</Label>
                <Select
                  options={Bandwidths}
                  value={this.state.Bandwidth}
                  isOptionDisabled={(option) => option.disabled}
                  onChange={(o) => this.handleChangeSelect('Bandwidth', o)}
                />
              </FormGroup>
            </Col>
            <Col md={3}>
              <FormGroup>
                <Label for="Channel">Channel</Label>
                <Select
                  options={this.enumerateChannelOptions()}
                  value={this.state.Channel}
                  isOptionDisabled={(option) => option.disabled}
                  onChange={(o) => this.handleChangeSelect('Channel', o)}
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

        </CardBody>
        </Card>
      </Form>
    )
  }
}

WifiChannelParameters.propTypes = {
  notifyChange: PropTypes.func
}
