import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'

import {
  Button,
  ButtonIcon,
  Box,
  FlatList,
  HStack,
  Icon,
  Input,
  InputField,
  InputSlot,
  Menu,
  MenuItem,
  MenuItemLabel,
  View,
  VStack,
  Text,
  TrashIcon,
  ThreeDotsIcon
} from '@gluestack-ui/themed'

import { alertsAPI, dbAPI } from 'api'
import AddAlert from 'components/Alerts/AddAlert'
import { AlertContext } from 'layouts/Admin'
import { ModalContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import { ListHeader } from 'components/List'
import { ListItem } from 'components/List'
import { BellIcon, BellOffIcon, SlidersHorizontalIcon } from 'lucide-react-native'

import LogListItem from 'components/Logs/LogListItem'
import FilterSelect from 'components/Logs/FilterSelect'
import { Select } from 'components/Select'
import Pagination from 'components/Pagination'
import { Tooltip } from 'components/Tooltip'

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

const Alerts = (props) => {
  const [config, setConfig] = useState([])
  const [topics, setTopics] = useState([])
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const AlertPrefix = "nft:"

  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const [params, setParams] = useState({ num: perPage })
  const [searchField, setSearchField] = useState('')

  const fetchList = () => {
    alertsAPI
      .list()
      .then((config) => setConfig(config))
      .catch((err) => context.error(`failed to fetch alerts config`))
  }

  const fetchAlertBuckets = () => {
    dbAPI.buckets().then((buckets) => {
      buckets = buckets.filter(b => b.startsWith(AlertPrefix))
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
      if (more_results !== null) {
        let mock_alerts = more_results.map(
          (event) => {
            return {
              "Topic": bucket,
              "Event": event
            }
          }
        )
        result = result.concat(mock_alerts)
      }
    }

    //alert(result.length)
    setLogs(result)
  }

  useEffect(() => {
    setLogs([])
    fetchLogs()
  }, [params, searchField])

  useEffect(() => {
    fetchList()
    fetchAlertBuckets()
    fetchLogs()
  }, [])

  const handlePressFilter = () => {
    const onSubmit = (text) => {
      setSearchField(text)
      modalContext.toggleModal()
    }
    modalContext.modal(
      'Set Filter',
      <FilterSelect
        query={searchField}
        items={logs}
        onSubmitEditing={onSubmit}
      />
    )
  }

  const onDelete = (index) => {
    alertsAPI.remove(index).then((res) => {
      let _alerts = [...alerts]
      delete _alerts[index]
      setConfig(_alerts)
    })
  }

  const onToggle = (index, item) => {
    item.Notification = !item.Notification

    alertsAPI.update(index, item).then((res) => {
      let _alerts = [...alerts]
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

      <HStack
        display="none"
        sx={{
          '@md': {
            w: '$1/2',
            display: 'flex'
          }
        }}
      >
        <Input size="sm" rounded="$md" flex={1}>
          <InputField
            autoFocus
            value={searchField}
            onChangeText={(x) => {
              setSearchField(x)
            }}
            placeholder="Search"
          />
          <InputSlot px="$2" onPress={handlePressFilter}>
            <Icon as={SlidersHorizontalIcon} />
          </InputSlot>
        </Input>
      </HStack>
      <FlatList
        flex={2}
        data={logs}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <HStack>
          {/*
            TBD: state will be something like
              "" -> untriaged
              "Triaged" -> event has been triaged, priority set till exempel
              "Resolved" -> event has been resolved
          */}
            <Text>State: {item.State}</Text>
            {/*
              Title is an alert Title from the configuration
            */}
            <Text>Title: {item.Title}</Text>
            {/*
              Body is an alert body to be set from config
            */}
            <Text>Body: {item.Body}</Text>
            <LogListItem item={item.Event} selected={item.Topic} />
          </HStack>
        )}
        keyExtractor={(item, index) => item.time + index}
      />

      <FlatList
        data={config}
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
