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
  VStack,
  HStack,
  Spinner
} from '@gluestack-ui/themed'

import ProtocolRadio from 'components/Form/ProtocolRadio'

class AddEndpointImpl extends React.Component {
  state = {
    RuleName: '',
    Description: '',
    Protocol: 'tcp',
    IP: '',
    Port: 'any',
    Address: '',
    isLoading: false
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
      Description: this.state.Description,
      IP: this.state.IP,
      Protocol: this.state.Protocol,
      Port: this.state.Port
    }

    this.setState({ isLoading: true })

    firewallAPI
      .addEndpoint(rule)
      .then((res) => {
        if (this.props.notifyChange) {
          this.props.notifyChange('endpoint')
        }
        this.setState({ isLoading: false })
      })
      .catch((err) => {
        this.props.alertContext.error('Firewall API Failure' + err.message)
        this.setState({ isLoading: false })
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
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Name</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              placeholder="e.g. home-nas"
              value={this.state.RuleName}
              onSubmitEditing={(value) => this.handleChange('RuleName', value)}
              onChangeText={(value) => this.handleChange('RuleName', value)}
              onChange={(value) => this.handleChange('RuleName', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              A short, unique name. Used to reference this service in firewall
              rules and tags.
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>IP Address</FormControlLabelText>
          </FormControlLabel>
          <ClientSelect
            name="IP"
            value={this.state.IP}
            onSubmitEditing={(value) => this.handleChange('IP', value)}
            onChangeText={(value) => this.handleChange('IP', value)}
            onChange={(value) => this.handleChange('IP', value)}
            show_CIDR_Defaults={true}
          />
          <FormControlHelper>
            <FormControlHelperText>
              The service's address — a single IP (e.g. 192.168.2.10) or CIDR
              range. Required.
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Port</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              value={this.state.Port}
              onChangeText={(value) => this.handleChange('Port', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              A single port (e.g. 443), or `any` for all ports.
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        {/* //domains are not yet implemented.
          <HStack space={4}>
          <FormControl flex={1}>
            <FormControlLabel>Domain</FormControlLabel>
            <Input
              size="md"
              variant="underlined"
              name="Domain"
              value={this.state.Domain}
              onChangeText={(value) => this.handleChange('Domain', value)}
            />
          </FormControl>
        </HStack>
        */}

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
