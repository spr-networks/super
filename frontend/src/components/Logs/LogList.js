import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faRefresh } from '@fortawesome/free-solid-svg-icons'

import { logsAPI } from 'api'
import InputSelect from 'components/InputSelect'
import { prettyDate } from 'utils'
import { AlertContext } from 'layouts/Admin'

import {
  Badge,
  Box,
  Button,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  ScrollView,
  Spacer,
  Spinner,
  Text,
  useColorModeValue
} from 'native-base'

const LogList = (props) => {
  const [list, setList] = useState([])
  const [listAll, setListAll] = useState([])
  const [containers, setContainers] = useState([])
  const [filterContainers, setFilterContainers] = useState([])

  const contextType = useContext(AlertContext)
  let navigate = useNavigate()

  const refreshList = (next) => {
    logsAPI
      .latest()
      .then((logs) => {
        // make sure message is a string
        logs = logs.slice(0, 100) //TODO
        logs = logs.map((row) => {
          if (Array.isArray(row.MESSAGE)) {
            row.MESSAGE = row.MESSAGE.map((c) => String.fromCharCode(c))
          }

          return row
        })

        setList(logs)
        setListAll(logs)

        if (next) {
          next(logs)
        }
      })
      .catch((err) => {
        contextType.error('failed to fetch JSON logs')
      })
  }

  useEffect(() => {
    refreshList((logs) => {
      // get containers from logs
      let cnames = logs.map((row) => row.CONTAINER_NAME).filter((n) => n)
      let cs = Array.from(new Set(cnames))
      setContainers(cs)

      if (props.containers && props.containers.length) {
        setFilterContainers(props.containers)
      } else {
        setFilterContainers(cs)
      }
    })
  }, [])

  const filterList = (filter) => {
    if (!filter) {
      filter = {
        containers: filterContainers
      }
    }

    let logs = listAll.filter((row) => {
      let match = true
      if (filter.containers) {
        if (row.CONTAINER_NAME === undefined) {
          match = false
        } else {
          match = filter.containers.includes(row.CONTAINER_NAME)
        }
      }

      return match ? row : null
    })

    if (logs) {
      setList(logs)
    }
  }

  const handleChange = (newValues) => {
    setFilterContainers(newValues.filter((v) => v.length))
  }

  useEffect(() => {
    if (!filterContainers.length) {
      return
    }

    console.log('nav:', filterContainers)

    navigate('/admin/logs/' + filterContainers.join(','))

    let opts = {
      containers: filterContainers
    }

    filterList(opts)
  }, [filterContainers])

  const containersOptions = containers.map((c) => {
    return { label: c, value: c }
  })

  let containersValues = filterContainers.map((c) => c)

  const handleClickRefresh = () => {
    refreshList((logs) => {
      filterList()
    })
  }

  const prettyLine = (line) => {
    let p = line.split(' ')
    return (
      <HStack space={1}>
        <Text color="muted.500">{p[0]}</Text>
        <Text>{p.slice(1).join(' ')}</Text>
      </HStack>
    )
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
    >
      <Stack
        direction={{ base: 'column', md: 'row' }}
        space={2}
        justifyContent="space-between"
      >
        <VStack space={1}>
          <Heading fontSize="lg">Logs</Heading>
          {list.length ? (
            <Text color="muted.500" fontSize="xs">{`Logs from ${prettyDate(
              list[list.length - 1].__REALTIME_TIMESTAMP / 1e3
            )} to ${prettyDate(list[0].__REALTIME_TIMESTAMP / 1e3)}`}</Text>
          ) : (
            <Spinner accessibilityLabel="Loading logs" />
          )}
        </VStack>

        <HStack flex="2" space={1}>
          {list ? (
            <Box flex="2">
              <InputSelect
                isMultiple
                options={containersOptions}
                value={containersValues}
                onChange={handleChange}
              />
            </Box>
          ) : null}
          <Button
            colorScheme="primary"
            marginLeft="auto"
            alignSelf="center"
            leftIcon={<Icon as={FontAwesomeIcon} icon={faRefresh} />}
            onPress={handleClickRefresh}
          ></Button>
        </HStack>
      </Stack>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth={1}
            borderColor="muted.200"
            _dark={{ borderColor: 'muted.600' }}
            py={2}
          >
            <HStack
              w="100%"
              space={3}
              alignItems="center"
              justifyContent="stretch"
            >
              <Badge variant="outline" colorScheme="primary">
                {item.CONTAINER_NAME}
              </Badge>
              <Text isTruncated>{item.MESSAGE}</Text>
              <Text fontSize="xs" marginLeft="auto" whiteSpace="nowrap">
                {prettyDate(item.__REALTIME_TIMESTAMP / 1e3)}
              </Text>
            </HStack>
          </Box>
        )}
        keyExtractor={(item) => item.__REALTIME_TIMESTAMP}
      />
    </Box>
  )
}

export default LogList
