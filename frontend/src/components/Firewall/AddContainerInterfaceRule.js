import React, { useContext } from 'react'
import PropTypes from 'prop-types'

import ClientSelect from 'components/ClientSelect'
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

import { TagItem, GroupItem } from 'components/TagItem'
import { GroupMenu, TagMenu } from 'components/TagMenu'

import ProtocolRadio from 'components/Form/ProtocolRadio'

class AddContainerInterfaceRuleImpl extends React.Component {
  state = {
    Disabled: false,
    RuleName: '',
    SrcIP: '',
    Interface: '',
    RouteDst: '',
    Groups: [],
    Tags: [],
    GroupOptions: []
  }

  defaultGroups = ['wan', 'dns', 'lan', 'api']
  defaultTags = ['lan_upstream']

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(name, value) {
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
      Groups: this.state.Groups,
      Tags: this.state.Tags,
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
    this.props.appContext.getGroups()
    .then((groups) => {
      this.handleChange('GroupOptions', groups) //groups.map(x => ({label: x, value: x})))
    })
  }

  handleGroups = (groups) => {
    this.handleChange('Groups', groups)
  }

  handleTags = (tags) => {
    this.handleChange('Tags', tags)
  }

  render() {
    //this.props.appContext.getGroups().then((g) => {
//      alert(g)
  //  })
    //alert(this.props.appContext.getGroups())

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
            <FormControlHelperText>Friendly name for rule</FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Interface Address Range</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              variant="underlined"
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>IP address or CIDR allowed for interface</FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Set Route Destination (optional)</FormControlLabelText>
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

        <FormControl isRequired>
          <FormControlLabel>
            <FormControlLabelText>Interface</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              variant="underlined"
              value={this.state.Interface}
              onChangeText={(value) => this.handleChange('Interface', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>Interface name</FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Network Groups & Tags</FormControlLabelText>
          </FormControlLabel>
          <HStack flexWrap="wrap" w="$full" space="md">
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
            <GroupMenu
              items={[...new Set(this.defaultGroups.concat(this.state.GroupOptions))]}
              selectedKeys={this.state.Groups}
              onSelectionChange={this.handleGroups}
            />

            <TagMenu
              items={[...new Set(this.defaultTags.concat(this.state.TagOptions))]}
              selectedKeys={this.state.Tags}
              onSelectionChange={this.handleTags}
            />

          </HStack>
          <FormControlHelper>
            <FormControlHelperText>Add 'api' for access to SPR API. 'dns', 'wan' for internet access, and 'lan' for network access to all SPR devices</FormControlHelperText>
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
    ></AddContainerInterfaceRuleImpl>
  )
}
