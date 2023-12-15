import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { eventTemplate, prettyDate } from 'utils'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Box,
  FlatList,
  Heading,
  HStack,
  Icon,
  Input,
  InputField,
  InputSlot,
  Menu,
  MenuItem,
  MenuItemLabel,
  Switch,
  View,
  VStack,
  Text,
  TrashIcon,
  ThreeDotsIcon,
  CloseIcon,
  CheckIcon
} from '@gluestack-ui/themed'

import {
  BellIcon,
  BellOffIcon,
  InboxIcon,
  CheckSquareIcon,
  SlidersHorizontalIcon,
  SquareSlash,
  EyeIcon,
  EyeOffIcon
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
    const parseLog = (r, bucket) => {
      if (bucket == 'log:www:access') {
        r.msg = `${r.method} ${r.path}`
        r.level = r.remoteaddr
      }

      return { ...r, bucket: bucket.replace(/^log:/, '') }
    }

    let result = []

    for (let bucket of topics) {
      //let stats = await dbAPI.stats(bucket)
      //setTotal(stats.KeyN)

      let withFilter = params
      withFilter['filter'] = searchField
      let more_results = await dbAPI.items(bucket, withFilter)
      if (more_results) {
        more_results = more_results.map((entry) => {entry.AlertTopic = bucket; return entry})
        //filter alert state
        if (stateFilter == 'New') {
          more_results = more_results.filter(
            (alert) => alert.State == '' || alert.State == 'New'
          )
        } else if (stateFilter != 'All') {
          more_results = more_results.filter(
            (alert) => alert.State == stateFilter
          )
        }

        result = result.concat(more_results)
      }

      /*
      if (more_results !== null) {
        let mock_alerts = more_results.map((event) => {
          return event
          return {
            Topic: bucket,
            Info: event
          }
        })

        result = result.concat(mock_alerts)
      }
      */
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

  const onDelete = (index) => {
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
      .catch((err) => {
        context.error('failed to save rule', err)
      })
  }

  const onChangeStateFilter = (value) => {
    setStateFilter(value)
  }

  const refModal = useRef(null)

  const InfoItem = ({ label, value, ...props }) => {
    return (
      <HStack space="md">
        <Text size="sm" bold>
          {label}
        </Text>
        <Text size="sm">{value}</Text>
      </HStack>
    )
  }
  const stateChoices = ['New', 'Triaged', 'Resolved', 'All']

  const options = stateChoices.map((value) => ({
    label: value,
    value
  }))

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>
      <ListHeader title="Alerts">
        <HStack space="md">
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
            modalRef={refModal}
          >
            <AddAlert onSubmit={onSubmit} />
          </ModalForm>
          <Button
            action="primary"
            variant="outline"
            size="sm"
            onPress={() => {}}
          >
            <ButtonText>Resolve All</ButtonText>
            <ButtonIcon as={CheckIcon} ml="$2" />
          </Button>
        </HStack>
      </ListHeader>

      <FlatList
        data={logs}
        estimatedItemSize={100}
        renderItem={({ item }) => <AlertItem item={item} />}
        keyExtractor={(item, index) => item.time + index}
      />
    </View>
  )
}

