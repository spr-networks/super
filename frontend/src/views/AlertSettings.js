import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'

import {
  Button,
  ButtonIcon,
  FlatList,
  HStack,
  Icon,
  Menu,
  MenuItem,
  MenuItemLabel,
  Switch,
  View,
  VStack,
  Text,
  TrashIcon,
  ThreeDotsIcon,
  Badge,
  BadgeText
} from '@gluestack-ui/themed'

import { alertsAPI, dbAPI } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import { AlertContext, ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import { ListItem } from 'components/List'
import { BellIcon, BellOffIcon, PencilIcon } from 'lucide-react-native'

const AlertItem = ({
  item,
  index,
  onDelete,
  onToggle,
  onToggleUINotify,
  onToggleStore,
  onEdit,
  ...props
}) => {
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
        } else if (action == 'edit') {
          onEdit(index, item)
        }
      }}
    >
      <MenuItem key="edit" textValue="edit">
        <Icon as={PencilIcon} color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Edit</MenuItemLabel>
      </MenuItem>

      <MenuItem key="onoff" textValue="onoff">
        <Icon as={item.Disabled ? BellOffIcon : BellIcon} mr="$2" />
        <MenuItemLabel size="sm">
          {item.Disabled ? 'Enable' : 'Disable'}
        </MenuItemLabel>
      </MenuItem>

      <MenuItem key="delete" textValue="delete">
        <TrashIcon color="$red700" mr="$2" />
        <MenuItemLabel size="sm" color="$red700">
          Delete
        </MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  return (
    <ListItem>
      <Text flex={1} size="md" bold={!item.Disabled}>
        {item.Name}
      </Text>
      <Text flex={1} size="md">
        {item.TopicPrefix || 'N/A'}
      </Text>

      <Text flex={1} size="md">
        {item.Actions?.[0]?.MessageTitle || 'N/A'}
      </Text>

      {/*<Badge
        variant="outline"
        action={item.Actions?.[0]?.NotificationType || 'info'}
        rounded="$md"
      >
        <BadgeText>{item.Actions?.[0]?.NotificationType || 'info'}</BadgeText>
      </Badge>*/}

      <HStack flex={1}>
        {item.Actions.map((action) => (
          <VStack key={action.MessageTitle}>
            {/*
          <HStack space="md">
            <Text color="$muted500">Message Title</Text>
            <Text>{action.MessageTitle || 'N/A'}</Text>
          </HStack>
          */}

            <Switch
              value={action.SendNotification}
              onValueChange={() => onToggleUINotify(index, item)}
            />

            {/*
          <HStack space="md">
            <Text color="$muted500">Alert Topic Suffix</Text>
            <Text>{action.StoreTopicSuffix || 'N/A'}</Text>
          </HStack>


          <HStack space="md">
            <Text color="$muted500">Copy Event into Alert</Text>
            <Text>{action.GrabEvent ? 'Yes' : 'No'}</Text>
          </HStack>
          */}
          </VStack>
        ))}
      </HStack>

      {/*item.Conditions.length > 0 && (
          <VStack space="md">
            {item.Conditions.map((condition, index) => (
              <HStack key={index} space="md">
                <Text color="$muted500">Condition {index + 1}</Text>
                <Text>{condition.JPath || 'N/A'}</Text>
              </HStack>
            ))}
          </VStack>
        )*/}

      {/*
        <HStack space="md">
          <Text color="$muted500">Match Any Condition</Text>
          <Text>{item.MatchAnyOne ? 'Yes' : 'No'}</Text>
        </HStack>

        <HStack space="md">
          <Text color="$muted500">Invert Rule</Text>
          <Text>{item.InvertRule ? 'Yes' : 'No'}</Text>
        </HStack>
        */}

      {moreMenu}
    </ListItem>
  )
}

