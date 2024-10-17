import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import PropTypes from 'prop-types'

import { blockAPI } from 'api/DNS'
import { AlertContext } from 'layouts/Admin'
import ModalConfirm from 'components/ModalConfirm'

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
import { CircleIcon, TagIcon, FolderPenIcon } from 'lucide-react-native'

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
      URI: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
      Categories: ['ads']
    },
    {
      Info: 'BlockList Project Ads',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt',
      Categories: ['ads']
    },
    {
      Info: 'BlockList Project Facebook and related services',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/facebook.txt',
      Categories: ['social']
    },
    {
      Info: 'BlockList Project Twitter and related services',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/twitter.txt',
      Categories: ['social']
    },
    {
      Info: 'BlockList Project Malware List',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt',
      Categories: ['social']
    },
    {
      Info: 'BlockList Project Pornography List',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt',
      Categories: ['adult']
    },
    {
      Info: 'BlockList Project Redirect List, often used with spam',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/redirect.txt',
      Categories: ['ads']
    },
    {
      Info: 'BlockList Project Tracker List for sites that track and gather visitor information',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/tracking.txt',
      Categories: ['ads']
    },
    {
      Info: 'BlockList Project Youtube domains',
      URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/youtube.txt',
      Categories: ['social']
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
              if (!entry.Categories) {
                entry.Categories = rec.Categories
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
    item.DontBlock = value

    const newList = list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.DontBlock = item.DontBlock
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

  const handleCategories = (item, categories) => {
    if (categories != null) {
      categories = categories.filter((v) => typeof v === 'string')
      categories = [...new Set(categories)]
    }

    item.Categories = categories

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
      let categories = [value]
      handleCategories(item, categories)
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


              {item.Categories
                ? item.Categories.map((entry) => (
                    <Badge
                      key={item.URI + entry}
                      action="muted"
                      variant="outline"
                      size="sm"
                    >
                      <BadgeText>{entry}</BadgeText>
                      <BadgeIcon as={FolderPenIcon} ml="$1" />
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
                }
                else if (key == 'dontblock') {
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

              <MenuItem key="newCategory" textValue="newCategory">
                <Icon as={FolderPenIcon} mr="$2" />
                <MenuItemLabel size="sm">Set Category...</MenuItemLabel>
              </MenuItem>

              <MenuItem key="dontblock" textValue="dontblock">
                <Icon as={item.Enabled ? CircleIcon : CircleIcon} mr="$2" />
                <MenuItemLabel size="sm">
                  {item.Enabled ? 'Categorize Only, No Blocking' : 'Blocking Enabled'}
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
  )
}

DNSBlocklist.propTypes = {
  renderHeader: PropTypes.func
}

export default DNSBlocklist
