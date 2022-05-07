import React from 'react'
import PropTypes from 'prop-types'

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

export default class AddBlock extends React.Component {
  state = {
    SrcIP: '',
    DstIP: '',
    Protocol: 'tcp'
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
    return (
      <Stack space={4}>
        <HStack space={4}>
          <FormControl flex="1" isRequired>
            <FormControl.Label>Source address</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
            />
            <FormControl.HelperText>IP address or CIDR</FormControl.HelperText>
          </FormControl>
          <FormControl flex="1" isRequired>
            <FormControl.Label>Destination address</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              value={this.state.DstIP}
              onChangeText={(value) => this.handleChange('DstIP', value)}
            />
            <FormControl.HelperText>IP address or CIDR</FormControl.HelperText>
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

AddBlock.propTypes = {
  notifyChange: PropTypes.func
}
