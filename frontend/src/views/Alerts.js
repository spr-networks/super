import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'

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
  ThreeDotsIcon
} from '@gluestack-ui/themed'

import {
  BellIcon,
  BellOffIcon,
  Inbox,
  CheckSquare,
  SlidersHorizontalIcon,
  SquareSlash,
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
        //filter alert state
        if (stateFilter == 'New') {
          more_results = more_results.filter((alert) => (alert.State == '' || alert.State == 'New'))
        }
        else if (stateFilter != 'All') {
            more_results = more_results.filter((alert) => alert.State == stateFilter)
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
      .catch((err) => {})
  }

  const onChangeStateFilter = (value) => {
    setStateFilter(value)
  }

  const updateEventState = (event) => {
    //TBD, this needs to write to db
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
  const stateChoices = ['New', 'Triaged', 'Resovled', 'All']

  const options = stateChoices.map((value) => ({
    label: value,
    value
  }))

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>
      <ListHeader title="Alerts">
        <ModalForm
          title="Add Alert"
          triggerText="Add Alert"
          modalRef={refModal}
        >
          <AddAlert onSubmit={onSubmit} />
        </ModalForm>
      </ListHeader>

      <HStack>
      <VStack flex={2}
        display="none"
        sx={{
          '@md': {
            w: '$1/2',
            display: 'flex',
            mx: '$4'
          }
        }}
      >
        <FilterInputSelect
          value={searchField}
          items={logs}
          onChangeText={setSearchField}
          onSubmitEditing={setSearchField}
        />
      </VStack>
      <HStack flex={1}>
        <Text bold flex={1}>Filter</Text>
        <InputSelect
          flex={1}
          options={options}
          value={stateFilter}
          onChange={(v) => onChangeStateFilter(v)}
          onChangeText={(v) => onChangeStateFilter(v)}
        />
      </HStack>

      </HStack>

      <Text size="xs" mx="$4">
        #Items: {logs.length}, Topics: {topics.join(',')}
      </Text>

      <Button
        size="sm"
        onPress={()=>{}}
        w="$1/4"
      >
        <ButtonText color="">Resolve All Alerts</ButtonText>
      </Button>


      <FlatList
        data={logs}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <VStack
           alignItems="center"
           space="sm"
           sx={{
             '@md': { flexDirection: 'row', justifyContent: 'space-between' }
           }}

           >
            <VStack  p="$4" flex={1} >
              {/*
              TBD: state will be something like
              "" -> untriaged
              "Triaged" -> event has been triaged, priority set till exempel
              "Resolved" -> event has been resolved

              Title is an alert Title from the configuration
              Body is an alert body to be set from config
              */}

              {['Title', 'Body'].map((label) => (
                <InfoItem key={label} label={label} value={item[label]} />
              ))}

              <VStack>
                <Button
                  action="secondary"
                  variant="outline"
                  onPress={updateEventState(item, 'new')}

                >
                  <ButtonText color="">New</ButtonText>
                  <ButtonIcon color="" as={Inbox} mr="$2" />
                </Button>
                <Button
                  action="secondary"
                  variant="outline"
                  onPress={updateEventState(item, 'triaged')}

                >
                  <ButtonText color="$yellow400">Triaged</ButtonText>
                  <ButtonIcon color="$yellow400" as={SquareSlash} mr="$2" />
                </Button>
                <Button
                  action="secondary"
                  variant="outline"
                  onPress={updateEventState(item, 'resolve')}
                >
                  <ButtonText color="$green400">Resolved</ButtonText>
                  <ButtonIcon color="$green400" as={CheckSquare} mr="$2" />
                </Button>
              </VStack>

            </VStack>
            <LogListItem flex={3} item={item.Event} selected={item.Topic} />
          </VStack>
        )}
        keyExtractor={(item, index) => item.time + index}
      />
    </View>
  )
}

export default Alerts
