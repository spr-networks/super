import React, { useContext } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'AppContext'

import ClientSelect from 'components/ClientSelect'
import { firewallAPI } from 'api'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  HStack,
  VStack
} from '@gluestack-ui/themed'

import ProtocolRadio from 'components/Form/ProtocolRadio'

class AddForwardImpl extends React.Component {
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

    firewallAPI
      .addForward(rule)
      .then((res) => {
        if (this.props.notifyChange) {
          this.props.notifyChange('forward')
        }
      })
      .catch((err) => {
        this.props.alertContext.error('Firewall API Failure', err)
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
      <VStack space="md">
        <HStack space="md">
          <FormControl flex="2">
            <FormControlLabel>
              <FormControlLabelText>Source IP Address</FormControlLabelText>
            </FormControlLabel>
            <Input size="md" variant="underlined">
              <InputField
                variant="underlined"
                value={this.state.SrcIP}
                onChangeText={(value) => this.handleChange('SrcIP', value)}
              />
            </Input>
            <FormControlHelper>
              <FormControlHelperText>Accepts IP or CIDR</FormControlHelperText>
            </FormControlHelper>
          </FormControl>
          <FormControl flex={1}>
            <FormControlLabel>
              <FormControlLabelText>Incoming Port</FormControlLabelText>
            </FormControlLabel>
            <Input size="md" variant="underlined">
              <InputField
                value={this.state.SrcPort}
                onChangeText={(value) => this.handleChange('SrcPort', value)}
              />
            </Input>
          </FormControl>
        </HStack>
        <HStack space={2}>
          <FormControl flex="2">
            <FormControlLabel>
              <FormControlLabelText>
                Destination IP address
              </FormControlLabelText>
            </FormControlLabel>
            <ClientSelect
              name="DstIP"
              value={this.state.DstIP}
              onSubmitEditing={(value) => this.handleChange('DstIP', value)}
              onChangeText={(value) => this.handleChange('DstIP', value)}
              onChange={(value) => this.handleChange('DstIP', value)}
            />
          </FormControl>
          <FormControl flex={1}>
            <FormControlLabel>
              <FormControlLabelText>Dest Port</FormControlLabelText>
            </FormControlLabel>
            <Input size="md" variant="underlined">
              <InputField
                value={this.state.DstPort}
                onChangeText={(value) => this.handleChange('DstPort', value)}
              />
            </Input>
          </FormControl>
        </HStack>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Protocol</FormControlLabelText>
          </FormControlLabel>

          <ProtocolRadio
            value={this.state.Protocol}
            onChange={(value) => this.handleChange('Protocol', value)}
          />
        </FormControl>

        <Button action="primary" size="md" onPress={this.handleSubmit}>
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>
    )
  }
}

AddForwardImpl.propTypes = {
  notifyChange: PropTypes.func
}

export default function AddForward(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddForwardImpl
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddForwardImpl>
  )
}
