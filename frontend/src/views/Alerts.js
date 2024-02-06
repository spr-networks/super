import React, { useContext, useEffect, useRef, useState } from 'react'

import {
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Text,
  View,
  VStack,
  CheckIcon,
  HStack
} from '@gluestack-ui/themed'

import { alertsAPI, dbAPI } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import { AlertContext, ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import FilterInputSelect from 'components/Logs/FilterInputSelect'
import { Select } from 'components/Select'
import Pagination from 'components/Pagination'
import { Tooltip } from 'components/Tooltip'

import AlertListItem from 'components/Alerts/AlertListItem'

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
  const [stateFilter, setStateFilter] = useState('New')

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

  const stateChoices = ['New', 'Resolved', 'All']

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
        dbAPI.putItem(event.AlertTopic, `timekey:${event.time}`, event)
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
          <Select
            initialLabel={stateFilter}
            selectedValue={stateFilter}
            onValueChange={(v) => onChangeStateFilter(v)}
          >
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                label={opt.label}
                value={opt.value}
              />
            ))}
          </Select>

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
          <VStack>
            <AlertListItem item={item} notifyChange={onChangeEvent} />
          </VStack>
        )}
        keyExtractor={(item, index) => item.time + index}
      />
    </View>
  )
}

export default Alerts
