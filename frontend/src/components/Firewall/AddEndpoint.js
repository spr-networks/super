import React, { useContext } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'AppContext'

import ClientSelect from 'components/ClientSelect'
import { firewallAPI, deviceAPI } from 'api'

import {
  Badge,
  BadgeText,
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
  Pressable,
  TrashIcon,
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
    Tag: '',
    devices: {},
    selected: [],
    pickerKey: 0,
    isLoading: false
  }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)

    const initial = props.item || props.draft
    if (initial) {
      this.state = {
        ...this.state,
        RuleName: initial.RuleName || '',
        Description: initial.Description || '',
        Protocol: initial.Protocol || 'tcp',
        IP: initial.IP || '',
        Port: initial.Port || 'any',
        Tag:
          initial.Tag ||
          (initial.Tags && initial.Tags[0]) ||
          '',
        selected: props.initialDeviceIds || []
      }
    }
  }

  deviceById(id) {
    return Object.values(this.state.devices).find(
      (d) => (d.MAC || d.WGPubKey) === id
    )
  }

  addDevice = (value) => {
    if (!value) return
    let dev = Object.values(this.state.devices).find(
      (d) =>
        d.RecentIP &&
        (d.RecentIP === value || d.RecentIP.split('/')[0] === value)
    )
    let id = dev && (dev.MAC || dev.WGPubKey)
    this.setState((prevState) => {
      let add = id && !prevState.selected.includes(id)
      return {
        selected: add ? [...prevState.selected, id] : prevState.selected,
        pickerKey: prevState.pickerKey + 1
      }
    })
  }

  removeDevice = (id) => {
    this.setState((prevState) => ({
      selected: prevState.selected.filter((x) => x !== id)
    }))
  }

  handleChange(name, value) {
    //TODO verify IP && port
    this.setState({ [name]: value })
  }

  async tagSelectedDevices(tag) {
    let byId = {}
    Object.values(this.state.devices).forEach((d) => {
      let id = d.MAC || d.WGPubKey
      if (id) byId[id] = d
    })
    for (let id of this.state.selected) {
      let d = byId[id]
      if (!d) continue
      let newTags = [...new Set([...(d.DeviceTags || []), tag])]
      try {
        await deviceAPI.updateTags(id, newTags)
      } catch (e) {
        this.props.alertContext.error('Failed to tag device ' + (d.Name || id))
      }
    }
  }

  handleSubmit() {
    let tag = this.state.Tag.trim().toLowerCase()
    let rule = {
      RuleName: this.state.RuleName,
      Description: this.state.Description,
      IP: this.state.IP,
      Protocol: this.state.Protocol,
      Port: this.state.Port,
      Tags: tag ? [tag] : []
    }

    this.setState({ isLoading: true })

    const done = async () => {
      if (tag && this.state.selected.length) {
        await this.tagSelectedDevices(tag)
      }
      if (this.props.notifyChange) {
        this.props.notifyChange('endpoint')
      }
      this.setState({ isLoading: false })
    }

    const fail = (err) => {
      this.props.alertContext.error('Firewall API Failure' + err.message)
      this.setState({ isLoading: false })
    }

    if (this.props.item) {
      firewallAPI
        .deleteEndpoint(this.props.item)
        .then(() =>
          firewallAPI
            .addEndpoint(rule)
            .then(done)
            .catch((err) => {
              firewallAPI.addEndpoint(this.props.item).catch(() => {})
              fail(err)
            })
        )
        .catch(fail)
    } else {
      firewallAPI.addEndpoint(rule).then(done).catch(fail)
    }
  }

  componentDidMount() {
    deviceAPI
      .list()
      .then((devices) => {
        let next = { devices }

        if (this.props.item && this.state.Tag) {
          let tag = this.state.Tag.trim().toLowerCase()
          let selected = Object.values(devices)
            .filter((d) =>
              (d.DeviceTags || []).some((t) => String(t).toLowerCase() === tag)
            )
            .map((d) => d.MAC || d.WGPubKey)
            .filter(Boolean)
          next.selected = selected
        }

        this.setState(next)
      })
      .catch(() => {})
  }

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

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Tag</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="underlined">
            <InputField
              autoComplete="off"
              placeholder="e.g. nas-access"
              value={this.state.Tag}
              onChangeText={(value) => this.handleChange('Tag', value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText>
              Only devices with this tag can reach the endpoint. Add devices
              below to apply the tag to them automatically.
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        {this.state.Tag.trim().length ? (
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Apply tag to devices</FormControlLabelText>
            </FormControlLabel>
            <ClientSelect
              key={this.state.pickerKey}
              value=""
              onChange={(value) => this.addDevice(value)}
              onSubmitEditing={(value) => this.addDevice(value)}
            />
            {this.state.selected.length ? (
              <HStack space="sm" flexWrap="wrap" mt="$2">
                {this.state.selected.map((id) => {
                  let d = this.deviceById(id)
                  return (
                    <Badge key={id} action="muted" variant="outline" size="sm">
                      <BadgeText>
                        {d ? d.Name || d.RecentIP || id : id}
                      </BadgeText>
                      <Pressable ml="$1" onPress={() => this.removeDevice(id)}>
                        <Icon as={TrashIcon} size="xs" color="$red700" />
                      </Pressable>
                    </Badge>
                  )
                })}
              </HStack>
            ) : null}
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
      item={props.item}
      draft={props.draft}
      initialDeviceIds={props.initialDeviceIds}
      notifyChange={props.notifyChange}
      alertContext={alertContext}
    ></AddEndpointImpl>
  )
}
