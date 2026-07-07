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
  VStack,
  Spinner
} from '@gluestack-ui/themed'

import ProtocolRadio from 'components/Form/ProtocolRadio'

class AddBlockImpl extends React.Component {
  state = {
    SrcIP: '0.0.0.0/0',
    DstIP: '',
    Protocol: 'tcp',
    Description: '',
    isLoading: false
  }

  constructor(props) {
    super(props)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)

    if (props.item) {
      this.state = {
        ...this.state,
        SrcIP: props.item.SrcIP || '0.0.0.0/0',
        DstIP: props.item.DstIP || '',
        Protocol: props.item.Protocol || 'tcp',
        Description: props.item.Description || ''
      }
    }
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
      Protocol: this.state.Protocol,
      Description: this.state.Description
    }

    this.setState({ isLoading: true })

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('block')
      }
      this.setState({ isLoading: false })
    }

    const persist = () =>
      firewallAPI
        .addBlock(block)
        .then(done)
        .catch((err) => {
          this.props.alertContext.error('Firewall API Failure', err)
          this.setState({ isLoading: false })
        })

    if (this.props.item) {
      firewallAPI
        .deleteBlock(this.props.item)
        .then(persist)
        .catch((err) => {
          this.props.alertContext.error('Firewall API Failure', err)
          this.setState({ isLoading: false })
        })
    } else {
      persist()
    }
  }

  componentDidMount() {}

  render() {
    return (
      <VStack space="md">
        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Block traffic to</FormControlLabelText>
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
            <FormControlHelperText>
              The device or address on your network to protect.
            </FormControlHelperText>
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
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Description</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              placeholder="Optional label"
              value={this.state.Description}
              onChangeText={(value) => this.handleChange('Description', value)}
            />
          </Input>
        </FormControl>

        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Coming from (source)</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              Where the blocked traffic comes from. Default 0.0.0.0/0
              (anywhere).
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <Button
          action="primary"
          size="md"
          onPress={this.handleSubmit}
          isDisabled={this.state.isLoading}
        >
          {this.state.isLoading ? (
            <Spinner color="white" size="small" />
          ) : (
            <ButtonText>Save</ButtonText>
          )}
        </Button>
      </VStack>
    )
  }
}

export default function AddBlock(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddBlockImpl
      item={props.item}
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddBlockImpl>
  )
}
