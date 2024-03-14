import React, { useContext, useEffect, useRef, useState } from 'react'

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
  VStack,
  FormControl,
  FormControlLabel,
  FormControlLabelText
} from '@gluestack-ui/themed'

import { alertsAPI, dbAPI, api } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import { AlertContext, ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import { ListItem } from 'components/List'
import {
  BellIcon,
  BellOffIcon,
  BugPlayIcon,
  CopyIcon,
  PencilIcon
} from 'lucide-react-native'

import { copy } from 'utils'

const alertTemplates = [
  {
    TopicPrefix: 'nft:drop:mac',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: true,
        StoreAlert: true,
        MessageTitle: 'MAC Filter Violation',
        MessageBody:
          'MAC IP Violation {{IP.SrcIP#Device}} {{IP.SrcIP}} {{Ethernet.SrcMAC}} to {{IP.DstIP}} {{Ethernet.DstMAC}}',
        NotificationType: 'info',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'MAC Filter Violation',
    Disabled: false,
    RuleId: '7f3266dd-7697-44ce-8ddd-36a006043509'
  },
  {
    TopicPrefix: 'auth:failure',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [
      {
        JPath: '$[?(@.type=="user")]'
      }
    ],
    Actions: [
      {
        SendNotification: true,
        StoreAlert: true,
        MessageTitle: 'Login Failure',
        MessageBody: '{{name}} failed to login with {{reason}}',
        NotificationType: 'error',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'User Login Failure',
    Disabled: false,
    RuleId: 'ea676ee7-ec68-4a23-aba4-ba69feee4d8c'
  },
  {
    TopicPrefix: 'nft:drop:private',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: true,
        StoreAlert: true,
        MessageTitle: 'Firewall Drop Private Network Request (rfc1918)',
        MessageBody:
          'Dropped Traffic from {{IP.SrcIP#Device}} {{IP.SrcIP}} {{InDev#Interface}} to {{IP.DstIP}} {{OutDev#Interface}}',
        NotificationType: 'info',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'Drop Private Request',
    Disabled: false,
    RuleId: '2adbec19-6b47-4a99-a499-ab0b8da652a8'
  },
  {
    TopicPrefix: 'wifi:auth:fail',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: true,
        StoreAlert: true,
        MessageTitle: 'WiFi Auth Failure',
        MessageBody:
          '{{MAC#Device}} {{MAC}} failed wifi authentication {{Reason}} with type {{Type}}',
        NotificationType: 'warning',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'Wifi Auth Failure',
    Disabled: false,
    RuleId: 'f16e9a58-9f80-455c-a280-211bd8b1fd05'
  },
  {
    TopicPrefix: 'nft:drop:input',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: false,
        StoreAlert: true,
        MessageTitle: 'Dropped Input',
        MessageBody:
          'Drop Incoming Traffic to Router from {{IP.SrcIP}} to port {{TCP.DstPort}} {{UDP.DstPort}}',
        NotificationType: 'info',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'Dropped Input',
    Disabled: true,
    RuleId: '481822f4-a20c-4cec-92d9-dad032d2c450'
  }
]

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
      <VStack
        space="sm"
        flex={3}
        alignItems="flex-start"
        sx={{
          '@md': {
            flexDirection: 'row'
          }
        }}
      >
        <VStack space="md" flex={1}>
          <HStack space="sm">
            <Text bold>{item.Name}</Text>
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

        <Text flex={1} size="sm">
          {item.Actions?.[0]?.MessageTitle || 'N/A'}
        </Text>
      </VStack>

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
  //TBD spacing

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
        Name & Topic
      </Text>

      <Text flex={1} size="xs" bold>
        Title
      </Text>
    </HStack>
    <Text flex={1} size="xs" bold>
      Show Notification
    </Text>
  </HStack>
)

/*

external_router_authenticated.HandleFunc("/alerts_register_ios", registerAlertDevice).Methods("DELETE", "PUT", "GET")
external_router_authenticated.HandleFunc("/alerts_mobile_proxy", alertsMobileProxySettings).Methods("PUT", "GET")


type MobileAlertProxySettings struct {
	Disabled   bool
	APNSDomain string
}

type AlertDevice struct {
	DeviceId    string
	DeviceToken string
	PublicKey   string
	LastActive  time.Time
}

*/

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
    <VStack space="lg" flex="">
      <Text>
        {alertDevices.length} iOS device{alertDevices.length == 1 ? '' : 's'}
        enrolled
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

  const populateTemplates = () => {
    //alertTemplates
    let newConfig = config
    let templateFound = []
    for (let j = 0; j < alertTemplates.length; j++) {
      let found = false
      for (let i = 0; i < newConfig.length; i++) {
        if (alertTemplates[j] && alertTemplates[j].Name == newConfig[i].Name) {
          found = true
          break
        }
      }
      templateFound.push(found)
    }

    const addPromises = []
    for (let j = 0; j < alertTemplates.length; j++) {
      if (templateFound[j] == false) {
        addPromises.push(alertsAPI.add(alertTemplates[j]))
      }
    }

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
    <ScrollView h="$full">
      <ListHeader title="Alert Configuration">
        <HStack space="sm" marginLeft="auto">
          <Button variant="outline" action="primary" onPress={handlePressEdit}>
            <ButtonIcon as={SettingsIcon} color="$primary500" />
          </Button>
        </HStack>

        <HStack space="sm">
          <Button
            size="sm"
            action="secondary"
            variant="outline"
            onPress={populateTemplates}
          >
            <ButtonText>Add Templates</ButtonText>
            <ButtonIcon as={AddIcon} ml="$2" />
          </Button>
          <ModalForm
            title="Add Alert"
            triggerText="Add Alert"
            modalRef={refModal}
          >
            <AddAlert curItem={populateItem} onSubmit={onSubmit} />
          </ModalForm>
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
      />
    </ScrollView>
  )
}

export default AlertSettings
