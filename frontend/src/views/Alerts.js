import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { eventTemplate, prettyDate } from 'utils'

import {
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Heading,
  HStack,
  Icon,
  View,
  VStack,
  Text,
  CheckIcon,
  MailIcon
} from '@gluestack-ui/themed'

import {
  BellIcon,
  BellOffIcon,
  InboxIcon,
  CheckSquareIcon,
  SlidersHorizontalIcon,
  SquareSlash,
  EyeIcon,
  EyeOffIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  MailPlusIcon
} from 'lucide-react-native'

import { alertsAPI, dbAPI } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import { AlertContext } from 'layouts/Admin'
import { ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import { ListItem } from 'components/List'
import InputSelect from 'components/InputSelect'
import LogListItem from 'components/Logs/LogListItem'
import FilterInputSelect from 'components/Logs/FilterInputSelect'
import { Select } from 'components/Select'
import Pagination from 'components/Pagination'
import { Tooltip } from 'components/Tooltip'

const Alerts = (props) => {
  const [config, setConfig] = useState([])
  const [topics, setTopics] = useState([])
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const AlertPrefix = 'alert:'

  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const [params, setParams] = useState({ num: perPage })
  const [searchField, setSearchField] = useState('')
  const [stateFilter, setStateFilter] = useState('All')

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

  const fetchLogs = async () => {
    let result = []
    for (let bucket of topics) {
      let withFilter = params
      if (searchField) {
        withFilter['filter'] = searchField
      }

      let more_results = await dbAPI.items(bucket, withFilter)
      if (more_results) {
        more_results = more_results.map((entry) => {
          entry.AlertTopic = bucket
          entry.State = entry.State || 'New' // '' == 'New'
          return entry
        })

        if (stateFilter != 'All') {
          more_results = more_results.filter(
            (alert) => alert.State == stateFilter
          )
        }

        result = result.concat(more_results)
      }
    }

    setLogs(result)
  }

  useEffect(() => {
    setLogs([])
    fetchLogs()
  }, [params, searchField, stateFilter])

  useEffect(() => {
    fetchList()
    fetchAlertBuckets()
  }, [])

  //fetch logs after topics
  useEffect(() => {
    if (!topics.length) {
      return
    }

    fetchLogs()
  }, [topics])

  //TODO
  /*const onDelete = (index) => {
    alertsAPI.remove(index).then((res) => {
      let _alerts = [...config]
      delete config[index]
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
  }*/

  const onSubmit = (item) => {
    //submit to api
    console.log('add:', item)
    alertsAPI
      .add(item)
      .then((res) => {
        refModal.current()
        fetchList()
      })
      .catch((err) => {
        context.error('failed to save rule', err)
      })
  }

  const onChangeStateFilter = (value) => {
    setStateFilter(value)
  }

  const refModal = useRef(null)

  const stateChoices = ['New', 'Triaged', 'Resolved', 'All']

  const options = stateChoices.map((value) => ({
    label: value,
    value
  }))

  const onChangeEvent = (event) => {
    let logsUpdated = logs.map((l) => (l.time == event.time ? event : l))
    setLogs(logsUpdated)
  }

  const resolveAll = () => {
    let logsResolved = logs
      .filter((l) => l.State != 'Resolved')
      .map((l) => {
        return { ...l, State: 'Resolved' }
      })
      .slice(0, 20) // max resolve 20

    Promise.all(
      logsResolved.map((event) =>
        dbAPI.putItem(event.AlertTopic, event.time, event)
      )
    ).then((res) => {
      fetchLogs()
    })
  }

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>
      <ListHeader title="Alerts">
        <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }}>
          {/*
          <FilterInputSelect
            value={searchField}
            items={logs}
            onChangeText={setSearchField}
            onSubmitEditing={setSearchField}
            display="none"
            sx={{
              '@md': {
                display: 'flex',
                width: 300
              }
            }}
          />
          */}
          <InputSelect
            flex={1}
            size="sm"
            options={options}
            value={stateFilter}
            onChange={(v) => onChangeStateFilter(v)}
            onChangeText={(v) => onChangeStateFilter(v)}
          />
          <ModalForm
            title="Add Alert"
            triggerText="Add Alert"
            triggerProps={{ action: 'secondary', variant: 'solid' }}
            modalRef={refModal}
          >
            <AddAlert onSubmit={onSubmit} />
          </ModalForm>
          <Button
            action="primary"
            variant="solid"
            size="sm"
            onPress={resolveAll}
          >
            <ButtonText>Resolve All</ButtonText>
            <ButtonIcon as={CheckIcon} ml="$2" />
          </Button>
        </VStack>
      </ListHeader>

      <FlatList
        data={logs}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <AlertItem item={item} notifyChange={onChangeEvent} />
        )}
        keyExtractor={(item, index) => item.time + index}
      />
    </View>
  )
}

