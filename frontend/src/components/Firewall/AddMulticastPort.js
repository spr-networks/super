import React, { useContext } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'AppContext'

import ClientSelect from 'components/ClientSelect'
import { firewallAPI } from 'api'
import { Multicast } from 'api/Multicast'

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

import InputSelect from 'components/InputSelect'

class AddMulticastPortImpl extends React.Component {
  state = {
    Address: '',
    Port: '0'
  }

  MulticastPorts = {
    '224.0.0.251': '5353',
    '239.255.255.250': '1900',
    '224.0.1.129': '319',
    '224.0.1.129-2': '320',
  }
  MulticastServices = [
    { label: "mDNS", value: "224.0.0.251" },
    { label: "SSDP", value: "239.255.255.250" },
    { label: "PTP events", value: "224.0.1.129"},
    { label: "PTP general", value: "224.0.1.129-2"}
  ]

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(name, value) {
    //TODO verify IP && port
    if (name == 'Address') {
      if (this.MulticastPorts[value]) {
        this.setState({'Port': this.MulticastPorts[value]})
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

    Multicast.
      config()
      .then((config) => {

      config.Addresses.push({Address: this.state.Address + ":" + this.state.Port})

      Multicast.setConfig(config)
        .then((res) => {
          //great, now update the firewall also

          firewallAPI
            .setMulticast({Port: this.state.Port, Upstream: false})
            .then(() => {
            })
            .catch((err) => {
              this.props.alertContext.error('Firewall API Failure', err)
            })

          if (this.props.notifyChange) {
            this.props.notifyChange('multicast')
          }
        })
        .catch((err) => {
          this.props.alertContext.error('Multicast API Failure', err)
        })

    })

  }

  componentDidMount() {}

  render() {

    return (
      <Stack space={4}>
        <HStack space={4}>
          <FormControl flex="2">
            <FormControl.Label>Address</FormControl.Label>
            <InputSelect
              size="md"
              variant="underlined"
              name="Address"
              options={this.MulticastServices}
              value={this.state.Address}
              onChange={(value) => this.handleChange('Address', value)}
            />
            <FormControl.HelperText>Multicast IP Address</FormControl.HelperText>
          </FormControl>
          <FormControl flex="2">
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

        <Button color="primary" size="md" onPress={this.handleSubmit}>
          Save
        </Button>
      </Stack>
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
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddMulticastPortImpl>
  )
}
