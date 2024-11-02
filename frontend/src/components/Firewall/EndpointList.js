import React, { useEffect, useRef, useState, useContext } from 'react'
import { AlertContext } from 'AppContext'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import ModalConfirm from 'components/ModalConfirm'
import AddEndpoint from './AddEndpoint'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  Box,
  FlatList,
  HStack,
  Icon,
  VStack,
  Text,
  ThreeDotsIcon,
  ArrowRightIcon,
  AddIcon,
  TrashIcon,
  Menu,
  MenuItem,
  MenuItemLabel,
  CloseIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import TagItem from 'components/TagItem'
import { TagIcon } from 'lucide-react-native'

const EndpointList = (props) => {
  const [list, setList] = useState([])
  let context = useContext(AlertContext)

  const refreshList = () => {
    firewallAPI
      .config()
      .then((config) => {
        let flist = config.Endpoints
        if (flist != null) {
          setList(flist)
        }
      })
      .catch((error) =>
        context.error('[API] firewall Endpoints error: ' + error.message)
      )
  }

  const deleteListItem = (item) => {
    firewallAPI
      .deleteEndpoint(item)
      .then((res) => {
        refreshList()
      })
      .catch((error) =>
        context.error('[API] deleteEndpoint error: ' + error.message)
      )
  }

  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')

  useEffect(() => {
    refreshList()
  }, [])

  let refModal = useRef(null)

  const notifyChange = (type) => {
    refModal.current()
    refreshList()
  }

  const trigger = ({ ...triggerProps }) => (
    <Button variant="link" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
    </Button>
  )

  const defaultTags = []

  const handleTags = (item, tags) => {
    if (tags == null) {
      tags = []
    }

    let newTags = [
      ...new Set(tags.filter((x) => typeof x == 'string' && x.length > 0))
    ]

    newTags = newTags.map((tag) => tag.toLowerCase())

    item.Tags = newTags

    firewallAPI
      .addEndpoint(item)
      .then((res) => {
        refreshList()
      })
      .catch((err) => {
        context.error('Firewall API Failure', err.message)
      })
  }

  const moreMenu = (item) => (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={(e) => {
        let key = e.currentKey
        if (key == 'newTag') {
          setModalType('Tag')
          setShowModal(true)
        } else if (key == 'deleteItem') {
          deleteListItem(item)
        } else {
          // its a tag
          let tags = item.Tags.filter((t) => t != key)
          handleTags(item, tags)
        }
      }}
    >
      {[...new Set(item?.Tags)].map((tag) => (
        <MenuItem key={tag} textValue={tag}>
          <CloseIcon mr="$2" />
          <MenuItemLabel size="sm">{tag}</MenuItemLabel>
        </MenuItem>
      ))}
      <MenuItem key="newTag" textValue="newTag">
        <Icon as={TagIcon} mr="$2" />
        <MenuItemLabel size="sm">New Tag...</MenuItemLabel>
      </MenuItem>
      <MenuItem key="deleteItem" textValue="deleteItem">
        <TrashIcon color="$red700" mr="$2" />
        <MenuItemLabel size="sm" color="$red700">
          Delete
        </MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  return (
    <VStack>
      <ListHeader
        title="Endpoints"
        description="Describe Service Endpoints for building One-Way Firewall Rules and short names"
      >
        <ModalForm
          title="Add Service Endpoint"
          triggerText="Add Service Endpoint"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: list.length ? 'flex' : 'flex' }
            }
          }}
          modalRef={refModal}
        >
          <AddEndpoint notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <ListItem>
            <Badge action="muted" variant="outline">
              <BadgeText>{item.Protocol}</BadgeText>
            </Badge>

            <Text bold>{item.RuleName}</Text>

            <ArrowRightIcon color="$muted400" />

            <HStack space="sm">
              <Text size="sm" bold>
                {item.Domain}
                {item.IP}
              </Text>
              <Text size="sm" color="$muted500">
                :
              </Text>
              <Text size="sm">{item.Port}</Text>
            </HStack>

            <VStack
              sx={{
                '@base': { display: 'none' },
                '@md': { display: item.Tags?.length ? 'flex' : 'none' }
              }}
              space="xs"
            >
              {item.Tags
                ? item.Tags.map((tag) => <TagItem key={tag} name={tag} />)
                : null}
            </VStack>

            {moreMenu(item)}

            <ModalConfirm
              type={modalType}
              onSubmit={(t) => handleTags(item, [...(item?.Tags || []), t])}
              onClose={() => setShowModal(false)}
              isOpen={showModal}
            />
          </ListItem>
        )}
        keyExtractor={(item) => `${item.Protocol}${item.iP}:${item.Port}`}
      />

      {!list.length ? (
        <Text
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
          p="$4"
          flexWrap="wrap"
        >
          Service Endpoints serves as helpers for creating other firewall rules,
          as well as one-way connectivity from devices to the endpoint when they
          share a tag.
        </Text>
      ) : null}
      <Button
        sx={{ '@md': { display: list.length ? 'none' : 'none' } }}
        action="primary"
        variant="solid"
        rounded="$none"
        onPress={() => refModal.current()}
      >
        <ButtonText>Add Endpoint</ButtonText>
        <ButtonIcon as={AddIcon} />
      </Button>
    </VStack>
  )
}

export default EndpointList