const AlertItemHeader = () => (
  //TBD spacing

  <HStack space="sm" mx="$4" my="$2">
    <Text flex={1} size="xs" bold>
      Name
    </Text>
    <Text flex={1} size="xs" bold>
      Topic
    </Text>
    <Text flex={1} size="xs" bold>
      Title
    </Text>
    <Text flex={1} size="xs" bold>
      Notification
    </Text>
  </HStack>
)

const AlertSettings = (props) => {
  const [config, setConfig] = useState([])
  const [topics, setTopics] = useState([])
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  //TBD: this will be replaced with alert: and mock_alerts will not wrap
  const AlertPrefix = 'nft:'

  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const [params, setParams] = useState({ num: perPage })

  const [itemIndex, setItemIndex] = useState(-1)

  const fetchList = () => {
    alertsAPI
      .list()
      .then((config) => setConfig(config))
      .catch((err) => context.error(`failed to fetch alerts config`))
  }

  const fetchAlertBuckets = () => {
    dbAPI.buckets().then((buckets) => {
      buckets = buckets.filter((b) => b.startsWith(AlertPrefix))
      buckets.sort()
      setTopics(buckets)
    })
  }

  useEffect(() => {
    setLogs([])
  }, [params])

  useEffect(() => {
    fetchList()
    fetchAlertBuckets()
  }, [])

  const onDelete = (index) => {
    alertsAPI.remove(index).then((res) => {
      let _alerts = [...config]
      delete _alerts[index]
      setConfig(_alerts)
    })
  }

  const onToggle = (index, item) => {
    item.Disabled = !item.Disabled

    alertsAPI.update(index, item).then((res) => {
      let _alerts = [...config]
      _alerts[index] = item
      setConfig(_alerts)
    })
  }

  const onToggleUINotify = (index, item) => {
    if (!item.Actions || !item.Actions[0]) {
      return
    }

    item.Actions[0].SendNotification = !item.Actions[0].SendNotification

    alertsAPI
      .update(index, item)
      .then((res) => {
        let _alerts = [...config]
        _alerts[index] = item
        setConfig(_alerts)
      })
      .catch((err) => {
        context.error('Failed to update alert')
      })
  }

  const onToggleStore = (index, item) => {
    if (!item.Actions || !item.Actions[0]) {
      return
    }

    item.Actions[0].StoreAlert = !item.Actions[0].StoreAlert

    alertsAPI.update(index, item).then((res) => {
      let _alerts = [...config]
      _alerts[index] = item
      setConfig(_alerts)
    })
  }

  const onEdit = (index, item) => {
    setItemIndex(index)
    //preopulate the modal somehow
    refModal.current()
  }

  const onSubmit = (item) => {
    if (itemIndex == -1) {
      //create a new item
      alertsAPI
        .add(item)
        .then((res) => {
          refModal.current()
          fetchList()
        })
        .catch((err) => {
          context.error('failed to save rule', err)
        })
    } else {
      //updates an existing one
      alertsAPI
        .update(itemIndex, item)
        .then((res) => {
          refModal.current()
          fetchList()
        })
        .catch((err) => {
          context.error('failed to save rule', err)
        })

      setItemIndex(-1)
    }
  }

  const refModal = useRef(null)

  let populateItem = null
  if (itemIndex != -1) {
    populateItem = config[itemIndex]
  }

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>
      <ListHeader title="Alert Configuration">
        <ModalForm
          title="Add Alert"
          triggerText="Add Alert"
          modalRef={refModal}
        >
          <AddAlert curItem={populateItem} onSubmit={onSubmit} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={config}
        estimatedItemSize={100}
        ListHeaderComponent={AlertItemHeader}
        renderItem={({ item, index }) => (
          <AlertItem
            item={item}
            index={index}
            onToggle={onToggle}
            onToggleStore={onToggleStore}
            onToggleUINotify={onToggleUINotify}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        )}
        keyExtractor={(item, index) => `alert-${index}`}
      />
    </View>
  )
}

export default AlertSettings
