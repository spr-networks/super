import React, { useContext, useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
//import { useNavigate } from 'react-router-dom'

import { logsAPI } from 'api'
import InputSelect from 'components/InputSelect'
import { prettyDate } from 'utils'
import { AlertContext } from 'layouts/Admin'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Heading,
  HStack,
  VStack,
  Spinner,
  Text,
  View,
  ArrowLeftIcon,
  ArrowRightIcon
} from '@gluestack-ui/themed'

//import { FlashList } from '@shopify/flash-list'
import { RefreshCwIcon } from 'lucide-react-native'
import { ListItem } from 'components/List'

const LogList = (props) => {
  const [list, setList] = useState([])
  const [listFiltered, setListFiltered] = useState([])
  const [containers, setContainers] = useState([])
  const [filterContainers, setFilterContainers] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const contextType = useContext(AlertContext)
  //let navigate = useNavigate()

  const refreshList = (next) => {
    logsAPI
      .latest()
      .then((logs) => {
        // make sure message is a string
        logs = logs.map((row) => {
          if (Array.isArray(row.MESSAGE)) {
            row.MESSAGE = row.MESSAGE.map((c) => String.fromCharCode(c))
          }

          return row
        })

        setList(logs)
      })
      .catch((err) => {
        contextType.error('failed to fetch JSON logs')
      })
  }

  useEffect(() => {
    refreshList()
  }, [])

  useEffect(() => {
    // total for pagination
    setTotal(list.length)

    // get containers from logs
    let cnames = list
      .map((row) =>
        row._TRANSPORT == 'kernel' ? 'kernel' : row.CONTAINER_NAME
      )
      .filter((n) => n)

    let cs = Array.from(new Set(cnames))
    setContainers(cs)

    if (props.containers && props.containers.length) {
      setFilterContainers(props.containers)
    } else {
      setFilterContainers(cs)
    }
  }, [list])

  const filterList = (filter) => {
    if (!filter) {
      filter = {
        containers: filterContainers
      }
    }

    let listFiltered = list.filter((row) => {
      let match = true
      if (filter.containers) {
        if (
          row._TRANSPORT == 'kernel' &&
          filter.containers.includes('kernel')
        ) {
          match = true
        } else if (row.CONTAINER_NAME === undefined) {
          match = false
        } else {
          match = filter.containers.includes(row.CONTAINER_NAME)
        }
      }

      return match ? row : null
    })

    setTotal(listFiltered.length)

    let perPage = 9,
      offset = (page - 1) * perPage

    listFiltered = listFiltered.slice(offset, offset + perPage)

    return listFiltered
  }

  const handleChange = (newValues) => {
    setFilterContainers(newValues.filter((v) => v.length))
    setPage(1)
  }

  useEffect(() => {
    if (filterContainers.length) {
      //navigate('/admin/logs/' + filterContainers.join(','))
    }

    setListFiltered(filterList())
  }, [filterContainers, page])

  const containersOptions = containers.map((c) => {
    return { label: c, value: c }
  })

  let containersValues = filterContainers.map((c) => c)

  const handleClickRefresh = () => {
    setListFiltered(filterList())
  }

  const prettyLine = (line) => {
    let p = line.split(' ')
    return (
      <HStack space="md">
        <Text color="$muted500">{p[0]}</Text>
        <Text>{p.slice(1).join(' ')}</Text>
      </HStack>
    )
  }

  let h = Dimensions.get('window').height - (Platform.OS == 'ios' ? 64 * 2 : 64)

  return (
    <View h={h}>
      <VStack
        h={120}
        sx={{
          '@md': { flexDirection: 'row', h: '$20' }
        }}
        space={'md'}
        alignItems="flex-start"
        justifyContent="space-between"
        p="$4"
      >
        <VStack space="sm">
          <Heading size="sm">Service Container Logs</Heading>
          {list.length ? (
            <Text size="xs" color="$muted500">
              {`${(page - 1) * 20} - ${Math.min(page * 20, total)}  / ${total}`}
              {/*`Logs from ${prettyDate(
              list[list.length - 1].__REALTIME_TIMESTAMP / 1e3
            )} to ${prettyDate(list[0].__REALTIME_TIMESTAMP / 1e3)}`*/}
            </Text>
          ) : (
            <Spinner accessibilityLabel="Loading logs" />
          )}
        </VStack>

        <HStack flex={2} space="sm" alignItems="center">
          {list ? (
            <Box flex={2}>
              <InputSelect
                isMultiple
                options={containersOptions}
                value={containersValues}
                onChange={handleChange}
              />
            </Box>
          ) : null}
          <Button action="primary" onPress={handleClickRefresh} size="md">
            <ButtonIcon as={RefreshCwIcon} />
          </Button>
        </HStack>
      </VStack>

      <FlatList
        data={listFiltered}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <ListItem>
            <Text flex={2} size="sm" flexWrap="wrap">
              {item.MESSAGE}
            </Text>
            <VStack space="md" alignSelf="flex-start">
              <Text size="xs" marginLeft="auto" whiteSpace="nowrap">
                {prettyDate(item.__REALTIME_TIMESTAMP / 1e3)}
              </Text>

              <Badge action="primary" variant="outline" ml="auto">
                <BadgeText>{item.CONTAINER_NAME || item._TRANSPORT}</BadgeText>
              </Badge>
            </VStack>
          </ListItem>
        )}
        keyExtractor={(item) => item.__REALTIME_TIMESTAMP}
      />

      {total > 20 ? (
        <HStack width="100%" space="md">
          <Button
            flex={1}
            action="primary"
            variant="link"
            isDisabled={page <= 1}
            onPress={() => setPage(page > 1 ? page - 1 : 1)}
          >
            <ButtonIcon as={ArrowLeftIcon} mr="$1" />
            <ButtonText>Previous</ButtonText>
          </Button>
          <Button
            flex={1}
            action="primary"
            variant="link"
            onPress={() => setPage(page + 1)}
          >
            <ButtonIcon as={ArrowRightIcon} mr="$1" />
            <ButtonText>Next</ButtonText>
          </Button>
        </HStack>
      ) : null}
    </View>
  )
}

export default LogList
