import React from 'react'
import { Dimensions, Platform } from 'react-native'
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
  Button,
  FlatList,
  Heading,
  IconButton,
  Menu,
  Stack,
  HStack,
  Spinner,
  Text,
  VStack,
  useColorModeValue
} from 'native-base'

import InputSelect from 'components/InputSelect'

import { FlashList } from '@shopify/flash-list'

export default class DNSBlocklist extends React.Component {
  state = {
    list: [],
    blockedDomains: 0,
    pending: false,
    showModal: false,
    modalType: '',
    pendingItem: {},
    showURI: true,
    seconds: 'Weekly',
  }

  constructor(props) {
    super(props)

    this.state.showURI = Platform.OS == 'web'
    this.state.list = []

    this.recommendedListDefault = [
      {
        Info: 'Steven Black\'s Adware & Malware block list',
        URI: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts'
      },
      {
        Info: 'BlockList Project Ads',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt'
      },
      {
        Info: 'BlockList Project Facebook and related services',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/facebook.txt'
      },
      {
        Info: 'BlockList Project Twitter and related services',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/twitter.txt'
      },
      {
        Info: 'BlockList Project Malware List',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt'
      },
      {
        Info: 'BlockList Project Pornography List',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt'
      },
      {
        Info: 'BlockList Project Redirect List, often used with spam',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/redirect.txt'
      },
      {
        Info: 'BlockList Project Tracker List for sites that track and gather visitor information',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/tracking.txt'
      },
      {
        Info: 'BlockList Project Youtube domains',
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/youtube.txt'
      },
      {
        Info: 'BlockList Project Everything list',
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

    const optMap = {
      'Weekly': 24*7*60*60,
      'Daily': 24*60*60,
      'Four Hours': 24*60*60*4,
      'Hourly': 60*60
    }

    blockAPI
      .config()
      .then((config) => {
        if (config != null) {
          if (config.RefreshSeconds != 0) {
            for (let opt of Object.keys(optMap)) {
              if (optMap[opt] == config.RefreshSeconds) {
                this.setState({seconds: opt})
              }
            }
          }
        }
      })

    blockAPI
      .blocklists()
      .then((blocklist) => {
        if (blocklist != null) {
          list = blocklist
        }

        let recommendedList = this.recommendedListDefault.filter((_item) => {
          return !list.map((listitem) => listitem.URI).includes(_item.URI)
        })

        //for every entry in list see if theres an annotation from rec default to set
        for (let entry of list) {
          for (let rec of this.recommendedListDefault) {
            if (entry.URI == rec.URI) {
              entry.Info = rec.Info
            }
          }
        }

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

    const niceURI = (uri) => {
      if (this.state.showURI) {
        return uri
      }

      return uri
        .replace(
          /https:\/\/raw\.githubusercontent\.com\/([A-Za-z]+)?(\/([A-Za-z]+)\/master\/)?/,
          ''
        )
        .replace(/\.txt$/, '')
    }

    const toggleShowURI = (e) => {
      this.setState({ showURI: !this.state.showURI })
    }

    const onChangeText = (what, value) => {
      if (what == 'seconds') {
        this.setState({seconds: value})
      }
    }

    const submitRefresh = (value) => {

      const optMap = {
        'Weekly': 24*7*60*60,
        'Daily': 24*60*60,
        'Four Hours': 24*60*60*4,
        'Hourly': 60*60
      }

      blockAPI.setRefresh(optMap[value]).then(
        () => {
          this.context.success('Updated DNS Blocklist Refresh Frequency')
        },
        (e) => {
          this.context.error('API Failure: ' + e.message)
        }
      )
    }


    const options = [
      { label: 'Weekly', value: 'Weekly' },
      { label: 'Daily', value: 'Daily' },
      { label: 'Four Hours', value: 'Four Hours' },
      { label: 'Hourly', value: 'Hourly'}
    ] //[{ label: t, value: { Tag: t } }]

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

        <Box px={{ md: 4 }} mb={4}>
          <FlatList
            data={[...this.state.list, ...this.state.recommendedList]}
            renderItem={({ item }) => (
              <Box
                bg="backgroundCardLight"
                borderBottomWidth={1}
                _dark={{
                  bg: 'backgroundCardDark',
                  borderColor: 'borderColorCardDark'
                }}
                borderColor="borderColorCardLight"
                p={4}
              >
                <HStack
                  space={2}
                  justifyContent="space-between"
                  alignItems="center"
                >
                <VStack
                  w={{ base: '60%', md: '75%' }}
                  flexWrap="wrap"
                  onPress={toggleShowURI}
                  >
                    <Text color="muted.500" isTruncated>
                      {item.Info}
                    </Text>
                    <Text
                    _light={{
                      color: isOnlyRecommended(item) ? 'muted.500' : 'black'
                    }}
                    _dark={{
                      color: isOnlyRecommended(item) ? 'muted.500' : 'white'
                    }}
                    >
                      {niceURI(item.URI)}
                    </Text>
                  </VStack>

                  <Stack
                    flex={2}
                    space={{ base: 1, md: 1 }}
                    alignSelf="center"
                    alignItems={{ base: 'flex-end', md: 'center' }}
                    direction={{ base: 'column', md: 'row' }}
                  >
                    {item.Enabled ? (
                      <Badge
                        variant="outline"
                        colorScheme="success"
                        color="success.500"
                      >
                        Enabled
                      </Badge>
                    ) : null}

                    {item.Tags
                      ? item.Tags.map((entry) => (
                          <Badge key={item.URI + entry} variant="outline">
                            {entry}
                          </Badge>
                        ))
                      : null}
                  </Stack>

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

          <Box
            bg="backgroundCardLight"
            borderWidth={1}
            _dark={{
              bg: 'backgroundCardDark',
              borderColor: 'borderColorCardDark'
            }}
            borderColor="borderColorCardLight"
            p={4}
          >
            <VStack width={{ base: '100%', md: '75%' }}>
              <Box
              >
                <VStack space={4}>
                  <Text bold>Refresh Frequency</Text>
                  <InputSelect
                    options={options}
                    value={this.state.seconds}
                    onChange={(v) => onChangeText('seconds', v)}
                    onChangeText={(v) => onChangeText('seconds', v)}
                  />
                </VStack>
              </Box>
              <Button colorScheme="primary" rounded="none" onPress={submitRefresh}>
                Save
              </Button>
            </VStack>
          </Box>

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