const AlertItem = ({ item, notifyChange, ...props }) => {
  const context = useContext(AlertContext)

  const [showEvent, setShowEvent] = useState(item?.Body ? false : true)

  const updateEventState = (event, newState) => {
    //TBD, this needs to write to db
    let bucketKey = event.time
    event.State = newState
    dbAPI
      .putItem(event.AlertTopic, bucketKey, event)
      .then(() => {
        notifyChange(event)
      })
      .catch((err) => context.error('failed to update state:' + err))
  }

  const toggleEvent = (item) => {
    setShowEvent(!showEvent)
  }

  let notificationType =
    item?.NotificationType?.replace('danger', 'warning') || 'muted'
  let color = `$${notificationType}500`

  const isResolved = item.State == 'Resolved'

  const TitleComponent = (
    <>
      <HStack
        flex={1}
        space="sm"
        alignItems="center"
        opacity={isResolved ? 0.5 : 1}
      >
        <Icon size="sm" as={AlertTriangleIcon} color={color} />

        <Heading size="xs">
          {eventTemplate(item.Title, item.Event) || item.Topic || 'Alert'}
        </Heading>
      </HStack>

      <Tooltip label={showEvent ? 'Hide Event' : 'Show Event'}>
        <Button
          ml="auto"
          action="primary"
          variant="link"
          size="sm"
          onPress={() => toggleEvent(item)}
          display={!item.Body ? 'none' : 'flex'}
        >
          <ButtonIcon as={showEvent ? EyeOffIcon : EyeIcon} ml="$2" />
        </Button>
      </Tooltip>
      <Text size="xs" bold>
        {prettyDate(item.Timestamp || item.time)}
      </Text>
    </>
  )

  return (
    <ListItem
      alignItems="flex-start"
      flexDirection="row"
      bg="$coolGray50"
      borderColor="$secondary200"
      sx={{
        _dark: { bg: '$secondary900', borderColor: '$secondary800' }
      }}
      p="$0"
      mb="$1"
    >
      <VStack space="md" flex={4}>
        {/*
          TBD: state will be something like
          "" -> untriaged
          "Triaged" -> event has been triaged, priority set till exempel
          "Resolved" -> event has been resolved

          Title is an alert Title from the configuration
          Body is an alert body to be set from config
          */}

        <LogListItem
          item={item.Event}
          selected={item.Topic}
          borderBottomWidth="$0"
          TitleComponent={TitleComponent}
          isHidden={!showEvent}
        >
          <HStack
            flex={1}
            p="$4"
            display={!showEvent ? 'flex' : 'none'}
            alignSelf="center"
          >
            <Text size="sm">{eventTemplate(item.Body, item.Event)}</Text>
          </HStack>
          <VStack
            space="sm"
            p="$4"
            sx={{ '@md': { flexDirection: 'row', justifyContent: 'flex-end' } }}
          >
            <StateButton
              item={item}
              onPress={(action) => updateEventState(item, action)}
            />
          </VStack>
        </LogListItem>
      </VStack>
    </ListItem>
  )
}

const AlertItemHeader = ({ ...props }) => {
  return (
    <HStack
      w="$full"
      bg="$coolGray100"
      sx={{
        _dark: { bg: '$secondary950' }
      }}
      alignItems="center"
      justifyContent="space-between"
      px="$4"
      py="$0.5"
    >
      {props.children}
    </HStack>
  )
}

//Flip from Resolved -> New, and New -> Resolved
const StateButton = ({ item, onPress, ...props }) => {
  let actions = {
    New: { action: 'Resolved', icon: CheckIcon, text: 'Mark as Read' },
    Resolved: { action: 'New', icon: MailIcon, text: 'Mark as Unread' }
    //Triaged: { action: 'Triaged', icon: SquareSlash, text: 'Triaged' },
  }

  let currentState = item.State || 'New'
  let { action, icon, text } = actions[currentState] || actions.New

  return (
    <Button
      action={currentState == 'New' ? 'primary' : 'secondary'}
      variant={currentState == 'New' ? 'solid' : 'outline'}
      size="xs"
      onPress={() => onPress(action)}
    >
      <ButtonText>{text}</ButtonText>
      <ButtonIcon as={icon} ml="$2" />
    </Button>
  )

  /*
  const updateEventState = onPress

  return (
    <>
      <Button
        display={
          ['', 'new'].includes(item.State.toLowerCase()) ? 'none' : 'flex'
        }
        size="xs"
        action="primary"
        variant="outline"
        onPress={() => {
          updateEventState(item, 'New')
        }}
      >
        <ButtonText>Mark as unread</ButtonText>
        <ButtonIcon as={InboxIcon} ml="$2" />
      </Button>
      <Button
        display="none"
        size="xs"
        action="secondary"
        variant="outline"
        onPress={() => {
          updateEventState(item, 'Triaged')
        }}
      >
        <ButtonText>Triaged</ButtonText>
        <ButtonIcon as={SquareSlash} ml="$2" />
      </Button>
      <Button
        display={
          ['resolved'].includes(item.State.toLowerCase()) ? 'none' : 'flex'
        }
        size="xs"
        action="primary"
        variant="outline"
        onPress={() => {
          updateEventState(item, 'Resolved')
        }}
      >
        <ButtonText>Resolve</ButtonText>
        <ButtonIcon as={CheckIcon} ml="$2" />
      </Button>
    </>
  )
  */
}

export default Alerts
