import React from 'react'
import { Dimensions } from 'react-native'
import Icon from 'FontAwesomeUtils'
import {
  faEllipsis,
  faToggleOn,
  faToggleOff,
  faTrash
} from '@fortawesome/free-solid-svg-icons'

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
  Spinner,
  Text,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

export default class DNSBlocklist extends React.Component {
  state = {
    list: [],
    blockedDomains: 0,
    pending: false,
    showModal: false,
    modalType: '',
    pendingItem: {}
  }

  constructor(props) {
    super(props)

    this.state.list = []

    this.recommendedListDefault = [
      {
        URI: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/facebook.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/twitter.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/redirect.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/tracking.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/youtube.txt'
      },
      {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/everything.txt'
      }
    ]

    this.state.recommendedList = []
    this.state.pending = true

    this.handleItemSwitch = this.handleItemSwitch.bind(this)
    this.deleteListItem = this.deleteListItem.bind(this)
    this.notifyChange = this.notifyChange.bind(this)

    this.refAddBlocklistModal = React.createRef()
  }

  componentDidMount() {
    this.refreshBlocklists()
    this.refreshMetrics()
  }

  componentWillUnmount() {}

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
        if (blocklist != null) {
          list = blocklist
        }

        let recommendedList = this.recommendedListDefault.filter((_item) => {
          return !list.map((listitem) => listitem.URI).includes(_item.URI)
        })

        this.setState({ list })
        this.setState({ pending: false })
        this.setState({ recommendedList })
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

  handleTags = (item, tags) => {
    if (tags != null) {
      tags = tags.filter((v) => typeof v === 'string')
      tags = [...new Set(tags)]
    }

    item.Tags = tags

    blockAPI
      .putBlocklist(item)
      .then((res) => {
        this.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  render() {
    const notifyChangeBlocklist = async () => {
      await this.notifyChange()
      // close modal when added
      this.refAddBlocklistModal.current()
    }

    const handleChangeTags = (item, tags) => {
      return this.handleTags(item, tags)
    }

    const handleSubmitNew = (item, value) => {
      let tags = []
      if (item.Tags) {
        tags = item.Tags.concat(value)
      } else {
        tags = [value]
      }
      this.handleTags(item, tags)
    }

    const defaultTags = this.props.tags || []

    let edit = true //this.props.edit !== undefined ? this.props.edit : true

    let trigger = (triggerProps) => {
      return (
        <IconButton
          display={{ base: edit ? 'flex' : 'none' }}
          variant="unstyled"
          icon={<Icon icon={faEllipsis} color="muted.600" />}
          {...triggerProps}
        />
      )
    }

    // only show actions if we have the list
    const isOnlyRecommended = (item) => {
      return (
        this.state.list.filter((_item) => _item.URI === item.URI).length === 0
      )
    }

    return (
      <>
        <HStack justifyContent="space-between" alignItems="center" p={4}>
          <Stack direction={{ base: 'column', md: 'row' }} space={2}>
            <Heading fontSize="md">DNS Blocklists</Heading>

            {!this.state.pending ? (
              <Text color="muted.500">
                {this.state.blockedDomains.toLocaleString()} blocked domains
              </Text>
            ) : (
              <HStack space={1}>
                <Spinner accessibilityLabel="Loading lists" />
                <Text color="muted.500">Update running...</Text>
              </HStack>
            )}
          </Stack>

          {!this.state.pending ? (
            <ModalForm
              title="Add DNS Blocklist"
              triggerText="Add List"
              triggerClass="pull-right"
              modalRef={this.refAddBlocklistModal}
            >
              <DNSAddBlocklist notifyChange={notifyChangeBlocklist} />
            </ModalForm>
          ) : null}
        </HStack>

        <Box
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          width="100%"
          p={4}
          mb={4}
        >
          <FlatList
            data={[...this.state.list, ...this.state.recommendedList]}
            renderItem={({ item }) => (
              <Box
                borderBottomWidth={1}
                _dark={{
                  borderColor: 'muted.600'
                }}
                borderColor="muted.200"
                py={2}
              >
                <HStack
                  space={3}
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Text
                    w="75%"
                    flexWrap="wrap"
                    _light={{
                      color: isOnlyRecommended(item) ? 'muted.500' : 'black'
                    }}
                    _dark={{
                      color: isOnlyRecommended(item) ? 'muted.500' : 'white'
                    }}
                  >
                    {item.URI}
                  </Text>

                  {item.Enabled ? (
                    <Badge colorScheme="success" color="success.500">
                      Enabled
                    </Badge>
                  ) : null}

                  <HStack
                    flex={2}
                    space={1}
                    alignSelf="center"
                    alignItems="center"
                  >
                    {item.Tags
                      ? item.Tags.map((entry) => (
                          <Badge key={item.URI + entry} variant="outline">
                            {entry}
                          </Badge>
                        ))
                      : null}
                  </HStack>

                  <Menu trigger={trigger}>
                    <Menu.Group title="Actions">
                      <Menu.Item
                        onPress={() =>
                          this.handleItemSwitch(item, !item.Enabled)
                        }
                      >
                        <HStack space={2} alignItems="center">
                          {item.Enabled ? (
                            <>
                              <Icon icon={faToggleOn} />
                              <Text>Disable</Text>
                            </>
                          ) : (
                            <>
                              <Icon icon={faToggleOff} />
                              <Text>Enable</Text>
                            </>
                          )}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        onPress={() => this.deleteListItem(item)}
                        display={isOnlyRecommended(item) ? 'none' : 'flex'}
                      >
                        <HStack space={2} alignItems="center">
                          <Icon icon={faTrash} color="danger.700" />
                          <Text color="danger.700">Delete</Text>
                        </HStack>
                      </Menu.Item>
                    </Menu.Group>

                    <Menu.OptionGroup
                      title="Tags"
                      type="checkbox"
                      defaultValue={item.Tags ? item.Tags : []}
                      onChange={(value) => handleChangeTags(item, value)}
                    >
                      {[
                        ...new Set(
                          defaultTags.concat(item.Tags ? item.Tags : [])
                        )
                      ].map((tag) => (
                        <Menu.ItemOption key={tag} value={tag}>
                          {tag}
                        </Menu.ItemOption>
                      ))}
                      <Menu.ItemOption
                        key="newTag"
                        onPress={() => {
                          this.setState({
                            showModal: true,
                            modalType: 'Tag',
                            pendingItem: item
                          })
                        }}
                      >
                        New Tag...
                      </Menu.ItemOption>
                    </Menu.OptionGroup>
                  </Menu>
                </HStack>
              </Box>
            )}
            keyExtractor={(item) => item.URI}
          />

          <ModalConfirm
            type={this.state.modalType}
            onSubmit={(v) => handleSubmitNew(this.state.pendingItem, v)}
            onClose={() => this.setState({ showModal: false })}
            isOpen={this.state.showModal}
          />
        </Box>
      </>
    )
  }
}

DNSBlocklist.contextType = AlertContext
