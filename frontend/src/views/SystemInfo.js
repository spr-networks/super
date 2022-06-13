import { useContext, useEffect, useState } from 'react'
import {
  Badge,
  FlatList,
  Heading,
  HStack,
  Stack,
  Text,
  VStack
} from 'native-base'
import { api } from 'api'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'
//import LogList from 'components/Logs/LogList'

const SystemInfo = (props) => {
  const context = useContext(AlertContext)
  const [containers, setContainers] = useState([])
  const [uptime, setUptime] = useState({})

  useEffect(() => {
    const fetchInfo = () => {
      api
        .get('/info/uptime')
        .then(setUptime)
        .catch((err) => context.error(err))

      api
        .get('/info/docker')
        .then(setContainers)
        .catch((err) => context.error(err))
    }

    fetchInfo()

    //NOTE Time will only update every x sec.
    const interval = setInterval(fetchInfo, 5 * 1e3)
    return () => clearInterval(interval)
  }, [])

  const niceKey = (key) => ucFirst(key.replace(/_/, ' ').replace(/m$/, ' min'))
  const niceName = (name) => {
    if (Array.isArray(name)) {
      name = name[0]
    }

    return name.replace(/^\//, '')
  }

  const stateColor = (state) => {
    let stateColors = {
      running: 'success',
      exited: 'warning'
    }
    return stateColors[state] || 'muted'
  }

  return (
    <VStack space={4}>
      <Heading size="md">System Info</Heading>
      <Stack direction={{ base: 'column', md: 'row' }} space={4}>
        <FlatList
          flex={1}
          bg="white"
          rounded="md"
          data={['time', 'uptime', 'users']}
          keyExtractor={(item, index) => index}
          renderItem={({ item }) => (
            <HStack
              space={2}
              p={4}
              borderBottomColor="muted.50"
              borderBottomWidth={1}
              justifyContent="space-between"
            >
              <Text>{niceKey(item)}</Text>
              <Text color="muted.500">{uptime[item]}</Text>
            </HStack>
          )}
        />
        <FlatList
          flex={1}
          bg="white"
          rounded="md"
          data={['load_1m', 'load_5m', 'load_15m']}
          keyExtractor={(item, index) => index}
          renderItem={({ item }) => (
            <HStack
              space={2}
              p={4}
              borderBottomColor="muted.50"
              borderBottomWidth={1}
              justifyContent="space-between"
            >
              <Text>{niceKey(item)}</Text>
              <Text color="muted.500">{uptime[item]}</Text>
            </HStack>
          )}
        />
      </Stack>
      <Heading size="md">Docker Containers</Heading>
      <FlatList
        bg="white"
        rounded="md"
        data={containers}
        keyExtractor={(item, index) => item.Id}
        renderItem={({ item }) => (
          <HStack
            space={2}
            p={4}
            borderBottomColor="muted.50"
            borderBottomWidth={1}
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
          >
            <Text flex={1}>{niceName(item.Names)}</Text>

            <Text flex={1} color="muted.500">
              {item.Image}
            </Text>
            <Badge
              ml="auto"
              colorScheme={stateColor(item.State)}
              variant="outline"
            >
              {item.State}
            </Badge>
            <Text
              minW="200px"
              ml="auto"
              textAlign="right"
              fontSize="xs"
              color="muted.500"
            >
              {item.Status}
            </Text>
          </HStack>
        )}
      />
    </VStack>
  )
}

export default SystemInfo
