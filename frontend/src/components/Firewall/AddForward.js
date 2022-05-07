import React from 'react'
import PropTypes from 'prop-types'

import ClientSelect from 'components/ClientSelect'
import { firewallAPI } from 'api'

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  Input,
  Link,
  Radio,
  Stack,
  HStack,
  Spinner,
  Text
} from 'native-base'

export default class AddForward extends React.Component {
  state = {
    Protocol: 'tcp',
    SrcIP: '0.0.0.0/0',
    SrcPort: 'any',
    DstIP: '',
    DstPort: 'any'
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(name, value) {
    //TODO verify IP && port
    this.setState({ [name]: value })
  }

  handleSubmit() {
    let rule = {
      Protocol: this.state.Protocol,
      SrcIP: this.state.SrcIP,
      SrcPort: this.state.SrcPort,
      DstIP: this.state.DstIP,
      DstPort: this.state.DstPort
    }

    firewallAPI.addForward(rule).then((res) => {
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

    let Protocols = ['tcp', 'udp'].map((p) => {
      return { label: p, value: p }
    })

    return (
      <Stack space={4}>
        <HStack space={4}>
          <FormControl flex="2">
            <FormControl.Label>Source IP Address</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              name="SrcIP"
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
            />
            <FormControl.HelperText>Accepts IP or CIDR</FormControl.HelperText>
          </FormControl>
          <FormControl flex="1">
            <FormControl.Label>Incoming Port</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              name="SrcPort"
              value={this.state.SrcPort}
              onChangeText={(value) => this.handleChange('SrcPort', value)}
            />
          </FormControl>
        </HStack>
        <HStack space={2}>
          <FormControl flex="2">
            <FormControl.Label>Rewrite IP address</FormControl.Label>
            <ClientSelect
              name="DstIP"
              value={this.state.DstIP}
              onChange={(value) => this.handleChange('DstIP', value)}
            />
          </FormControl>
          <FormControl flex="1">
            <FormControl.Label for="DstPort">Dest Port</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              name="DstPort"
              value={this.state.DstPort}
              onChangeText={(value) => this.handleChange('DstPort', value)}
            />
          </FormControl>
        </HStack>

        <FormControl>
          <FormControl.Label>Protocol</FormControl.Label>

          <Radio.Group
            name="Protocol"
            defaultValue={this.state.Protocol}
            accessibilityLabel="Protocol"
            onChange={(value) => this.handleChange('Protocol', value)}
          >
            <HStack space={2}>
              <Radio value="tcp">tcp</Radio>
              <Radio value="udp">udp</Radio>
            </HStack>
          </Radio.Group>
        </FormControl>

        <Button color="primary" size="md" onPress={this.handleSubmit}>
          Save
        </Button>
      </Stack>
    )
  }
}

AddForward.propTypes = {
  notifyChange: PropTypes.func
}
