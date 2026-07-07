import React, { useContext } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'AppContext'
import { firewallAPI } from 'api'
import { Multicast } from 'api/Multicast'
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
  VStack,
  Spinner
} from '@gluestack-ui/themed'
import InputSelect from 'components/InputSelect'

class AddMulticastPortImpl extends React.Component {
  state = {
    Address: '',
    Port: '',
    Description: '',
    isLoading: false
  }

  MulticastPorts = {
    '224.0.0.251': '5353',
    '239.255.255.250': '1900',
    '224.0.1.129': '319',
    '224.0.1.129-2': '320'
  }

  MulticastServices = [
    { label: 'mDNS', value: '224.0.0.251' },
    { label: 'SSDP', value: '239.255.255.250' },
    { label: 'PTP events', value: '224.0.1.129' },
    { label: 'PTP general', value: '224.0.1.129-2' }
  ]

  constructor(props) {
    super(props)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)

    if (props.item) {
      let [addr, port] = String(props.item.Address || '').split(':')
      this.state = {
        ...this.state,
        Address: addr || '',
        Port: port || '',
        Description: props.item.Description || ''
      }
      this.originalAddress = props.item.Address
    }
  }

  handleChange(name, value) {
    //TODO verify IP && port
    if (name == 'Address') {
      if (this.MulticastPorts[value]) {
        this.setState({ Port: this.MulticastPorts[value] })
      }
      if (value.includes('-')) {
        let new_value = value.split('-')[0]
        this.setState({ [name]: new_value })
        return
      }
    }
    this.setState({ [name]: value })
  }

  handleSubmit() {
    this.setState({ isLoading: true })

    let newAddress = this.state.Address + ':' + this.state.Port
    let description = this.state.Description
    let isEditing = !!this.props.item
    let originalAddress = this.originalAddress

    Multicast.config()
      .then((config) => {
        if (isEditing) {
          // Preserve Tags on the replaced entry; only Address/Description come
          // from the form (tags are managed via the row's TagMenu).
          config.Addresses = config.Addresses.map((e) => {
            if (e.Address === originalAddress) {
              return { ...e, Address: newAddress, Description: description }
            }
            return e
          })
        } else {
          config.Addresses.push({
            Address: newAddress,
            Description: description
          })
        }
        Multicast.setConfig(config)
          .then((res) => {
            //great, now update the firewall also
            firewallAPI
              .setMulticast({
                Port: this.state.Port,
                Upstream: false
              })
              .then(() => {
                if (this.props.notifyChange) {
                  this.props.notifyChange('multicast')
                }
                this.setState({ isLoading: false })
              })
              .catch((err) => {
                this.props.alertContext.error('Firewall API Failure', err)
                this.setState({ isLoading: false })
              })
          })
          .catch((err) => {
            this.props.alertContext.error('Multicast API Failure', err)
            this.setState({ isLoading: false })
          })
      })
      .catch((err) => {
        this.props.alertContext.error('Failed to get Multicast config', err)
        this.setState({ isLoading: false })
      })
  }

  componentDidMount() {}

  render() {
    return (
      <VStack space="md">
        <HStack space="md">
          <FormControl flex="2">
            <FormControlLabel>
              <FormControlLabelText>
                Multicast Service / Address
              </FormControlLabelText>
            </FormControlLabel>
            <InputSelect
              size="md"
              variant="underlined"
              name="Address"
              options={this.MulticastServices}
              value={this.state.Address}
              onChange={(value) => this.handleChange('Address', value)}
            />
            <FormControlHelper>
              <FormControlHelperText>
                Pick a service below to auto-fill, or type a multicast IP
                (224.x–239.x).
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>
          <FormControl flex="2">
            <FormControlLabel>
              <FormControlLabelText>Port</FormControlLabelText>
            </FormControlLabel>
            <Input size="md" variant="underlined">
              <InputField
                name="Port"
                autoComplete="off"
                placeholder="5353"
                value={this.state.Port}
                onChangeText={(value) => this.handleChange('Port', value)}
              />
            </Input>
            <FormControlHelper>
              <FormControlHelperText>
                Auto-filled when you pick a service. Change only if your service
                uses a different port.
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>
        </HStack>
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Description</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              placeholder="Optional label"
              autoComplete="off"
              value={this.state.Description}
              onChangeText={(value) => this.handleChange('Description', value)}
            />
          </Input>
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

AddMulticastPortImpl.propTypes = {
  notifyChange: PropTypes.func
}

export default function AddMulticastPort(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddMulticastPortImpl
      item={props.item}
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddMulticastPortImpl>
  )
}
