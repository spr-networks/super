import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  AddIcon,
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxLabel,
  CheckboxIndicator,
  Fab,
  FabIcon,
  FabLabel,
  FlatList,
  HStack,
  Icon,
  Input,
  InputField,
  Menu,
  MenuItem,
  MenuItemLabel,
  ScrollView,
  SettingsIcon,
  Switch,
  Text,
  Tooltip,
  TrashIcon,
  ThreeDotsIcon,
  View,
  VStack,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Pressable
} from '@gluestack-ui/themed'

import { alertsAPI, api } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import { AlertContext, ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import { ListItem } from 'components/List'
import {
  AlertTriangleIcon,
  BellIcon,
  BellOffIcon,
  PencilIcon
} from 'lucide-react-native'

import AlertTemplates from 'components/Alerts/AlertTemplates'

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

  let notificationType =
    (item.Actions?.[0]?.NotificationType || 'info').replace(
      'danger',
      'warning'
    ) || 'muted'

  let color = `$${notificationType}500`

  return (
    <ListItem>
      <Pressable flex={3} onPress={() => onEdit(index, item)}>
        <VStack space="md" flex={1}>
          <HStack space="sm" alignItems="center">
            <Icon size="sm" as={AlertTriangleIcon} color={color} />
            <Text bold>{item.Actions?.[0]?.MessageTitle || item.Name}</Text>
            {item.Disabled ? (
              <Text size="xs" color="$muted500">
                Disabled
              </Text>
            ) : null}
          </HStack>

          <Badge variant="outline" action="muted" alignSelf="flex-start">
            <BadgeText>{item.TopicPrefix || 'N/A'}</BadgeText>
          </Badge>
        </VStack>
      </Pressable>

      {/*<Text flex={1} size="sm">
          {item.Actions?.[0]?.MessageTitle || 'N/A'}
        </Text>*/}

      <HStack flex={1}>
        {item.Actions.map((action) => (
          <VStack key={action.MessageTitle}>
            {/*
            <HStack space="md">
              <Text color="$muted500">Message Title</Text>
              <Text>{action.MessageTitle || 'N/A'}</Text>
            </HStack>
            */}

            <VStack space="md" alignItems="center">
              <Switch
                size="sm"
                value={action.SendNotification}
                onValueChange={() => onToggleUINotify(index, item)}
              />
            </VStack>

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

      {moreMenu}
    </ListItem>
  )
}

const AlertItemHeader = () => (
  <HStack
    space="sm"
    mx="$4"
    my="$2"
    display="none"
    sx={{ '@md': { display: 'flex' } }}
    w="95%"
  >
    <HStack flex={3}>
      <Text flex={1} size="xs" bold>
        Alert & Topic
      </Text>

      {/*<Text flex={1} size="xs" bold>
        Title
      </Text>*/}
    </HStack>
    <Text flex={1} size="xs" bold>
      Show Notification
    </Text>
  </HStack>
)

const EditAlertSettings = ({ onSubmit, ...props }) => {
  const modalContext = useContext(ModalContext)
  const [proxySettings, setProxySettings] = useState({
    Disabled: false,
    APNSDomain: ''
  })

  const [alertDevices, setAlertDevices] = useState([])
  const context = useContext(AlertContext)

  useEffect(() => {
    api.get('/alerts_mobile_proxy').then(setProxySettings).catch(context.error)
    api.get('/alerts_register_ios').then(setAlertDevices).catch(context.error)
  }, [])

  const submitSettings = (config) => {
    api
      .put('/alerts_mobile_proxy', config)
      .then((config) => {
        modalContext.setShowModal(false)
        context.success('Saved settings')
      })
      .catch((err) => {
        context.error(err)
      })
  }

  return (
    <VStack space="lg">
      <Text>
        {`${alertDevices.length} iOS device${
          alertDevices.length == 1 ? '' : 's'
        } enrolled`}
      </Text>
      <FormControl>
        <Checkbox
          value={proxySettings.Disabled}
          isChecked={proxySettings.Disabled}
          onChange={(Disabled) =>
            //submitSettings({ ...proxySettings, Disabled })
            setProxySettings({ ...proxySettings, Disabled })
          }
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Disable Apple Push Notifications</CheckboxLabel>
        </Checkbox>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Custom Proxy Domain</FormControlLabelText>
        </FormControlLabel>

        <Input _variant="underlined">
          <InputField
            value={proxySettings.APNSDomain}
            onChangeText={(APNSDomain) =>
              setProxySettings({ ...proxySettings, APNSDomain })
            }
            onSubmitEditing={() => submitSettings({ ...proxySettings })}
          />
        </Input>
      </FormControl>

      <HStack space="md">
        <Button
          variant="solid"
          action="primary"
          onPress={() => submitSettings(proxySettings)}
        >
          <ButtonText>Save</ButtonText>
        </Button>

        <Button
          variant="solid"
          action="secondary"
          onPress={() => modalContext.setShowModal(false)}
        >
          <ButtonText>Close</ButtonText>
        </Button>
      </HStack>
    </VStack>
  )
}

const AlertSettings = (props) => {
  const [config, setConfig] = useState([])
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const navigate = useNavigate()

  const fetchList = () => {
    alertsAPI
      .list()
      .then((config) => setConfig(config))
      .catch((err) => context.error(`failed to fetch alerts config`))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const onDelete = (index) => {
    alertsAPI
      .remove(index)
      .then((res) => {
        fetchList()
      })
      .catch(() => {})
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

    let SendNotification = !item.Actions[0].SendNotification
    item.Actions[0].SendNotification = SendNotification
    //if switch to on, make sure its enabled
    if (SendNotification) {
      item.Disabled = false
    }

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
    navigate(`/admin/alerts/${index}`)
    /*setItemIndex(index)
    //preopulate the modal somehow
    refModal.current()*/
  }

  /*const onSubmit = (item) => {
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

  const refModal = useRef(null)*/

  const populateTemplates = () => {
    let addedNames = config.map((t) => t.Name)
    let addTemplates = AlertTemplates.filter(
      (t) => !addedNames.includes(t.Name)
    )

    let addPromises = addTemplates.map((t) => alertsAPI.add(t))

    if (addPromises.length == 0) {
      context.success('Templates already exist')
    } else {
      Promise.all(addPromises).then(() => {
        context.success('Added ' + addPromises.length + ' templates')
        fetchList()
      })
    }
  }

  const handlePressEdit = () => {
    modalContext.modal(
      'Alert Settings',
      <EditAlertSettings onSubmit={() => {}} />
    )
  }

  return (
    <View h="$full">
      <ListHeader title="Alert Configuration">
        <HStack space="sm">
          <Button
            size="sm"
            action="secondary"
            variant="outline"
            onPress={handlePressEdit}
          >
            <ButtonText>iOS</ButtonText>
            <ButtonIcon as={SettingsIcon} color="$primary500" ml="$2" />
          </Button>
          <Button
            size="sm"
            action="secondary"
            variant="outline"
            onPress={populateTemplates}
          >
            <ButtonText>Add Templates</ButtonText>
            <ButtonIcon as={AddIcon} ml="$2" />
          </Button>
          {/*<ModalForm
            title="Add Alert"
            triggerText="Add Alert"
            triggerProps={{ display: 'none', size: 'sm' }}
            modalRef={refModal}
          >
            <AddAlert curItem={populateItem} onSubmit={onSubmit} />
          </ModalForm>*/}
        </HStack>
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
        contentContainerStyle={{ paddingBottom: 48 }}
      />
      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        onPress={() => navigate(`/admin/alerts/:id`)}
        bg="$primary500"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add Alert</FabLabel>
      </Fab>
    </View>
  )
}

export default AlertSettings
