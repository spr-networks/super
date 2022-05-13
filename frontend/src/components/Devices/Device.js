import { Component } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { deviceAPI } from 'api/Device'
import ModalConfirm from 'components/ModalConfirm'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPen, faXmark } from '@fortawesome/free-solid-svg-icons'

import {
  Badge,
  Button,
  Box,
  Divider,
  Heading,
  Icon,
  IconButton,
  Input,
  Menu,
  Stack,
  HStack,
  VStack,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

class Device extends Component {
  state = {
    editing: false,
    name: '',
    groups: [],
    tags: [],
    showModal: false,
    modalType: ''
    /*allTags: [
      { label: 'private', value: 'private' },
      { label: 'foo', value: 'foo' },
      { label: 'dns', value: 'dns' },
      { label: 'lan', value: 'lan' },
      { label: 'wan', value: 'wan' }
    ]*/
  }

  async componentDidMount() {
    const device = this.props.device

    this.setState({
      groups: device.Groups,
      name: device.Name,
      tags: device.DeviceTags
    })
  }

  handleGroups = (groups) => {
    if (!this.props.device.MAC && !this.props.device.WGPubKey) {
      return
    }

    groups = groups.filter((v) => typeof v === 'string')
    groups = [...new Set(groups)]
    this.setState({ groups })

    deviceAPI
      .updateGroups(this.props.device.MAC || this.props.device.WGPubKey, groups)
      .catch((error) =>
        this.context.error('[API] updateDevice error: ' + error.message)
      )
  }

  handleTags = (tags) => {
    if (!this.props.device.MAC && !this.props.device.WGPubKey) {
      return
    }

    tags = tags.filter((v) => typeof v === 'string')
    tags = [...new Set(tags)]
    this.setState({ tags })

    deviceAPI
      .updateTags(this.props.device.MAC || this.props.device.WGPubKey, tags)
      .catch((error) =>
        this.context.error('[API] updateDevice error: ' + error.message)
      )
  }

  handleName = (name) => {
    this.setState({ name })
    let editing = name != this.props.device.Name
    this.setState({ editing })
  }

  render() {
    const device = this.props.device

    let protocolAuth = { sae: 'WPA3', wpa2: 'WPA2' }
    let wifi_type = protocolAuth[device.PSKEntry.Type] || 'N/A'

    const removeDevice = (e) => {
      let id = device.MAC || device.WGPubKey || 'pending'

      deviceAPI
        .deleteDevice(id)
        .then(this.props.notifyChange)
        .catch((error) =>
          this.context.error('[API] deleteDevice error: ' + error.message)
        )
    }

    const saveDevice = async () => {
      let id = device.MAC || device.WGPubKey
      if (!this.state.name) {
        return
      }

      deviceAPI
        .updateName(id, this.state.name)
        .then(this.props.notifyChange)
        .catch((error) =>
          this.context.error('[API] updateName error: ' + error.message)
        )
    }

    const removeGroup = (value) => {
      let groups = this.state.groups.filter((group) => group != value)
      return this.handleGroups(groups)
    }

    const removeTag = (value) => {
      let tags = this.state.tags.filter((tag) => tag != value)
      return this.handleTags(tags)
    }

    const handleChangeGroups = (groups) => {
      return this.handleGroups(groups)
    }

    const handleChangeTags = (tags) => {
      return this.handleTags(tags)
    }

    const handleSubmit = () => {
      this.setState({ editing: false })
      saveDevice()
    }

    const handleSubmitNew = (value) => {
      if (this.state.modalType.match(/Group/i)) {
        this.handleGroups(this.state.groups.concat(value))
      } else {
        this.handleTags(this.state.tags.concat(value))
      }
    }

    const defaultGroups = ['wan', 'dns', 'lan']

    return (
      <>
        <Stack
          direction="row"
          space={2}
          py={2}
          w="100%"
          key={device.MAC}
          justifyContent="space-between"
          alignItems="center"
          borderBottomWidth={1}
          borderColor="muted.200"
          _dark={{
            borderColor: 'muted.600'
          }}
        >
          <Stack
            direction={{ base: 'column', md: 'row' }}
            space={4}
            justifyContent="space-between"
            minW="90%"
          >
            <VStack flex={1}>
              <Input
                size="lg"
                type="text"
                variant="underlined"
                value={this.state.name}
                onChangeText={(value) => this.handleName(value)}
                onSubmitEditing={handleSubmit}
              />
              {device.oui !== undefined ? (
                <Text color="muted.500">{device.oui}</Text>
              ) : null}
            </VStack>

            <Stack
              direction={{ base: 'row', md: 'column' }}
              space={2}
              alignSelf="center"
              alignItems="center"
            >
              <Text bold>{device.RecentIP}</Text>
              <Text fontSize="xs" color="muted.500">
                {device.MAC}
              </Text>
            </Stack>

            <Text display={{ base: 'none', md: 'flex' }} alignSelf="center">
              {wifi_type}
            </Text>

            <HStack flex={2} space={1} alignSelf="center" alignItems="center">
              {this.state.groups.map((group) => (
                <Badge key={group} variant="solid">
                  {group}
                </Badge>
              ))}

              {/*<Button.Group isAttached size="xs" space="0">
                <Button variant="solid" colorScheme="secondary" pr="0">
                  {tag}
                </Button>
                <IconButton
                  variant="solid"
                  colorScheme="secondary"
                  icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                  onPress={() => removeTag(tag)}
                />
              </Button.Group>*/}

              {this.state.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}

              <Menu
                trigger={(triggerProps) => {
                  return (
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<Icon as={FontAwesomeIcon} icon={faPen} />}
                      {...triggerProps}
                    />
                  )
                }}
              >
                <Menu.OptionGroup
                  title="Groups"
                  type="checkbox"
                  defaultValue={this.state.groups}
                  onChange={handleChangeGroups}
                >
                  {[...new Set(defaultGroups.concat(this.state.groups))].map(
                    (group) => (
                      <Menu.ItemOption key={group} value={group}>
                        {group}
                      </Menu.ItemOption>
                    )
                  )}
                  <Menu.ItemOption
                    key="newGroup"
                    onPress={() => {
                      this.setState({ showModal: true, modalType: 'Group' })
                    }}
                  >
                    New Group...
                  </Menu.ItemOption>
                </Menu.OptionGroup>
                <Menu.OptionGroup
                  title="Tags"
                  type="checkbox"
                  defaultValue={this.state.tags}
                  onChange={handleChangeTags}
                >
                  {this.state.tags.map((tag) => (
                    <Menu.ItemOption key={tag} value={tag}>
                      {tag}
                    </Menu.ItemOption>
                  ))}
                  <Menu.ItemOption
                    key="newTag"
                    onPress={() => {
                      this.setState({ showModal: true, modalType: 'Tag' })
                    }}
                  >
                    New Tag...
                  </Menu.ItemOption>
                </Menu.OptionGroup>
              </Menu>
            </HStack>
          </Stack>

          <Box w="50" marginLeft="auto" justifyContent="center">
            {/*<Button className="btn-icon" color="warning" size="sm">
            <i className="fa fa-edit" />
          </Button>*/}
            <Button.Group size="sm">
              <IconButton
                variant="ghost"
                colorScheme="secondary"
                icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                onPress={removeDevice}
              />
            </Button.Group>
          </Box>
        </Stack>

        <ModalConfirm
          type={this.state.modalType}
          onSubmit={handleSubmitNew}
          onClose={() => this.setState({ showModal: false })}
          isOpen={this.state.showModal}
        />
      </>
    )

    /*<CreatableSelect
            isClearable
            isMulti
            onChange={this.handleChangeTags}
            options={this.state.allTags}
            placeholder="Groups"
            defaultValue={this.state.allTags.slice(2, 5)}
          />*/

    /*
    return (
      <tr>
        <td>
          <Input
            type="text"
            placeholder="Device name"
            name="name"
            className={this.state.editing ? 'border-info' : 'border-light'}
            value={this.state.name}
            onChange={this.handleName}
            onKeyPress={handleKeyPress}
            size="10"
          />

          {device.oui !== undefined ? (
            <Label className="info small pl-2">{device.oui}</Label>
          ) : null}
        </td>
        <td className="text-center">
          <div>{device.RecentIP}</div>
          <div className="text-muted">
            <small>{device.MAC}</small>
          </div>
        </td>

        <td> {wifi_type} </td>
        <td>

          <TagsInput
            inputProps={{ placeholder: 'Add group' }}
            value={this.state.groups}
            onChange={this.handleGroups}
            tagProps={{ className: 'react-tagsinput-tag' }}
          />
        </td>
        <td>

          <TagsInput
            inputProps={{ placeholder: 'Add tag' }}
            value={this.state.tags}
            onChange={this.handleTags}
            tagProps={{ className: 'react-tagsinput-tag' }}
          />
        </td>
        <td className="text-right">
          <Button
            className="btn-icon"
            color="danger"
            id={'tooltip' + (generatedID + 1)}
            size="sm"
            onClick={removeDevice}
          >
            <i className="fa fa-times" />
          </Button>
          <UncontrolledTooltip delay={0} target={'tooltip' + (generatedID + 1)}>
            Delete
          </UncontrolledTooltip>
        </td>
      </tr>
    )
    */
  }
}

Device.propTypes = {
  device: PropTypes.object.isRequired
}

Device.contextType = AlertContext

export default Device
