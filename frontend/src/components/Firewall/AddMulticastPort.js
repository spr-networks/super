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

class AddMulticastPortImpl extends React.Component {
  state = {
    Address: '',
    Port: '0'
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
            <Input
              size="md"
              variant="underlined"
              name="Address"
              value={this.state.Address}
              onChangeText={(value) => this.handleChange('Address', value)}
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
