import React, { useContext } from 'react'
import PropTypes from 'prop-types'

import ClientSelect from 'components/ClientSelect'
import { firewallAPI } from 'api'
import { AlertContext } from 'AppContext'

import {
  Button,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxGroup,
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

class AddContainerInterfaceRuleImpl extends React.Component {
  state = {
    SrcIP: '',
    Interface: '',
    WAN: false,
    LAN: false,
    DNS: false,
    Groups: [],
    Tags: []
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

    let crule = {
      SrcIP: this.state.SrcIP,
      Interface: this.state.Interface,
      WAN: this.state.WAN,
      LAN: this.state.LAN,
      DNS: this.state.DNS
    }

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('container_interface')
      }
    }

    firewallAPI
      .addContainerInterfaceRule(crule)
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
            <FormControlLabelText>Source address</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              variant="underlined"
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
            <FormControlLabelText>Interface Name</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              variant="underlined"
              value={this.state.Interface}
              onChangeText={(value) => this.handleChange('Interface', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>Interface</FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Network Options</FormControlLabelText>
          </FormControlLabel>
          <CheckboxGroup>
            <Checkbox
              value={this.state.WAN}
              onChange={(value) => this.handleChange('WAN', value)}
              defaultIsChecked={this.state.WAN}
            >
              <CheckboxIndicator mr="$1">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>WAN</CheckboxLabel>
            </Checkbox>
          </CheckboxGroup>
          <CheckboxGroup>
            <Checkbox
              value={this.state.LAN}
              defaultIsChecked={this.state.LAN}
              onChange={(value) => this.handleChange('LAN', value)}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>LAN</CheckboxLabel>
            </Checkbox>
          </CheckboxGroup>
          <CheckboxGroup>
            <Checkbox
              value={this.state.DNS}
              defaultIsChecked={this.state.DNS}
              onChange={(value) => this.handleChange('DNS', value)}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>DNS</CheckboxLabel>
            </Checkbox>
          </CheckboxGroup>
        </FormControl>

        <Button action="primary" size="md" onPress={this.handleSubmit}>
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>
    )
  }
}

AddContainerInterfaceRuleImpl.propTypes = {
  notifyChange: PropTypes.func
}

export default function AddContainerInterfaceRule(props) {
  let alertContext = useContext(AlertContext)
  return (
    <AddContainerInterfaceRuleImpl
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddContainerInterfaceRuleImpl>
  )
}
