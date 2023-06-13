import React, { useContext } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'AppContext'

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

class AddEndpointImpl extends React.Component {
  state = {
    RuleName: '',
    Protocol: 'tcp',
    IP: '',
    Port: 'any',
    Address: ''
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
      RuleName: this.state.RuleName,
      IP: this.state.IP,
      Domain: this.state.Domain,
      Protocol: this.state.Protocol,
      Port: this.state.Port,
    }

    firewallAPI
      .addEndpoint(rule)
      .then((res) => {
        if (this.props.notifyChange) {
          this.props.notifyChange('endpoint')
        }
      })
      .catch((err) => {
        this.props.alertContext.error('Firewall API Failure' + err.message)
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
        <HStack space={2}>
          <FormControl flex="2">
            <FormControl.Label>Name</FormControl.Label>
            <Input
              name="RuleName"
              value={this.state.RuleName}
              onSubmitEditing={(value) => this.handleChange('RuleName', value)}
              onChangeText={(value) => this.handleChange('RuleName', value)}
              onChange={(value) => this.handleChange('RuleName', value)}
            />
          </FormControl>
        </HStack>
        <HStack space={4}>
          <FormControl flex="2">
            <FormControl.Label>IP Address</FormControl.Label>
            <ClientSelect
              name="IP"
              value={this.state.IP}
              onSubmitEditing={(value) => this.handleChange('IP', value)}
              onChangeText={(value) => this.handleChange('IP', value)}
              onChange={(value) => this.handleChange('IP', value)}
            />
            <FormControl.HelperText>Accepts IP or CIDR</FormControl.HelperText>
          </FormControl>
          <FormControl flex="1">
            <FormControl.Label>Port</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              name="Port"
              value={this.state.Port}
              onChangeText={(value) => this.handleChange('Port', value)}
            />
          </FormControl>
        </HStack>
        <HStack space={4}>
          <FormControl flex="1">
            <FormControl.Label>Domain</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              name="Domain"
              value={this.state.Domain}
              onChangeText={(value) => this.handleChange('Domain', value)}
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

AddEndpointImpl.propTypes = {
  notifyChange: PropTypes.func
}

export default function AddEndpoint(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddEndpointImpl
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddEndpointImpl>
  )
}
