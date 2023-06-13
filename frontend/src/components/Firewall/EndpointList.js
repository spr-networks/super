import React, { useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faArrowRightLong,
  faCircleNodes,
  faCirclePlus,
  faEllipsis,
  faPlus,
  faTag,
  faTrash
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI, deviceAPI } from 'api'
import ModalForm from 'components/ModalForm'
import ModalConfirm from 'components/ModalConfirm'
import AddEndpoint from './AddEndpoint'

import {
  Badge,
  Button,
  Box,
  FlatList,
  Heading,
  IconButton,
  Menu,
  Stack,
  HStack,
  VStack,
  Text,
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

//copied from Device.js, may want to move otu
const TagItem = React.memo(({ name }) => {
  let icon = faTag
  return (
    <Badge
      key={name}
      variant="outline"
      colorScheme={useColorModeValue('muted', 'blueGray')}
      leftIcon={<Icon icon={icon} size={3} />}
      rounded="sm"
      size="sm"
      py={1}
      px={2}
    >
      {name}
    </Badge>
  )
})

const EndpointList = (props) => {
  const [list, setList] = useState([])

  const refreshList = () => {
    firewallAPI.config().then((config) => {
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
    firewallAPI.deleteEndpoint(item).then((res) => {
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
    <IconButton
      variant="unstyled"
      ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}>
    </IconButton>
  )

  const defaultTags = []

  const handleTags = (item, tags) => {
    console.log("tags = " + tags)
    console.log("item.Tags = " + item.Tags)
    if (tags == null) {
      tags = []
    }

    let newTags =[...new Set((tags.filter((x) => typeof x == "string" && x.length > 0)))]
    item.Tags = newTags
    console.log("newTags " + newTags)

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
          <HStack space={2} alignItems="center">
            <Icon icon={faTrash} color="danger.700" />
            <Text color="danger.700">Delete</Text>
          </HStack>
        </Menu.Item>
      </Menu.Group>
    </Menu>
  )

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW="60%">
          <Heading fontSize="md">Endpoints</Heading>
          <Text color="muted.500" isTruncated>
            Describe Service Endpoints for building Firewall Rules
          </Text>
        </VStack>
        <ModalForm
          title="Add Service Endpoint"
          triggerText="Add Service Endpoint"
          modalRef={refModal}
        >
          <AddEndpoint notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

      <Box px={4} mb={4}>
        <FlatList
          data={list}
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
                space={3}
                justifyContent="space-between"
                alignItems="center"
              >
                <HStack space={1}>
                  <Text bold>
                    {item.RuleName}
                  </Text>
                </HStack>

                <Icon color="muted.400" icon={faArrowRightLong} />

                <Badge variant="outline">{item.Protocol}</Badge>

                <HStack space={1}>
                  <Text bold>
                    {item.Domain}
                    {item.IP}
                  </Text>
                  <Text color="muted.500">:</Text>
                  <Text>{item.Port}</Text>
                </HStack>

                {item.Tags.map((tag) => (
                  <TagItem key={tag} name={tag} />
                ))}

                {moreMenu(item)}
              </HStack>

              <ModalConfirm
                type={modalType}
                onSubmit={(t) => handleTags(item, [...item.Tags, t])}
                onClose={() => setShowModal(false)}
                isOpen={showModal}
              />
            </Box>
          )}
          keyExtractor={(item) =>
            `${item.Protocol}${item.iP}:${item.Port}`
          }
        />

        <VStack>
          {!list.length ? (
            <Text alignSelf={'center'}>
              There are no endpoints defined yet
            </Text>
          ) : null}
          <Button
            display={{ base: 'flex', md: list.length ? 'none' : 'flex' }}
            variant={useColorModeValue('subtle', 'solid')}
            colorScheme="muted"
            leftIcon={<Icon icon={faCirclePlus} />}
            onPress={() => refModal.current()}
            mt={4}
          >
            Add Endpoint
          </Button>
        </VStack>
      </Box>
    </>
  )
}

export default EndpointList
