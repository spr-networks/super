import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'

import Icon from 'FontAwesomeUtils'
import {
  faEllipsis,
  faTrash,
  faToggleOn,
  faToggleOff,
  faBellSlash,
  faBell
} from '@fortawesome/free-solid-svg-icons'
import {
  Box,
  Heading,
  HStack,
  IconButton,
  Menu,
  View,
  Stack,
  Text,
  useColorModeValue,
  Button
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

import { notificationsAPI } from 'api'
import AddNotifcation from 'components/Notifications/AddNotification'
import { AlertContext } from 'layouts/Admin'
import ModalForm from 'components/ModalForm'

const NotificationItem = ({ item, index, onDelete, onToggle, ...props }) => {
  if (!item) {
    return <></>
  }

  const trigger = (triggerProps) => (
    <IconButton
      variant="unstyled"
      ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}
    ></IconButton>
  )

  const moreMenu = (
    <Menu w={190} closeOnSelect={true} trigger={trigger}>
      <Menu.Group title="Actions">
        <Menu.Item onPress={() => onDelete(index)}>
          <HStack space={2} alignItems="center">
            <Icon icon={faTrash} color="danger.700" />
            <Text color="danger.700">Delete</Text>
          </HStack>
        </Menu.Item>
        <Menu.Item onPress={() => onToggle(index, item)}>
          <HStack space={2} alignItems="center">
            {item.Notification ? (
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
      </Menu.Group>
    </Menu>
  )

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      borderBottomWidth={1}
      _dark={{
        borderColor: 'muted.600'
      }}
      borderColor="muted.200"
      p={4}
    >
      <HStack space={2} justifyContent="space-between" alignItems="center">
        <Stack direction={{ base: 'column', md: 'row' }} space={2} w="1/3">
          <Text bold>{item.Conditions.Prefix || '*prefix'}</Text>
          <HStack space={2}>
            <Text color="muted.500">Protocol</Text>
            <Text>{item.Conditions.Protocol || 'any'}</Text>
          </HStack>
        </Stack>
        <Stack direction={{ base: 'column', md: 'row' }} space={2} w="1/3">
          <HStack space={2}>
            <Text color="muted.500">Source</Text>
            <Text>
              {item.Conditions.SrcIP || '*'}:{item.Conditions.SrcPort || '*'}
            </Text>
          </HStack>
          <HStack space={2}>
            <Text color="muted.500">Dest</Text>
            <Text>
              {item.Conditions.DstIP || '*'}:{item.Conditions.DstPort || '*'}
            </Text>
          </HStack>
        </Stack>
        <Box display={{ base: 'none', md: 'flex' }}>
          <Icon
            icon={item.Notification ? faBell : faBellSlash}
            color="muted.500"
          />
        </Box>
        <Box>{moreMenu}</Box>
      </HStack>
    </Box>
  )
}

const Notifications = (props) => {
  const [notifications, setNotifications] = useState([])
  const context = useContext(AlertContext)

  const fetchList = () => {
    notificationsAPI
      .list()
      .then((notifications) => setNotifications(notifications))
      .catch((err) => context.error(`failed to fetch notifications config`))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const onDelete = (index) => {
    notificationsAPI.remove(index).then((res) => {
      let _notifications = [...notifications]
      delete _notifications[index]
      setNotifications(_notifications)
    })
  }

  const onToggle = (index, item) => {
    item.Notification = !item.Notification

    notificationsAPI.update(index, item).then((res) => {
      let _notifications = [...notifications]
      _notifications[index] = item
      setNotifications(_notifications)
    })
  }

  const onSubmit = (item) => {
    //submit to api
    console.log('add:', item)
    notificationsAPI
      .add(item)
      .then((res) => {
        refModal.current()
        fetchList()
      })
      .catch((err) => {})
  }

  const refModal = useRef(null)

  let h = Dimensions.get('window').height - (Platform.OS == 'ios' ? 64 * 2 : 64)

  return (
    <View h={h}>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <Heading fontSize="md">Notifications</Heading>
        <ModalForm
          title="Add Notification"
          triggerText="Add Notification"
          modalRef={refModal}
        >
          <AddNotifcation onSubmit={onSubmit} />
        </ModalForm>
      </HStack>

      <FlashList
        data={notifications}
        estimatedItemSize={100}
        renderItem={({ item, index }) => (
          <NotificationItem
            item={item}
            index={index}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        )}
        keyExtractor={(item, index) => `notification-${index}`}
      />
    </View>
  )
}

export default Notifications
