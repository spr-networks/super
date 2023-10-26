import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { blockAPI } from 'api/DNS'
import DNSAddBlocklist from 'components/DNS/DNSAddBlocklist'
import ModalForm from 'components/ModalForm'
import { AlertContext } from 'layouts/Admin'
import ModalConfirm from 'components/ModalConfirm'

import {
  Badge,
  BadgeIcon,
  Button,
  ButtonIcon,
  Box,
  FlatList,
  HStack,
  Icon,
  Spinner,
  Text,
  VStack,
  BadgeText,
  ButtonText,
  Menu,
  MenuItem,
  MenuItemLabel,
  ThreeDotsIcon,
  useColorMode,
  CloseIcon
} from '@gluestack-ui/themed'

import InputSelect from 'components/InputSelect'
import ListHeader from 'components/List/ListHeader'
import {
  CircleIcon,
  TagIcon,
  ToggleLeftIcon,
  ToggleRightIcon
} from 'lucide-react-native'

const DNSBlocklist = (props) => {
  const context = useContext(AlertContext)

  const [list, setList] = useState([])
  const [recommendedList, setRecommendedList] = useState([])
  const [blockedDomains, setBlockedDomains] = useState(0)
  const [pending, setPending] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')
  const [pendingItem, setPendingItem] = useState({})
  const [showURI, setShowURI] = useState(Platform.OS == 'web')
  const [seconds, setSeconds] = useState('Weekly')

  let recommendedListDefault = [
    {
      Info: "Steven Black's Adware & Malware block list",
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

  let refAddBlocklistModal = React.createRef()

  const refreshMetrics = () => {
    blockAPI.metrics().then((metrics) => {
      setBlockedDomains(metrics.BlockedDomains)
    })
  }

  const refreshBlocklists = () => {
    let list = []

    const optMap = {
      Weekly: 24 * 7 * 60 * 60,
      Daily: 24 * 60 * 60,
      'Four Hours': 24 * 60 * 60 * 4,
      Hourly: 60 * 60
    }

    blockAPI.config().then((config) => {
      if (config != null) {
        if (config.RefreshSeconds != 0) {
          for (let opt of Object.keys(optMap)) {
            if (optMap[opt] == config.RefreshSeconds) {
              setSeconds(opt)
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

        let recommendedList = recommendedListDefault.filter((_item) => {
          return !list.map((listitem) => listitem.URI).includes(_item.URI)
        })

        //for every entry in list see if theres an annotation from rec default to set
        for (let entry of list) {
          for (let rec of recommendedListDefault) {
            if (entry.URI == rec.URI) {
              entry.Info = rec.Info
            }
          }
        }

        setList(list)
        setPending(false)
        setRecommendedList(recommendedList)
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  const notifyChange = (type) => {
    setPending(false)
    refreshBlocklists()
  }

  const handleItemSwitch = (item, value) => {
    item.Enabled = value
    const list = list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    // only update the ui
    setList(list)
    setPending(true)

    blockAPI
      .putBlocklist(item)
      .then((res) => {
        notifyChange('blocklists')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  const deleteListItem = (item) => {
    if (pending) {
      return context.error('Wait for pending updates to finish')
    }

    setPending(true)

    blockAPI
      .deleteBlocklist(item)
      .then((res) => {
        notifyChange('blocklists')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  const handleTags = (item, tags) => {
    if (tags != null) {
      tags = tags.filter((v) => typeof v === 'string')
      tags = [...new Set(tags)]
    }

    item.Tags = tags

    blockAPI
      .putBlocklist(item)
      .then((res) => {
        notifyChange('blocklists')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  useEffect(() => {
    refreshBlocklists()
    refreshMetrics()
  }, [])

  const notifyChangeBlocklist = async () => {
    notifyChange()
    // close modal when added
    refAddBlocklistModal.current()
  }

  const handleChangeTags = (item, tags) => {
    return handleTags(item, tags)
  }

  const handleSubmitNew = (item, value) => {
    let tags = []
    if (item.Tags) {
      tags = item.Tags.concat(value)
    } else {
      tags = [value]
    }

    handleTags(item, tags)
  }

  const defaultTags = props.tags || []

  let trigger = (triggerProps) => (
    <Button action="secondary" variant="link" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} />
    </Button>
  )

  // only show actions if we have the list
  const isOnlyRecommended = (item) => {
    return list.filter((_item) => _item.URI === item.URI).length === 0
  }

  const niceURI = (uri) => {
    if (showURI) {
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
    setShowURI(!showURI)
  }

  const onChangeText = (what, value) => {
    if (what == 'seconds') {
      setSeconds(value)
    }
  }

  const submitRefresh = (value) => {
    const optMap = {
      Weekly: 24 * 7 * 60 * 60,
      Daily: 24 * 60 * 60,
      'Four Hours': 24 * 60 * 60 * 4,
      Hourly: 60 * 60
    }

    blockAPI.setRefresh(optMap[value]).then(
      () => {
        context.success('Updated DNS Blocklist Refresh Frequency')
      },
      (e) => {
        context.error('API Failure: ' + e.message)
      }
    )
  }

  const options = [
    { label: 'Weekly', value: 'Weekly' },
    { label: 'Daily', value: 'Daily' },
    { label: 'Four Hours', value: 'Four Hours' },
    { label: 'Hourly', value: 'Hourly' }
  ] //[{ label: t, value: { Tag: t } }]

  const colorMode = useColorMode()

  /*
   <HStack space="sm">
              <Spinner accessibilityLabel="Loading lists" />
              <Text color="$muted500">Update running...</Text>
            </HStack>
   */

  return (
    <>
      <ListHeader
        title="DNS Blocklists"
        description={
          !pending
            ? `${blockedDomains.toLocaleString()} blocked domains`
            : 'Update running...'
        }
      >
        {!pending ? (
          <ModalForm
            title="Add DNS Blocklist"
            triggerText="Add List"
            triggerClass="pull-right"
            modalRef={refAddBlocklistModal}
          >
            <DNSAddBlocklist notifyChange={notifyChangeBlocklist} />
          </ModalForm>
        ) : null}
      </ListHeader>

      <VStack space="md" mb="$4">
        <FlatList
          data={[...list, ...recommendedList]}
          renderItem={({ item }) => (
            <Box
              bg={
                colorMode == 'light'
                  ? '$backgroundCardLight'
                  : '$backgroundCardDark'
              }
              borderBottomWidth={1}
              borderColor={
                colorMode == 'light'
                  ? '$borderColorCardLight'
                  : '$borderColorCardDark'
              }
              p="$4"
            >
              <HStack
                space="md"
                justifyContent="space-between"
                alignItems="center"
              >
                <VStack
                  w="$4/6"
                  _sx={{
                    '@md': { width: '$3/4' }
                  }}
                  onPress={toggleShowURI}
                >
                  <Text size="sm" bold flexWrap="wrap">
                    {item.Info}
                  </Text>
                  <Text
                    size="sm"
                    color={
                      isOnlyRecommended(item)
                        ? '$muted500'
                        : colorMode == 'light'
                        ? '$black'
                        : '$white'
                    }
                    isTruncated
                  >
                    {niceURI(item.URI)}
                  </Text>
                </VStack>

                <HStack
                  flex={2}
                  space="md"
                  alignSelf="center"
                  sx={{
                    '@base': {
                      flexDirection: 'column',
                      alignItems: 'flex-end'
                    },
                    '@md': {
                      flexDirection: 'row',
                      alignItems: 'center'
                    }
                  }}
                >
                  {item.Enabled ? (
                    <Badge size="sm" action="success" variant="outline">
                      <BadgeText>Enabled</BadgeText>
                    </Badge>
                  ) : null}

                  {item.Tags
                    ? item.Tags.map((entry) => (
                        <Badge
                          key={item.URI + entry}
                          action="muted"
                          variant="outline"
                        >
                          <BadgeText>{entry}</BadgeText>
                          <BadgeIcon as={TagIcon} ml="$1" />
                        </Badge>
                      ))
                    : null}
                </HStack>

                <Menu
                  trigger={trigger}
                  selectionMode="single"
                  onSelectionChange={(e) => {
                    let key = e.currentKey
                    if (key == 'onoff') {
                      handleItemSwitch(item, !item.Enabled)
                    } else if (key == 'deleteItem') {
                      deleteListItem(item)
                    } else if (key == 'newTag') {
                      setModalType('Tag')
                      setPendingItem(item)
                      setShowModal(true)
                    } else {
                      let tags = item.Tags.filter((t) => t != key)
                      handleChangeTags(item, tags)
                    }
                  }}
                >
                  <MenuItem key="onoff" textValue="onoff">
                    <Icon as={item.Enabled ? CircleIcon : CircleIcon} mr="$2" />
                    <MenuItemLabel size="sm">
                      {item.Enabled ? 'Disable' : 'Enable'}
                    </MenuItemLabel>
                  </MenuItem>

                  <MenuItem
                    key="deleteItem"
                    textValue="deleteItem"
                    display={isOnlyRecommended(item) ? 'none' : 'flex'}
                  >
                    <CloseIcon color="$red700" mr="$2" />
                    <MenuItemLabel size="sm" color="$red700">
                      Delete
                    </MenuItemLabel>
                  </MenuItem>

                  {[
                    ...new Set(defaultTags.concat(item.Tags ? item.Tags : []))
                  ].map((tag) => (
                    <MenuItem key={tag} textValue={tag}>
                      <CloseIcon mr="$2" />
                      <MenuItemLabel size="sm">{tag}</MenuItemLabel>
                    </MenuItem>
                  ))}

                  <MenuItem key="newTag" textValue="newTag">
                    <Icon as={TagIcon} mr="$2" />
                    <MenuItemLabel size="sm">New Tag...</MenuItemLabel>
                  </MenuItem>
                </Menu>
              </HStack>
            </Box>
          )}
          keyExtractor={(item) => item.URI}
        />

        <Box
          bg={
            colorMode == 'light'
              ? '$backgroundCardLight'
              : '$backgroundCardDark'
          }
          p="$4"
          w="$full"
          sx={{ '@md': { width: '$1/2' } }}
        >
          <VStack space="md">
            <Text bold>Refresh Frequency</Text>
            <InputSelect
              options={options}
              value={seconds}
              onChange={(v) => onChangeText('seconds', v)}
              onChangeText={(v) => onChangeText('seconds', v)}
            />
            <Button action="primary" onPress={() => submitRefresh(seconds)}>
              <ButtonText>Save</ButtonText>
            </Button>
          </VStack>
        </Box>

        <ModalConfirm
          type={modalType}
          onSubmit={(v) => handleSubmitNew(pendingItem, v)}
          onClose={() => setShowModal(false)}
          isOpen={showModal}
        />
      </VStack>
    </>
  )
}
export default DNSBlocklist
