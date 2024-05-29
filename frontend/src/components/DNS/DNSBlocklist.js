import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import PropTypes from 'prop-types'

import { blockAPI } from 'api/DNS'
import { AlertContext } from 'layouts/Admin'
import ModalConfirm from 'components/ModalConfirm'


import { Animated, Dimensions } from 'react-native'
import { TabView, SceneMap } from 'react-native-tab-view'
import { Box, View, Pressable } from '@gluestack-ui/themed'

import DNSOverride from 'views/DNS/DNSOverride'

import {
  Badge,
  BadgeIcon,
  Button,
  ButtonIcon,
  FlatList,
  HStack,
  Icon,
  Spinner,
  Text,
  VStack,
  BadgeText,
  Menu,
  MenuItem,
  MenuItemLabel,
  ThreeDotsIcon,
  useColorMode,
  CloseIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import { CircleIcon, TagIcon } from 'lucide-react-native'

const DNSBlocklist = ({ config, ...props }) => {
  const context = useContext(AlertContext)

  const [list, setList] = useState([])
  const [recommendedList, setRecommendedList] = useState([])
  const [blockedDomains, setBlockedDomains] = useState(0)
  const [pending, setPending] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')
  const [pendingItem, setPendingItem] = useState({})
  const [showURI, setShowURI] = useState(Platform.OS == 'web')

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

  const refreshMetrics = () => {
    blockAPI.metrics().then((metrics) => {
      setBlockedDomains(metrics.BlockedDomains)
    })
  }

  const refreshBlocklists = () => {
    let list = []

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
    const newList = list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    // only update the ui
    setList(newList)
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

  // trigger update on prop change
  useEffect(() => {
    refreshBlocklists()
  }, [config])

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
        info="Use tags to apply blocks to specific devices"
      >
        {props.renderHeader ? props.renderHeader() : null}
      </ListHeader>

      <FlatList
        data={[...list, ...recommendedList]}
        contentContainerStyle={{ paddingBottom: 64 }}
        renderItem={({ item }) => (
          <ListItem>
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
                      size="sm"
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

              {[...new Set(defaultTags.concat(item.Tags ? item.Tags : []))].map(
                (tag) => (
                  <MenuItem key={tag} textValue={tag}>
                    <CloseIcon mr="$2" />
                    <MenuItemLabel size="sm">{tag}</MenuItemLabel>
                  </MenuItem>
                )
              )}

              <MenuItem key="newTag" textValue="newTag">
                <Icon as={TagIcon} mr="$2" />
                <MenuItemLabel size="sm">New Tag...</MenuItemLabel>
              </MenuItem>
            </Menu>
          </ListItem>
        )}
        keyExtractor={(item) => item.URI}
      />

      <ModalConfirm
        type={modalType}
        onSubmit={(v) => handleSubmitNew(pendingItem, v)}
        onClose={() => setShowModal(false)}
        isOpen={showModal}
      />
    </>
  )
}

DNSBlocklist.propTypes = {
  renderHeader: PropTypes.func
}



const DNSBlocklistView = (props) => {
  const [index, setIndex] = useState(0) //1)
  const [routes] = useState([
    {
      key: 'first',
      title: 'DNS Blocklists',
    },
    {
      key: 'second',
      title: 'Overrides'
    },
  ])

  /*
  would be cool to bring back in icons for the tabs
  {
    path: 'dnsOverride',
    name: 'DNS Overrides',
    icon: ShuffleIcon,
    hideSimple: true,
    component: DNSOverride,
    layout: 'admin'
  },
  */

  const initialLayout = {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height
  }

  const renderScene = SceneMap({
    first: DNSBlocklist,
    second: DNSOverride,
  })

  const renderTabBar = (props) => {
    const inputRange = props.navigationState.routes.map((x, i) => i)
    return (
      <Box flexDirection="row">
        {props.navigationState.routes.map((route, i) => {
          const opacity = props.position.interpolate({
            inputRange,
            outputRange: inputRange.map((inputIndex) =>
              inputIndex === i ? 1 : 0.5
            )
          })

          const colorMode = useColorMode()
          const color =
            index === i
              ? colorMode == 'light'
                ? '#000'
                : '#e5e5e5'
              : colorMode == 'light'
              ? '#1f2937'
              : '#a1a1aa'
          const borderColor =
            index === i
              ? '$cyan500'
              : colorMode == 'light'
              ? '$coolGray200'
              : '$gray400'
          return (
            <Box
              key={route.title}
              borderBottomWidth={3}
              borderColor={borderColor}
              flex={1}
              alignItems="center"
              px="$2"
              py="$4"
              cursor="pointer"
            >
              {route.icon}
              <Pressable
                onPress={() => {
                  setIndex(i)
                }}
              >
                <Animated.Text
                  style={{
                    color
                  }}
                >
                  {route.title}
                </Animated.Text>
              </Pressable>
            </Box>
          )
        })}
      </Box>
    )
  }

  // also have the tabs
  let navbarHeight = 64
  let tabsHeight = 32
  let heightContent =
    Platform.OS == 'web'
      ? Dimensions.get('window').height - navbarHeight
      : '100%'

  if (Platform.OS == 'web') {
    return (
      <View h={heightContent}>
        <TabView
          navigationState={{
            index,
            routes
          }}
          renderScene={renderScene}
          renderTabBar={renderTabBar}
          onIndexChange={setIndex}
          initialLayout={initialLayout}
        />
      </View>
    )
  } else {
    return (
      <View>
        <DNSLog {...props}/>
      </View>
    )
  }
}

export default DNSBlocklistView
