import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'

import {
  Button,
  ButtonIcon,
  Box,
  FlatList,
  HStack,
  Icon,
  Menu,
  MenuItem,
  MenuItemLabel,
  View,
  VStack,
  Text,
  TrashIcon,
  ThreeDotsIcon
} from '@gluestack-ui/themed'

//import { FlashList } from '@shopify/flash-list'

import { alertsAPI } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import { AlertContext } from 'layouts/Admin'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import { ListItem } from 'components/List'
import { BellIcon, BellOffIcon } from 'lucide-react-native'

const AlertItem = ({ item, index, onDelete, onToggle, ...props }) => {
  if (!item) {
    return <></>
  }

  const trigger = (triggerProps) => (
    <Button variant="link" ml="auto" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
    </Button>
  )

  const moreMenu = (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={(e) => {
        let action = e.currentKey
        if (action == 'delete') {
          onDelete(index)
        } else if (action == 'onoff') {
          onToggle(index, item)
        }
      }}
    >
      <MenuItem key="delete" textValue="delete">
        <TrashIcon color="$red700" mr="$2" />
        <MenuItemLabel size="sm" color="$red700">
          Delete
        </MenuItemLabel>
      </MenuItem>

      <MenuItem key="onoff" textValue="onoff">
        <Icon as={item.Notification ? BellIcon : BellOffIcon} mr="$2" />
        <MenuItemLabel size="sm">
          {item.Notification ? 'Disable' : 'Enable'}
        </MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  return (
    <ListItem>
      <VStack sx={{ '@md': { flexDirection: 'row' } }} space="md" w="$1/3">
        <Text bold>{item.Conditions.Prefix || '*prefix'}</Text>
        <HStack space="md">
          <Text color="$muted500">Protocol</Text>
          <Text>{item.Conditions.Protocol || 'any'}</Text>
        </HStack>
      </VStack>
      <VStack sx={{ '@md': { flexDirection: 'row' } }} space="md" w="$1/3">
        <HStack space="md">
          <Text color="$muted500">Source</Text>
          <Text>
            {item.Conditions.SrcIP || '*'}:{item.Conditions.SrcPort || '*'}
          </Text>
        </HStack>
        <HStack space="md">
          <Text color="$muted500">Dest</Text>
          <Text>
            {item.Conditions.DstIP || '*'}:{item.Conditions.DstPort || '*'}
          </Text>
        </HStack>
      </VStack>
      <Box sx={{ '@base': { display: 'none', '@md': { display: 'flex' } } }}>
        <Icon
          as={item.Notification ? BellIcon : BellOffIcon}
          color="$muted500"
        />
      </Box>
      <Box>{moreMenu}</Box>
    </ListItem>
  )
}

const Alert = (props) => {
  const [alerts, setAlerts] = useState([])
  const context = useContext(AlertContext)

  const fetchList = () => {
    alertsAPI
      .list()
      .then((alerts) => setAlerts(alertws))
      .catch((err) => context.error(`failed to fetch alerts config`))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const onDelete = (index) => {
    alertsAPI.remove(index).then((res) => {
      let _alerts = [...alerts]
      delete _alerts[index]
      setAlerts(_alerts)
    })
  }

  const onToggle = (index, item) => {
    item.Notification = !item.Notification

    alertsAPI.update(index, item).then((res) => {
      let _alerts = [...alerts]
      _alerts[index] = item
      setAlerts(_alerts)
    })
  }

  const onSubmit = (item) => {
    //submit to api
    console.log('add:', item)
    alertsAPI
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
      <ListHeader title="Alerts">
        <ModalForm
          title="Add Alert"
          triggerText="Add Alert"
          modalRef={refModal}
        >
          <AddAlert onSubmit={onSubmit} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={alerts}
        estimatedItemSize={100}
        renderItem={({ item, index }) => (
          <AlertItem
            item={item}
            index={index}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        )}
        keyExtractor={(item, index) => `alert-${index}`}
      />
    </View>
  )
}

export default Alerts
