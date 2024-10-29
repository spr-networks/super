import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import PropTypes from 'prop-types'

import { blockAPI } from 'api/DNS'
import { AlertContext, AppContext } from 'AppContext'
import ModalConfirm from 'components/ModalConfirm'

import {
  Badge,
  BadgeIcon,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Icon,
  Link,
  LinkIcon,
  Spinner,
  SectionList,
  Switch,
  Text,
  VStack,
  BadgeText,
  Menu,
  MenuItem,
  MenuItemLabel,
  ThreeDotsIcon,
  useColorMode,
  CloseIcon,
  ButtonGroup,
  ScrollView,
  Pressable,
  Box
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'
import {
  CircleIcon,
  TagIcon,
  ExternalLinkIcon,
  FolderPenIcon,
  ShieldIcon,
  ShieldEllipsisIcon,
  ShieldAlertIcon,
  ShieldOffIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  ShieldOff
} from 'lucide-react-native'

const ThreePointSlider = ({ value, onChange }) => {
  const colorMode = useColorMode()
  const [position, setPosition] = useState(value)

  const handlePress = () => {
    const nextPosition = position == 2 ? 1 : position == 1 ? 0 : 2
    setPosition(nextPosition)
    if (onChange) {
      onChange(nextPosition)
    }
  }

  const knobColor = () => {
    switch (position) {
      case 0:
        return '$primary400'
      case 1:
        return '$amber500'
      case 2:
        return '$blue500'
      default:
        return '$blue500'
    }
  }

  const getKnobPosition = () => {
    switch (position) {
      case 0:
        return { left: 8 }
      case 1:
        return { left: 28 }
      case 2:
        return { left: 48 }
      default:
        return { left: 48 }
    }
  }

  return (
    <Pressable onPress={handlePress}>
      <Box
        width={80}
        height={32}
        bg={colorMode == 'light' ? '$primary200' : '$primary800'}
        borderColor="$primary300" // Subtle border for definition
        borderRadius={16}
        position="relative"
        justifyContent="center"
      >
        {/* Track points */}
        <Box
          flexDirection="row"
          justifyContent="space-between"
          paddingHorizontal={12}
        >
          <Box
            width={8}
            height={8}
            borderRadius={4}
            backgroundColor="$gray400"
          />
          <Box
            width={8}
            height={8}
            borderRadius={4}
            backgroundColor="$gray400"
          />
          <Box
            width={8}
            height={8}
            borderRadius={4}
            backgroundColor="$gray400"
          />
        </Box>

        {/* Knob */}
        <Box
          position="absolute"
          {...getKnobPosition()}
          width={24}
          height={24}
          borderRadius={12}
          backgroundColor={knobColor()}
          shadowColor="$gray900"
          shadowOffset={{ width: 0, height: 2 }}
          shadowOpacity={0.25}
          shadowRadius={2}
          elevation={2}
        />
      </Box>
    </Pressable>
  )
}

const DNSBlocklist = ({ config, ...props }) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const isSimpleMode = appContext.isSimpleMode

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
      URI: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
      Category: 'ads'
    },
    {
      Info: 'BlockList Project Ads',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt',
      Category: 'ads'
    },
    {
      Info: 'BlockList Project Facebook',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/facebook.txt',
      Category: 'social'
    },
    {
      Info: 'BlockList Project Twitter, X',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/twitter.txt',
      Category: 'social'
    },
    {
      Info: 'BlockList Project TikTok',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/tiktok.txt',
      Category: 'social'
    },
    {
      Info: 'BlockList Project WhatsApp',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/whatsapp.txt',
      Category: 'social'
    },
    {
      Info: 'BlockList Project Youtube',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/youtube.txt',
      Category: 'social'
    },
    {
      Info: 'BlockList Project Fortnite',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/fortnite.txt',
      Category: 'gaming'
    },
    {
      Info: 'BlockList Project Malware',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt',
      Category: 'malware'
    },
    {
      Info: 'BlockList Project Pornography List',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt',
      Category: 'adult'
    },
    {
      Info: 'BlockList Project Gambling',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/gambling.txt',
      Category: 'gambling'
    },
    {
      Info: 'BlockList Project Redirect List, often used with spam',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/redirect.txt',
      Category: 'ads'
    },
    {
      Info: 'BlockList Project Tracker List for sites that track and gather visitor information',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/tracking.txt',
      Category: 'ads'
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
              if (!entry.Category) {
                entry.Category = rec.Catgeory
              }
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

  const handleItemSwitchDontBlock = (item, value) => {
    //if enabled - also enable this list
    if (value && !item.DontBlock && !item.Enabled) {
      item.Enabled = true
    }

    item.DontBlock = value

    const newList = list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.DontBlock = item.DontBlock
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

  const updateItemState = (item) => {
    const newList = list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.DontBlock = item.DontBlock
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

  const handleCategories = (item, category) => {
    item.Category = category

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
    if (modalType == 'Tag') {
      let tags = []
      if (item.Tags) {
        tags = item.Tags.concat(value)
      } else {
        tags = [value]
      }

      handleTags(item, tags)
    } else if (modalType == 'Category') {
      handleCategories(item, value.toLowerCase())
    }
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

  const niceSource = (uri) => {
    let m = uri.match(/https:\/\/raw\.githubusercontent\.com\/([A-Za-z]+)/)

    if (!m?.length) {
      return uri
    }

    return m[1].replace('blocklistproject', 'BlockList Project') || uri
  }

  const niceTitle = (title) => {
    if (title == 'BlockList Project Ads') {
      return title
    }

    return title.replace('BlockList Project ', '')
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

  const ListItemIcon = ({ item, ...props }) => {
    let label = 'Block disabled'

    if (item.Enabled) {
      label = item.DontBlock ? 'Only categorize traffic' : 'Blocked'
    }

    return (
      <Tooltip label={label}>
        {!item.Enabled ? (
          <Icon size="xl" as={ShieldOffIcon} mr="$2" color={'$muted400'} />
        ) : (
          <Icon
            size="xl"
            as={item.DontBlock ? ShieldEllipsisIcon : ShieldCheckIcon}
            mr="$2"
            color={item.DontBlock ? '$amber500' : '$green500'}
          />
        )}
      </Tooltip>
    )
  }

  const ListItemCategory = ({ item, ...props }) => {
    if (!item.Category) {
      return <></>
    }

    return (
      <Badge
        key={item.Category}
        action="muted"
        variant="outline"
        size="sm"
        {...props}
      >
        <BadgeText textTransform="capitalize" isTruncated>
          {item.Category}
        </BadgeText>
      </Badge>
    )
  }

  const sortListItems = (a, b) => {
    return a.Category - b.Category
  }

  let listAll = [...list, ...recommendedList].sort(sortListItems)

  let categories = [
    ...new Set(listAll.map((l) => l.Category).filter((c) => c?.length))
  ]

  const listsByCategory = (category) => {
    return listAll.filter((l) => l.Category == category)
  }

  const handleCategorySwitch = (category, v) => {
    let lists = listsByCategory(category)
    if (!lists?.length) {
      return
    }

    const nextState = v

    //state 0
    let Enabled = false
    let DontBlock = false

    if (nextState == 1) {
      Enabled = true
      DontBlock = true
    } else if (nextState == 2) {
      Enabled = true
      DontBlock = false
    }
    lists.map((item) => {
      item.Enabled = Enabled
      item.DontBlock = DontBlock
      updateItemState(item)
    })
  }

  const categoryBlockState = (name) => {
    //returns 0, 1, or 2
    // 0 -> not blocked
    // 1 -> observed
    // 2 -> blocked

    let dontBlock = listsByCategory(name)[0].DontBlock

    if (
      listsByCategory(name).filter((item) => item.Enabled).length ==
      listsByCategory(name).length
    ) {
      if (dontBlock) {
        return 1
      }
      return 2
    }

    return 0
  }

  const textFromCategory = (name) => {
    let state = categoryBlockState(name)
    return state == 0 ? 'Allowed' : state == 1 ? 'Observe Only' : 'Blocked'
  }

  const tooltipFromCategory = (name) => {
    let state = categoryBlockState(name)
    if (state == 0) {
      return 'DNS Domains Allowed'
    } else if (state == 1) {
      return 'Observe and log the DNS Category, Allow Traffic'
    } else if (state == 2) {
      return 'DNS Domains Blocked'
    }
  }

  let sections = []
  categories.map((name) => {
    let data = listsByCategory(name)
    sections.push({ name, data })
  })

  const simpleView = (
    <VStack
      p="$2"
      flexWrap="wrap"
      sx={{
        '@md': {
          px: 0,
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          gap: '$4'
        }
      }}
    >
      {sections.map(({ name, data }) => (
        <VStack
          w="$full"
          sx={{
            '@md': { width: 360 }
          }}
          p="$4"
          space="md"
          bg={
            colorMode == 'light'
              ? '$backgroundCardLight'
              : '$backgroundCardDark'
          }
          borderRadius={10}
        >
          <HStack space="md" alignItems="center">
            <HStack space="xs" flex={1}>
              <ListItemIcon item={listsByCategory(name)[0]} />
              <Text bold textTransform="capitalize">
                {name || 'Other'}
              </Text>
            </HStack>
            <ThreePointSlider
              value={categoryBlockState(name)}
              onChange={(v) => handleCategorySwitch(name, v)}
            />
          </HStack>
          <HStack space="md" alignItems="center" justifyContent="space-between">
            <Text size="sm" italic></Text>
            <Tooltip label={tooltipFromCategory(name)}>
              <HStack space="xs" alignItems="center">
                {/*<Icon size="xs" as={ShieldEllipsisIcon} />*/}
                <Text size="xs" italic opacity={0.6}>
                  {textFromCategory(name)}
                </Text>
              </HStack>
            </Tooltip>
          </HStack>
        </VStack>
      ))}
    </VStack>
  )

  return (
    <ScrollView pb="$20">
      {simpleView}
      {!isSimpleMode && (
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
            data={listAll}
            contentContainerStyle={{ paddingBottom: 64 }}
            renderItem={({ item }) => (
              <ListItem>
                <ListItemIcon item={item} />

                <VStack
                  w="$4/6"
                  _sx={{
                    '@md': { width: '$3/4' }
                  }}
                  onPress={toggleShowURI}
                  opacity={isOnlyRecommended(item) ? 0.6 : 1}
                >
                  <Text size="sm" bold flexWrap="wrap">
                    {niceTitle(item.Info)}
                  </Text>
                  <Link isExternal href={item.URI}>
                    <HStack space="xs" alignItems="center">
                      <Text size="sm" isTruncated>
                        {niceSource(item.URI)}
                      </Text>

                      <Icon as={ExternalLinkIcon} color="$muted500" size="xs" />
                    </HStack>
                  </Link>
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

                  <ListItemCategory item={item} />
                </HStack>

                <Menu
                  trigger={trigger}
                  selectionMode="single"
                  onSelectionChange={(e) => {
                    let key = e.currentKey
                    if (key == 'onoff') {
                      handleItemSwitch(item, !item.Enabled)
                    } else if (key == 'dontblock') {
                      handleItemSwitchDontBlock(item, !item.DontBlock)
                    } else if (key == 'deleteItem') {
                      deleteListItem(item)
                    } else if (key == 'newTag') {
                      setModalType('Tag')
                      setPendingItem(item)
                      setShowModal(true)
                    } else if (key == 'newCategory') {
                      setModalType('Category')
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

                  <MenuItem key="newCategory" textValue="newCategory">
                    <Icon as={FolderPenIcon} mr="$2" />
                    <MenuItemLabel size="sm">Set Category...</MenuItemLabel>
                  </MenuItem>

                  <MenuItem key="dontblock" textValue="dontblock">
                    <Icon
                      as={item.DontBlock ? ShieldXIcon : ShieldCheckIcon}
                      mr="$2"
                    />
                    <MenuItemLabel size="sm">
                      {item.DontBlock ? 'Enable Blocking' : 'Observe Only'}
                    </MenuItemLabel>
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
      )}
    </ScrollView>
  )
}

DNSBlocklist.propTypes = {
  renderHeader: PropTypes.func
}

export default DNSBlocklist
