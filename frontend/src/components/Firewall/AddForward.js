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

class AddForwardImpl extends React.Component {
  state = {
    Protocol: 'tcp',
    SrcIP: '0.0.0.0/0',
    SrcPort: '80',
    DstIP: '',
    DstPort: '',
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
        Protocol: props.item.Protocol || 'tcp',
        SrcIP: props.item.SrcIP || '0.0.0.0/0',
        SrcPort: props.item.SrcPort || 'any',
        DstIP: props.item.DstIP || '',
        DstPort: props.item.DstPort || '',
        Description: props.item.Description || ''
      }
    }
  }

  handleChange(name, value) {
    //TODO verify IP && port
    this.setState({ [name]: value })
  }

  handleSubmit() {
    let rule = {
      Protocol: this.state.Protocol,
      SrcIP: this.state.SrcIP,
      SrcPort: this.state.SrcPort || 'any',
      DstIP: this.state.DstIP,
      DstPort: this.state.DstPort || 'any',
      Description: this.state.Description
    }

    this.setState({ isLoading: true })

    const persist = () =>
      firewallAPI
        .addForward(rule)
        .then((res) => {
          if (this.props.notifyChange) {
            this.props.notifyChange('forward')
          }
          this.setState({ isLoading: false })
        })
        .catch((err) => {
          this.props.alertContext.error('Firewall API Failure', err)
          this.setState({ isLoading: false })
        })

    if (this.props.item) {
      firewallAPI
        .deleteForward(this.props.item)
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
    let selOpt = (value) => {
      return { label: value, value }
    }

    let Protocols = ['tcp', 'udp'].map((p) => {
      return { label: p, value: p }
    })

    return (
      <form onSubmit={(e) => e.preventDefault()} autoComplete="off">
        <VStack space="md">
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Forward to Device</FormControlLabelText>
            </FormControlLabel>
            <ClientSelect
              name="DstIP"
              value={this.state.DstIP}
              onSubmitEditing={(value) => this.handleChange('DstIP', value)}
              onChangeText={(value) => this.handleChange('DstIP', value)}
              onChange={(value) => this.handleChange('DstIP', value)}
            />
          </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Incoming Port (WAN)</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              placeholder="any"
              value={this.state.SrcPort}
              onChangeText={(value) => this.handleChange('SrcPort', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              The external port to forward. Leave empty for any.
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Device Port</FormControlLabelText>
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
              Port on the device. Leave empty to keep the same port.
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
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Allowed Source (CIDR)</FormControlLabelText>
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
                Restrict who can connect. Default 0.0.0.0/0 (anywhere).
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
      </form>
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
      item={props.item}
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddForwardImpl>
  )
}
