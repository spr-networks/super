import React from 'react'
import Icon from 'FontAwesomeUtils'
import { faPen, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import { blockAPI } from 'api/DNS'
import DNSAddBlocklist from 'components/DNS/DNSAddBlocklist'
import ModalForm from 'components/ModalForm'
import { AlertContext } from 'layouts/Admin'
import ModalConfirm from 'components/ModalConfirm'

import {
  Badge,
  Box,
  FlatList,
  Heading,
  IconButton,
  Menu,
  Stack,
  HStack,
  VStack,
  Skeleton,
  Spacer,
  Spinner,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

export default class DNSBlocklist extends React.Component {
  state = { list: [],
            blockedDomains: 0,
            pending: false,
            tags: [],
            showModal: false,
            modalType: '' }

  constructor(props) {
    super(props)

    this.state.list = []
    this.state.pending = true

    this.handleItemSwitch = this.handleItemSwitch.bind(this)
    this.deleteListItem = this.deleteListItem.bind(this)
    this.notifyChange = this.notifyChange.bind(this)

    this.refAddBlocklistModal = React.createRef()
  }

  componentDidMount() {
    this.refreshBlocklists()
    this.refreshMetrics()

    // pending requests
    this.timer = setTimeout(() => {
      if (this.state && !this.state.list.length) {
        this.setState({ list: [], pending: true })
      }
    }, 1500)
  }

  componentWillUnmount() {
    clearTimeout(this.timer)
  }

  refreshMetrics() {
    blockAPI.metrics().then((metrics) => {
      this.setState({ blockedDomains: metrics.BlockedDomains })
    })
  }

  refreshBlocklists() {
    let list = []

    blockAPI
      .blocklists()
      .then((blocklist) => {
        list = blocklist
        this.setState({ list })
        this.setState({ pending: false })
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  notifyChange(type) {
    this.setState({ pending: false })
    this.refreshBlocklists()
  }

  handleItemSwitch(item, value) {
    item.Enabled = value
    const list = this.state.list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    // only update the ui
    this.setState({ list, pending: true })

    blockAPI
      .putBlocklist(item)
      .then((res) => {
        this.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  deleteListItem(item) {
    if (this.state.pending) {
      return this.context.error('Wait for pending updates to finish')
    }

    this.setState({ pending: true })

    blockAPI
      .deleteBlocklist(item)
      .then((res) => {
        this.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  handleTags = (tags) => {
    tags = tags.filter((v) => typeof v === 'string')
    tags = [...new Set(tags)]
    this.setState({ tags })

      //tbd
    /*
    deviceAPI
      .updateTags(this.props.device.MAC || this.props.device.WGPubKey, tags)
      .catch((error) =>
        this.context.error('[API] updateDevice error: ' + error.message)
      )
      */
  }

  render() {
    const notifyChangeBlocklist = async () => {
      await this.notifyChange()
      // close modal when added
      this.refAddBlocklistModal.current()
    }

    const removeTag = (value) => {
      let tags = this.state.tags.filter((tag) => tag != value)
      return this.handleTags(tags)
    }

    const handleChangeTags = (tags) => {
      return this.handleTags(tags)
    }

    const handleSubmitNew = (value) => {
      this.handleTags(this.state.tags.concat(value))
    }

    const defaultTags = this.props.tags || []

    let edit = true //this.props.edit !== undefined ? this.props.edit : true

    return (
      <Box
        _light={{ bg: 'warmGray.50' }}
        _dark={{ bg: 'blueGray.800' }}
        rounded="md"
        width="100%"
        p="4"
        mb="4"
      >
        <HStack justifyContent="space-between">
          <VStack>
            <Heading fontSize="xl">DNS Blocklists</Heading>

            {!this.state.pending ? (
              <Text color="muted.500">
                {this.state.blockedDomains.toLocaleString()} blocked domains
              </Text>
            ) : (
              <HStack space={1}>
                <Spinner accessibilityLabel="Loading posts" />
                <Text color="muted.500">Update running...</Text>
              </HStack>
            )}
          </VStack>

          <Box alignSelf="center">
            {!this.state.pending ? (
              <ModalForm
                title="Add DNS Blocklist"
                triggerText="add"
                triggerClass="pull-right"
                triggerIcon={faPlus}
                modalRef={this.refAddBlocklistModal}
              >
                <DNSAddBlocklist notifyChange={notifyChangeBlocklist} />
              </ModalForm>
            ) : null}
          </Box>
        </HStack>

        <FlatList
          data={this.state.list}
          renderItem={({ item }) => (
            <Box
              borderBottomWidth="1"
              _dark={{
                borderColor: 'muted.600'
              }}
              borderColor="muted.200"
              py="2"
            >
              <HStack
                space={3}
                justifyContent="space-between"
                alignItems="center"
              >
                <Text minW="50%" isTruncated>
                  {item.URI}
                </Text>

                <Box>
                  <Switch
                    isDisabled={this.state.pending}
                    defaultIsChecked={item.Enabled}
                    onValueChange={() =>
                      this.handleItemSwitch(item, !item.Enabled)
                    }
                  />
                </Box>

                {item.Tags ? item.Tags.map((entry) => (
                  <Badge key={item.URI + entry} variant="outline">
                    {entry}
                  </Badge>
                )): null}

                <Menu
                  trigger={(triggerProps) => {
                    return (
                      <IconButton
                        display={{ base: edit ? 'flex' : 'none' }}
                        size="xs"
                        variant="ghost"
                        icon={<Icon icon={faPen} />}
                        {...triggerProps}
                      />
                    )
                  }}
                >
                  <Menu.OptionGroup
                    title="Tags"
                    type="checkbox"
                    defaultValue={this.state.tags}
                    onChange={handleChangeTags}
                  >
                    {[...new Set(defaultTags.concat(this.state.tags))].map(
                      (tag) => (
                        <Menu.ItemOption key={tag} value={tag}>
                          {tag}
                        </Menu.ItemOption>
                      )
                    )}
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


                <IconButton
                  alignSelf="center"
                  size="sm"
                  variant="ghost"
                  colorScheme="secondary"
                  icon={<Icon icon={faXmark} />}
                  onPress={() => this.deleteListItem(item)}
                />
              </HStack>

            </Box>


          )}
          keyExtractor={(item) => item.URI}
        />

        <ModalConfirm
          type={this.state.modalType}
          onSubmit={handleSubmitNew}
          onClose={() => this.setState({ showModal: false })}
          isOpen={this.state.showModal}
        />

      </Box>
    )
  }
}

DNSBlocklist.contextType = AlertContext
