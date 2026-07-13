import React, { useContext } from 'react'
import PropTypes from 'prop-types'

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
  Icon,
  Input,
  InputField,
  HStack,
  Pressable,
  Text,
  VStack,
  Spinner
} from '@gluestack-ui/themed'

import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react-native'

import ProtocolRadio from 'components/Form/ProtocolRadio'

class AddForwardBlockImpl extends React.Component {
  state = {
    SrcIP: '0.0.0.0/0',
    DstIP: '',
    DstPort: '',
    Protocol: 'tcp',
    Description: '',
    showAdvanced: false,
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
        DstPort: props.item.DstPort || '',
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
      DstPort: this.state.DstPort,
      Protocol: this.state.Protocol,
      Description: this.state.Description
    }

    this.setState({ isLoading: true })

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('forward_block')
      }
      this.setState({ isLoading: false })
    }

    const persist = () =>
      firewallAPI
        .addForwardBlock(block)
        .then(done)
        .catch((err) => {
          if (this.props.item) {
            firewallAPI.addForwardBlock(this.props.item).catch(() => {})
          }
          this.props.alertContext.error('Firewall API Failure', err)
          this.setState({ isLoading: false })
        })

    if (this.props.item) {
      firewallAPI
        .deleteForwardBlock(this.props.item)
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
            <FormControlLabelText>To (destination)</FormControlLabelText>
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
              The device or address the traffic is trying to reach.
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Destination Port</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              value={this.state.DstPort}
              onChangeText={(value) => this.handleChange('DstPort', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              Port to block. Leave empty for all ports.
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

        <Pressable
          onPress={() =>
            this.setState({ showAdvanced: !this.state.showAdvanced })
          }
        >
          <HStack space="sm" alignItems="center" py="$1">
            <Icon
              as={
                this.state.showAdvanced ? ChevronDownIcon : ChevronRightIcon
              }
              size="sm"
              color="$muted500"
            />
            <Text color="$muted500" size="sm">
              Advanced
            </Text>
          </HStack>
        </Pressable>

        {this.state.showAdvanced ? (
          <FormControl isRequired>
            <FormControlLabel>
              <FormControlLabelText>From (source)</FormControlLabelText>
            </FormControlLabel>
            <ClientSelect
              name="SrcIP"
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
              onChange={(value) => this.handleChange('SrcIP', value)}
              show_CIDR_Defaults={true}
            />
            <FormControlHelper>
              <FormControlHelperText>
                Where the traffic comes from. Default 0.0.0.0/0 (anywhere).
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>
        ) : null}

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

AddForwardBlockImpl.propTypes = {
  notifyChange: PropTypes.func
}

export default function AddForwardBlock(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddForwardBlockImpl
      item={props.item}
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddForwardBlockImpl>
  )
}
