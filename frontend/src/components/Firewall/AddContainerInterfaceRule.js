import React, { useContext } from 'react'
import PropTypes from 'prop-types'

import { firewallAPI } from 'api'
import { AlertContext, AppContext } from 'AppContext'

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
  HStack,
  Input,
  InputField,
  Switch,
  Text,
  VStack
} from '@gluestack-ui/themed'

import { TagItem, GroupItem, PolicyItem } from 'components/TagItem'
import { GroupMenu, TagMenu, PolicyMenu } from 'components/TagMenu'

import ProtocolRadio from 'components/Form/ProtocolRadio'
import InputSelect from 'components/InputSelect'

class AddContainerInterfaceRuleImpl extends React.Component {
  state = {
    Disabled: false,
    RuleName: '',
    SrcIP: '',
    Interface: '',
    RouteDst: '',
    Policies: [],
    Groups: [],
    Tags: [],
    GroupOptions: []
  }

  defaultPolicies = ['wan', 'dns', 'lan', 'api', 'lan_upstream', 'disabled']
  defaultGroups = []
  defaultTags = []

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(name, value) {
    if (name == 'Interface') {
      let ifaceIdx = this.props.interfaceList.indexOf(value)
      if (ifaceIdx > -1) {
        this.setState({ SrcIP: this.props.netBlocks[ifaceIdx] })
      }
    }
    this.setState({ [name]: value })
  }

  handleSubmit(event) {
    event.preventDefault()

    let crule = {
      RuleName: this.state.RuleName,
      Disabled: this.state.Disabled,
      SrcIP: this.state.SrcIP,
      RouteDst: this.state.RouteDst,
      Interface: this.state.Interface,
      Policies: this.state.Policies,
      Groups: this.state.Groups,
      Tags: this.state.Tags
    }

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('custom_interface')
      }
    }

    firewallAPI
      .addCustomInterfaceRule(crule)
      .then(done)
      .catch((err) => {
        this.props.alertContext.error('Firewall API Failure', err)
      })
  }

  componentDidMount() {
    this.props.appContext.getGroups().then((groups) => {
      this.handleChange('GroupOptions', groups) //groups.map(x => ({label: x, value: x})))
    })
  }

  handlePolicies = (policies) => {
    this.handleChange('Policies', policies)
  }

  handleGroups = (groups) => {
    this.handleChange('Groups', groups)
  }

  handleTags = (tags) => {
    this.handleChange('Tags', tags)
  }

  render() {
    let interfaceOptions = this.props.interfaceList.map((n) => {
      return { label: n, value: n }
    })
    return (
      <VStack space="md">
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Rule Name</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              variant="underlined"
              value={this.state.RuleName}
              onChangeText={(value) => this.handleChange('RuleName', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              Friendly name for rule
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Interface</FormControlLabelText>
          </FormControlLabel>
          <InputSelect
            variant="underlined"
            value={this.state.Interface}
            options={interfaceOptions}
            onChangeText={(value) => this.handleChange('Interface', value)}
            onChange={(value) => this.handleChange('Interface', value)}
          />
          <FormControlHelper>
            <FormControlHelperText>
              Interface name (type one if not in the list)
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Container Address Range</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              variant="underlined"
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              IP address or CIDR allowed as Source IPs for the interface.
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>
              Set Route Destination (optional)
            </FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              variant="underlined"
              value={this.state.RouteDst}
              onChangeText={(value) => this.handleChange('RouteDst', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>IP address</FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Network Policies, Groups, & Tags</FormControlLabelText>
          </FormControlLabel>
          <HStack flexWrap="wrap" w="$full" space="md">
            <HStack space="md" flexWrap="wrap" alignItems="center">
              {this.state.Policies.map((policy) => (
                <PolicyItem key={policy} name={policy} size="sm" />
              ))}
            </HStack>
            <HStack space="md" flexWrap="wrap" alignItems="center">
              {this.state.Groups.map((group) => (
                <GroupItem key={group} name={group} size="sm" />
              ))}
            </HStack>
            <HStack space="md" flexWrap="wrap" alignItems="center">
              {this.state.Tags.map((tag) => (
                <TagItem key={tag} name={tag} size="sm" />
              ))}
            </HStack>
          </HStack>
          <HStack space="md" flexWrap="wrap" alignItems="center">
            <PolicyMenu
              items={[
                ...new Set(this.defaultPolicies)
              ]}
              selectedKeys={this.state.Policies}
              onSelectionChange={this.handlePolicies}
            />

            <GroupMenu
              items={[
                ...new Set(this.defaultGroups.concat(this.state.GroupOptions))
              ]}
              selectedKeys={this.state.Groups}
              onSelectionChange={this.handleGroups}
            />

            <TagMenu
              items={[
                ...new Set(this.defaultTags.concat(this.state.TagOptions))
              ]}
              selectedKeys={this.state.Tags}
              onSelectionChange={this.handleTags}
            />
          </HStack>

          <FormControlHelper>
            <FormControlHelperText>
              Add 'api' for access to SPR API. 'dns', 'wan' for internet access,
              and 'lan' for network access to all SPR devices.
            </FormControlHelperText>
          </FormControlHelper>
          <FormControlHelper>
            <FormControlHelperText>
              The lan_upstream tag is not accepted for a range at this time
            </FormControlHelperText>
          </FormControlHelper>
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
      appContext={props.appContext}
      interfaceList={props.interfaceList}
      netBlocks={props.netBlocks}
    ></AddContainerInterfaceRuleImpl>
  )
}
