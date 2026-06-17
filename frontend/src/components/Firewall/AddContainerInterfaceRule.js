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
  Icon,
  Input,
  InputField,
  Pressable,
  Switch,
  Text,
  VStack,
  Spinner
} from '@gluestack-ui/themed'

import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react-native'

import { TagItem, GroupItem, PolicyItem } from 'components/TagItem'
import { GroupMenu, TagMenu, PolicyMenu } from 'components/TagMenu'

import ProtocolRadio from 'components/Form/ProtocolRadio'
import InputSelect from 'components/InputSelect'

class AddContainerInterfaceRuleImpl extends React.Component {
  state = {
    Disabled: false,
    RuleName: '',
    Description: '',
    SrcIP: '',
    Interface: '',
    RouteDst: '',
    Policies: [],
    Groups: [],
    Tags: [],
    GroupOptions: [],
    showAdvanced: false,
    isLoading: false
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
      Description: this.state.Description,
      Disabled: this.state.Disabled,
      SrcIP: this.state.SrcIP,
      RouteDst: this.state.RouteDst,
      Interface: this.state.Interface,
      Policies: this.state.Policies,
      Groups: this.state.Groups,
      Tags: this.state.Tags
    }

    this.setState({ isLoading: true })

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange('custom_interface')
      }
      this.setState({ isLoading: false })
    }

    firewallAPI
      .addCustomInterfaceRule(crule)
      .then(done)
      .catch((err) => {
        this.props.alertContext.error('Firewall API Failure', err)
        this.setState({ isLoading: false })
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
        <Text color="$muted500" size="sm">
          Give a container or custom network interface access to your SPR
          network. Set its interface and address range, then choose what it can
          reach.
        </Text>

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
              autoComplete="off"
              variant="underlined"
              placeholder="e.g. 10.0.0.0/24"
              value={this.state.SrcIP}
              onChangeText={(value) => this.handleChange('SrcIP', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              The IP or CIDR range used by this container/interface (e.g.
              10.0.0.0/24).
            </FormControlHelperText>
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
                ...new Set([
                  ...(this.defaultTags || []),
                  ...(this.state.Tags || [])
                ])
              ]}
              selectedKeys={this.state.Tags}
              onSelectionChange={this.handleTags}
            />
          </HStack>

          <FormControlHelper>
            <FormControlHelperText>
              Choose what this interface can reach. Add 'wan' + 'dns' for
              internet, 'lan' for other SPR devices, 'api' for the SPR API.
              (lan_upstream isn't supported for an address range.)
            </FormControlHelperText>
          </FormControlHelper>
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
              <FormControlLabelText>Set Route Destination</FormControlLabelText>
            </FormControlLabel>
            <Input size="md" variant="underlined">
              <InputField
                autoComplete="off"
                variant="underlined"
                value={this.state.RouteDst}
                onChangeText={(value) => this.handleChange('RouteDst', value)}
              />
            </Input>
            <FormControlHelper>
              <FormControlHelperText>
                Optional: send this interface's traffic to a specific gateway IP.
                Leave blank for default routing.
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>
        ) : null}

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Rule Name</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              variant="underlined"
              placeholder="e.g. media-server access"
              value={this.state.RuleName}
              onChangeText={(value) => this.handleChange('RuleName', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              A label to recognize this rule later.
            </FormControlHelperText>
          </FormControlHelper>
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