const AlertItem = ({ item, ...props }) => {
  const [showEvent, setShowEvent] = useState(item?.Body ? false : true)
  const updateEventState = (event, newState) => {
    //TBD, this needs to write to db
    let bucketKey = event.time
    event.State = newState
    dbAPI.putItem(event.AlertTopic, bucketKey, event)
      .then(() => {})
      .catch((err) => context.error("failed to update state", err))
  }

  const toggleEvent = (item) => {
    setShowEvent(!showEvent)
  }

  return (
    <>
      <AlertItemHeader>
        <Heading size="xs">
          {eventTemplate(item.Title, item.Event) || item.Topic || 'Alert'}
        </Heading>
        <Text size="xs" bold>
          {prettyDate(item.Timestamp || item.time)}
        </Text>
      </AlertItemHeader>
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
        <VStack space="md" flex={2}>
          {/*
          TBD: state will be something like
          "" -> untriaged
          "Triaged" -> event has been triaged, priority set till exempel
          "Resolved" -> event has been resolved

          Title is an alert Title from the configuration
          Body is an alert body to be set from config
          */}

          <Text size="sm" p="$4" display={!showEvent ? 'flex' : 'none'}>
            {eventTemplate(item.Body, item.Event)}
          </Text>

          <LogListItem
            flex={1}
            item={item.Event}
            selected={item.Topic}
            borderBottomWidth="$0"
            display={showEvent ? 'flex' : 'none'}
          />
        </VStack>

        <HStack flex={1} space="sm" justifyContent="flex-end" p="$4">
          <Button
            action="secondary"
            variant="outline"
            size="xs"
            onPress={() => toggleEvent(item)}
            display={!item.Body ? 'none' : 'flex'}
          >
            <ButtonText>{showEvent ? 'Hide Event' : 'Show Event'}</ButtonText>
            <ButtonIcon as={showEvent ? EyeOffIcon : EyeIcon} ml="$2" />
          </Button>

          <Button
            display={['', 'new'].includes(item.State.toLowerCase()) ? 'none' : 'flex'}
            size="xs"
            action="primary"
            variant="outline"
            onPress={() => {updateEventState(item, 'New')}}
          >
            <ButtonText>New</ButtonText>
            <ButtonIcon as={InboxIcon} mr="$2" />
          </Button>
          <Button
            display="none"
            size="xs"
            action="secondary"
            variant="outline"
            onPress={() => {updateEventState(item, 'Triaged')}}
          >
            <ButtonText>Triaged</ButtonText>
            <ButtonIcon as={SquareSlash} ml="$2" />
          </Button>
          <Button
            display={['resolved'].includes(item.State.toLowerCase()) ? 'none' : 'flex'}
            size="xs"
            action="primary"
            variant="outline"
            onPress={() => {updateEventState(item, 'Resolved')}}
          >
            <ButtonText>Resolve</ButtonText>
            <ButtonIcon as={CheckIcon} ml="$2" />
          </Button>
        </HStack>
      </ListItem>
    </>
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

//TODO
const StateButton = ({ item, onPress, ...props }) => {
  let actions = {
    Resolved: { action: 'resolve', icon: CheckSquareIcon },
    Triaged: { action: 'triaged', icon: SquareSlash },
    New: { action: 'new', icon: InboxIcon },
    '': { action: 'new', icon: InboxIcon }
  }

  let currentState = item.State || 'New'
  let { action, icon } = actions[currentState]

  return (
    <Button
      action="secondary"
      variant="outline"
      onPress={() => onPress(action)}
    >
      <ButtonText>{currentState}</ButtonText>
      <ButtonIcon as={icon} ml="$2" />
    </Button>
  )

  /*return (
    <>
      <Button
        display={['', 'New'].includes(item.State) ? 'none' : 'flex'}
        action="secondary"
        variant="outline"
        onPress={updateEventState(item, 'new')}
      >
        <ButtonText>New</ButtonText>
        <ButtonIcon as={InboxIcon} mr="$2" />
      </Button>
      <Button
        display="none"
        action="secondary"
        variant="outline"
        onPress={updateEventState(item, 'triaged')}
      >
        <ButtonText>Triaged</ButtonText>
        <ButtonIcon as={SquareSlash} ml="$2" />
      </Button>
      <Button
        display={['Resolved'].includes(item.State) ? 'none' : 'flex'}
        action="secondary"
        variant="outline"
        onPress={updateEventState(item, 'resolve')}
      >
        <ButtonText>Resolve</ButtonText>
        <ButtonIcon as={CheckSquareIcon} ml="$2" />
      </Button>
    </>
  )*/
}

export default Alerts
