import React, {useContext} from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'AppContext'

import ClientSelect from 'components/ClientSelect'
import { firewallAPI } from 'api'

import {
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  Heading,
  HStack,
  Input,
  Link,
  Radio,
  Stack,
  Spinner,
  Switch,
  Text
} from 'native-base'

class AddServicePortImpl extends React.Component {
  state = {
    Protocol: 'tcp',
    Port: '0',
    UpstreamEnabled: false
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
      Port: this.state.Port,
      UpstreamEnabled: this.state.UpstreamEnabled
    }

    firewallAPI.addServicePort(rule).then((res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('service_port')
      }
    }).catch(err => {
      this.props.alertContext.errorResponse('Firewall API Failure', '', err)
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

    const toggleUpstream = (value) => {
      this.state.UpstreamEnabled = value

      let rule = {
        Protocol: this.state.Protocol,
        Port: this.state.Port,
        UpstreamEnabled: this.state.UpstreamEnabled
      }

      firewallAPI.addServicePort(rule).then(result => {
        if (this.props.notifyChange) {
          this.props.notifyChange('service_port')
        }
      }).catch(err => {
        this.props.alertContext.errorResponse("Firewall API: ", '', err)
      })
    }

    return (
      <Stack space={4}>
        <HStack space={4}>
          <Heading fontSize="sm">Protocol</Heading>
          <Heading fontSize="sm">Port</Heading>
          <Heading fontSize="sm">Upstream Enabled</Heading>
        </HStack>

        <HStack space={4}>
          <Badge variant="outline">{this.state.Protocol}</Badge>
          <FormControl flex="1">
            <FormControl.Label for="DstPort">Port</FormControl.Label>
            <Input
              size="md"
              variant="underlined"
              name="DstPort"
              value={this.state.Port}
              onChangeText={(value) => this.handleChange('Port', value)}
            />
          </FormControl>
          <Box w="100" alignItems="center" alignSelf="center">
            <Switch
              defaultIsChecked={this.state.UpstreamEnabled}
              onValueChange={() => toggleUpstream(!this.state.UpstreamEnabled)}
            />
          </Box>
        </HStack>

        <Button color="primary" size="md" onPress={this.handleSubmit}>
          Save
        </Button>
      </Stack>
    )
  }
}

AddServicePortImpl.propTypes = {
  notifyChange: PropTypes.func
}


export default function AddServicePort() {
  let alertContext = useContext(AlertContext);
  return <AddServicePortImpl alertContext={alertContext}></AddServicePortImpl>
};
