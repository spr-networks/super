import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  Fab,
  FabIcon,
  FabLabel,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  VStack,
  AddIcon,
  CheckIcon,
  SettingsIcon,
  HStack,
  useColorMode
} from '@gluestack-ui/themed'

import { Settings2Icon } from 'lucide-react-native'

import { alertsAPI, dbAPI } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import AlertChart from 'components/Alerts/AlertChart'
import { AlertContext, ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import FilterInputSelect from 'components/Logs/FilterInputSelect'
import { prettyToJSONPath } from 'components/Logs/FilterSelect'
import { Select } from 'components/Select'
import Pagination from 'components/Pagination'
import { Tooltip } from 'components/Tooltip'
import { countFields } from 'components/Alerts/AlertUtil'

import AlertListItem from 'components/Alerts/AlertListItem'

const Alerts = (props) => {
  const [config, setConfig] = useState([])
  const [topics, setTopics] = useState([])
  const [bucketCounts, setBucketCounts] = useState({})
  const [selectedBucket, setSelectedBucket] = useState(null)
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const navigate = useNavigate()

  const [fieldCounts, setFieldCounts] = useState({})

  const AlertPrefix = 'alert:'

  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const [params, setParams] = useState({ num: perPage })
  const [searchField, setSearchField] = useState('')
  const [stateFilter, setStateFilter] = useState('New')

  const prettyBucket = (bucket) => {
    let newName = bucket.replace(AlertPrefix, '')
    if (newName === '') {
      return 'Alerts'
    }
    return newName
  }
  const fetchList = () => {
    alertsAPI
      .list()
      .then((config) => setConfig(config))
      .catch((err) => context.error(`failed to fetch alerts config`))
  }

  const fetchAlertBuckets = async () => {
    let buckets = await dbAPI.buckets()
    buckets = buckets.filter((b) => b.startsWith(AlertPrefix))
    buckets.sort()
    setTopics(buckets)

    let withFilter = params
    if (searchField && searchField !== '') {
      withFilter['filter'] = prettyToJSONPath(searchField)
    } else {
      withFilter['filter'] = ''
    }

    const counts = {}
    //TODO: Promise.allSettled(buckets.map(bucket => {
    for (let bucket of buckets) {
      try {
        const result = await dbAPI.items(bucket, withFilter).then((result) => {
          if (result) {
            const filterFuncs = {
              Resolved: (item) => item.State === 'Resolved',
              New: (item) => item.State !== 'Resolved'
            }
            const filterFunc = filterFuncs[stateFilter] || ((item) => item)
            const bucketName = prettyBucket(bucket)
            counts[bucketName] = result.filter(filterFunc).length
          }
        })
      } catch (err) {
        console.error(err)
      }
    }

    setBucketCounts(counts)
  }

  const fetchLogs = async () => {
    let result = []
    let bucket = selectedBucket

    let withFilter = params
    if (searchField) {
      withFilter['filter'] = prettyToJSONPath(searchField)
    } else {
      withFilter['filter'] = ''
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

      const counts = countFields(more_results, true)

      setFieldCounts(counts)

      result = result.concat(more_results)
    }
    setLogs(result)
  }

  /*
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedBucket) {
        fetchList()
        fetchAlertBuckets()
      }
    }, 1000)

    return () => clearTimeout(timer) // this will clear the timer in case inputValue changes within 2 seconds
  }, [params, searchField, stateFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedBucket) {
        fetchLogs()
      }
    }, 1000)

    return () => clearTimeout(timer) // this will clear the timer in case inputValue changes within 2 seconds
  }, [selectedBucket, params, searchField, stateFilter])
*/

  useEffect(() => {
    if (selectedBucket) {
      fetchLogs()
    }
  }, [selectedBucket, params, searchField, stateFilter])

  useEffect(() => {
    fetchList()
    fetchAlertBuckets()
  }, [params, searchField, stateFilter])

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
    fetchAlertBuckets()
  }

  const resolveAll = () => {
    if (!logs || logs.length == 0) {
      return
    }

    let logsResolved = logs
      .filter((l) => l.State != 'Resolved')
      .map((l) => {
        return { ...l, State: 'Resolved' }
      })
      .slice(0, perPage) // max resolve 20

    Promise.all(
      logsResolved.map((event) =>
        dbAPI.putItem(event.AlertTopic, `timekey:${event.time}`, event)
      )
    ).then((res) => {
      fetchLogs()
      fetchAlertBuckets()
    })
  }

  const handleBarClick = (label, count) => {
    let parts = label.split(':', 2)
    if (parts.length == 2) {
      setSearchField(
        'Event.' + parts[0] + '=="' + label.substr(parts[0].length + 1) + '"'
      )
    }
  }

  const colorMode = useColorMode()

  return (
    <View h="$full" sx={{ '@md': { height: '92vh' } }}>
      <ListHeader title="Alerts">
        <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }}>
          {
            <FilterInputSelect
              NoFilterCommon={true}
              topic={selectedBucket}
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
          }
          <Select
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
            triggerProps={{
              display: 'none',
              action: 'secondary',
              variant: 'solid'
            }}
            modalRef={refModal}
          >
            <AddAlert onSubmit={onSubmit} />
          </ModalForm>
          {/*<Button
            action="primary"
            variant="outline"
            size="sm"
            onPress={() => navigate(`/admin/alerts/settings`)}
          >
            <ButtonText>Settings</ButtonText>
            <ButtonIcon as={SettingsIcon} ml="$2" />
          </Button>*/}
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

      {topics.map(
        (bucket) =>
          bucketCounts[prettyBucket(bucket)] != 0 && (
            <>
              <Pressable
                key={bucket}
                onPress={() =>
                  setSelectedBucket(selectedBucket === bucket ? null : bucket)
                }
              >
                <HStack
                  p="$4"
                  space="md"
                  borderBottomWidth={1}
                  borderColor={
                    colorMode == 'light' ? '$coolGray200' : '$coolGray800'
                  }
                >
                  <Text sx="$md" bold>
                    {prettyBucket(bucket)}
                  </Text>
                  <Badge
                    action={bucket == selectedBucket ? 'success' : 'muted'}
                    borderRadius={'$full'}
                    variant="outline"
                    size="md"
                  >
                    <BadgeText>
                      {bucketCounts[prettyBucket(bucket)] == perPage
                        ? perPage + '+'
                        : bucketCounts[prettyBucket(bucket)] || 0}
                    </BadgeText>
                  </Badge>
                </HStack>
              </Pressable>
              {selectedBucket === bucket && (
                <ScrollView>
                  <AlertChart
                    fieldCounts={fieldCounts}
                    onBarClick={handleBarClick}
                  />
                  <FlatList
                    data={logs}
                    estimatedItemSize={100}
                    renderItem={({ item }) => (
                      <VStack>
                        <AlertListItem
                          item={item}
                          notifyChange={onChangeEvent}
                        />
                      </VStack>
                    )}
                    keyExtractor={(item, index) => item.time + index}
                    contentContainerStyle={{ paddingBottom: 48 }}
                  />
                </ScrollView>
              )}
            </>
          )
      )}

      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        onPress={() => navigate(`/admin/alerts/:id`)}
        bg="$primary500"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add</FabLabel>
      </Fab>
      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        onPress={() => navigate(`/admin/alerts/settings`)}
        bg="$secondary500"
        mr="$20"
      >
        <FabIcon as={Settings2Icon} mr="$1" />
        <FabLabel>Settings</FabLabel>
      </Fab>
    </View>
  )
}

export default Alerts
