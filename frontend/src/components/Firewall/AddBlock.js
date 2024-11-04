import React, { useContext } from 'react'

import ClientSelect from 'components/ClientSelect'

import { firewallAPI } from 'api'
import { AlertContext } from 'AppContext'

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

class AddBlockImpl extends React.Component {
  state = {
    SrcIP: '0.0.0.0/0',
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
        this.props.notifyChange('block')
      }
    }

    firewallAPI
      .addBlock(block)
      .then(done)
      .catch((err) => {
        this.props.alertContext.error('Firewall API Failure', err)
      })
  }

  componentDidMount() {}

  render() {
    return (
      <VStack space="md">
        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Source IP Address</FormControlLabelText>
          </FormControlLabel>

          <Input size="md" variant="underlined">
            <InputField
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>IP address or CIDR</FormControlHelperText>
          </FormControlHelper>
        </FormControl>
        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Destination IP Address</FormControlLabelText>
          </FormControlLabel>
          <ClientSelect
            name="DstIP"
            value={this.state.DstIP}
            onSubmitEditing={(value) => this.handleChange('DstIP', value)}
            onChangeText={(value) => this.handleChange('DstIP', value)}
            onChange={(value) => this.handleChange('DstIP', value)}
            show_CIDR_Defaults={true}
          />
          <FormControlHelper>
            <FormControlHelperText>IP address or CIDR</FormControlHelperText>
          </FormControlHelper>
        </FormControl>

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

export default function AddBlock(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddBlockImpl
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddBlockImpl>
  )
}
