import React, { useEffect, useRef, useState, useContext } from 'react'
import { Icon } from 'FontAwesomeUtils'
import { AlertContext } from 'AppContext'
import {
  faArrowRightLong,
  faEllipsis,
  faTag,
  faTrash
} from '@fortawesome/free-solid-svg-icons'

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
  VStack,
  Text,
  useColorMode,
  ThreeDotsIcon,
  ArrowRightIcon,
  AddIcon,
  TrashIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import { Menu } from 'native-base' //TODONB

//copied from Device.js, may want to move otu
const TagItem = React.memo(({ name }) => {
  let icon = faTag
  return (
    <Badge key={name} action="muted" variant="outline" size="sm">
      <Icon icon={icon} size={3} />
      <BadgeText>{name}</BadgeText>
    </Badge>
  )
})

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

  const trigger = (triggerProps) => (
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
        this.props.alertContext.error('Firewall API Failure', err.message)
      })
  }

  const moreMenu = (item) => (
    <Menu w={190} closeOnSelect={true} trigger={trigger}>
      <Menu.OptionGroup
        title="Tags"
        type="checkbox"
        defaultValue={item.Tags}
        onChange={(t) => handleTags(item, t, 'change')}
      >
        {[...new Set(item.Tags)].map((tag) => (
          <Menu.ItemOption key={tag} value={tag}>
            {tag}
          </Menu.ItemOption>
        ))}
        <Menu.ItemOption
          key="newTag"
          onPress={() => {
            setModalType('Tag')
            setShowModal(true)
          }}
        >
          New Tag...
        </Menu.ItemOption>
      </Menu.OptionGroup>
      <Menu.Group title="Actions">
        <Menu.Item onPress={() => deleteListItem(item)}>
          <HStack space={'md'} alignItems="center">
            <TrashIcon color="$red700" />
            <Text color="$red700">Delete</Text>
          </HStack>
        </Menu.Item>
      </Menu.Group>
    </Menu>
  )

  return (
    <>
      <ListHeader
        title="Endpoints"
        description="Describe Service Endpoints for building Firewall Rules"
      >
        <ModalForm
          title="Add Service Endpoint"
          triggerText="Add Service Endpoint"
          triggerProps={{
            display: { base: 'none', md: list.length ? 'flex' : 'none' }
          }}
          modalRef={refModal}
        >
          <AddEndpoint notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <Box>
        <FlatList
          data={list}
          renderItem={({ item }) => (
            <ListItem>
              <Text bold>{item.RuleName}</Text>

              <ArrowRightIcon color="$muted400" />

              <Box alignItems="center">
                <Badge action="muted" variant="outline">
                  <BadgeText>{item.Protocol}</BadgeText>
                </Badge>
              </Box>

              <HStack space="sm">
                <Text bold>
                  {item.Domain}
                  {item.IP}
                </Text>
                <Text color="$muted500">:</Text>
                <Text>{item.Port}</Text>
              </HStack>

              <Box
                sx={{
                  '@base': { display: 'none' },
                  '@md': { display: item.Tags?.length ? 'flex' : 'none' }
                }}
              >
                {item.Tags
                  ? item.Tags.map((tag) => <TagItem key={tag} name={tag} />)
                  : null}
              </Box>

              {moreMenu(item)}

              <ModalConfirm
                type={modalType}
                onSubmit={(t) => handleTags(item, [...item.Tags, t])}
                onClose={() => setShowModal(false)}
                isOpen={showModal}
              />
            </ListItem>
          )}
          keyExtractor={(item) => `${item.Protocol}${item.iP}:${item.Port}`}
        />

        <VStack>
          {!list.length ? (
            <Text px="$4" mb="$4" flexWrap="wrap">
              Service Endpoints serves as helpers for creating other firewall
              rules, as well as one-way connectivity from devices to the
              endpoint when they share a tag.
            </Text>
          ) : null}
          <Button
            sx={{ '@md': { display: list.length ? 'none' : 'flex' } }}
            action="primary"
            variant="solid"
            rounded="$none"
            onPress={() => refModal.current()}
          >
            <ButtonText>Add Endpoint</ButtonText>
            <ButtonIcon as={AddIcon} />
          </Button>
        </VStack>
      </Box>
    </>
  )
}

export default EndpointList
