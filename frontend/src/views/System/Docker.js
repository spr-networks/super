import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from 'FontAwesomeUtils'
import {
  faArrowRightLong,
  faEllipsis,
  faEye,
  faEyeSlash,
  faHardDrive,
  faListAlt,
  faNetworkWired
} from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  FlatList,
  Menu,
  Text,
  useColorModeValue,
  VStack
} from 'native-base'
import { FlashList } from '@shopify/flash-list'

import { api } from 'api'
import { AlertContext } from 'AppContext'

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

const DockerInfo = ({ showModal, ...props }) => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()

  const [containers, setContainers] = useState([])

  const renderDockerContainer = ({ item, navigate, showModal }) => {
    let containerName = niceName(item.Names)

    const onMounts = () => {
      showModal(
        `${containerName} Volume Mounts`,
        <FlashList
          data={item.Mounts}
          keyExtractor={(item) => item.Source}
          renderItem={({ item: mount }) => (
            <HStack space={2} p={4} justifyContent="space-around">
              {/*<Text>{mount.Type}</Text>*/}
              <Text flex={1}>{mount.Source}</Text>
              <Text flex={1} color="muted.500">
                {mount.Destination}
              </Text>
              <Badge ml="auto" colorScheme="muted" variant="outline">
                {mount.Mode}
              </Badge>
            </HStack>
          )}
        />
      )
    }

    const onLogs = () => {
      navigate(`/admin/logs/${containerName}`)
    }

    const getNetworkMode = (item) => {
      let modes =
        item.NetworkSettings &&
        item.NetworkSettings.Networks &&
        Object.keys(item.NetworkSettings.Networks)

      let networkMode =
        modes && modes.length == 1 ? modes[0] : 'multiple/unknown'

      return networkMode
    }

    const onNetwork = () => {
      let networkMode = getNetworkMode(item)
      let ipAddress =
        networkMode == 'host'
          ? 'host'
          : item.NetworkSettings.Networks.bridge.IPAddress
      showModal(
        `${containerName} Network`,
        <VStack>
          <VStack space={2}>
            <Heading size="sm">IPAddress</Heading>
            <Text>{ipAddress}</Text>
          </VStack>
          {item.Ports && item.Ports.length ? (
            <VStack space={2}>
              <Heading size="sm" my={2}>
                Ports
              </Heading>
              {item.Ports.map((pmap, idx) => (
                <HStack key={`pmap-${idx}`} space={2} maxW={400}>
                  <HStack
                    space={2}
                    w={'400px'}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Badge variant="outline">{pmap.Type}</Badge>
                    <Text flex={1}>
                      {pmap.IP}:{pmap.PublicPort}
                    </Text>
                    <Icon icon={faArrowRightLong} color="muted.500" />
                    <Text flex={1} justifyContent="flex-end">
                      {ipAddress}:{pmap.PrivatePort}
                    </Text>
                  </HStack>
                </HStack>
              ))}
            </VStack>
          ) : null}
        </VStack>
      )
    }

    const trigger = (triggerProps) => (
      <IconButton
        variant="unstyled"
        ml="auto"
        icon={<Icon icon={faEllipsis} color="muted.600" />}
        {...triggerProps}
      ></IconButton>
    )

    const moreMenu = (
      <Menu
        flex={1}
        w={190}
        closeOnSelect={true}
        trigger={trigger}
        alignSelf="center"
      >
        <Menu.Group title="View more ...">
          <Menu.Item onPress={onLogs}>
            <HStack space={2} alignItems="center">
              <Icon icon={faListAlt} color="muted.500" />
              <Text>Logs</Text>
            </HStack>
          </Menu.Item>
          <Menu.Item onPress={onMounts}>
            <HStack space={2} alignItems="center">
              {<Icon icon={faHardDrive} color="muted.500" />}
              <Text>Mounts</Text>
            </HStack>
          </Menu.Item>
          <Menu.Item onPress={onNetwork} isDisabled={item.State != 'running'}>
            <HStack space={2} alignItems="center">
              <Icon icon={faNetworkWired} color="muted.500" />
              <Text>Network</Text>
            </HStack>
          </Menu.Item>
        </Menu.Group>
        {/*
        <Menu.Group title="Actions">
          <Menu.Item onPress={onRestart}>Restart</Menu.Item>
        </Menu.Group>
         */}
      </Menu>
    )

    const networkSummary = (item) => {
      //<pre>{JSON.stringify(item.Ports)}</pre>
      let networkMode = getNetworkMode(item)
      return (
        <Badge variant={'outline'} colorScheme="muted" fontSize="xs">
          {networkMode}
        </Badge>
      )
    }

    return (
      <HStack
        space={2}
        p={4}
        borderBottomColor="borderColorCardLight"
        _dark={{ borderBottomColor: 'borderColorCardDark' }}
        borderBottomWidth={1}
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
      >
        <VStack flex={1} space={2}>
          <Text>{containerName}</Text>
          <HStack space={2} alignItems="center">
            <Badge
              colorScheme={stateColor(item.State)}
              variant="outline"
              size="xs"
            >
              {item.State}
            </Badge>
            {networkSummary(item)}
          </HStack>
        </VStack>

        <Text flex={1} fontSize="xs" color="muted.500" isTruncated>
          {item.Image}
        </Text>

        <VStack flex={{ base: 0, md: 1 }}>
          {/* show more info here, privileged, network */}
          <Text
            display={{ base: 'none', md: 'flex' }}
            minW="200px"
            textAlign="right"
            fontSize="xs"
            color="muted.500"
          >
            {item.Status}
          </Text>
        </VStack>

        {moreMenu}
      </HStack>
    )
  }

  useEffect(() => {
    api
      .get('/info/docker')
      .then((containers) => {
        // prio running containers, newest first
        containers.sort(
          (a, b) =>
            (b.State == 'running' ? 100 : 1) * b.Created -
            (a.State == 'running' ? 100 : 1) * a.Created
        )
        containers = containers.filter((c) => c.State.match(/running|exited/))
        setContainers(containers)
        //setContainers(containers.filter(c => c.Image.match(/spr-networks/)))
      })
      .catch((err) => context.error(err))
  }, [])

  const [showDocker, setShowDocker] = useState(false)

  return (
    <Box {...props}>
      <HStack alignItems="center" justifyContent="space-between" p={4}>
        <Heading fontSize="md" onPress={() => setShowDocker(!showDocker)}>
          Docker Containers
        </Heading>
        <Button
          size="sm"
          variant="ghost"
          colorScheme="blueGray"
          leftIcon={<Icon icon={showDocker ? faEyeSlash : faEye} />}
          onPress={() => setShowDocker(!showDocker)}
        >
          {showDocker ? 'Hide info' : 'Show info'}
        </Button>
      </HStack>

      <Box
        minH={400}
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        display={showDocker ? 'flex' : 'none'}
      >
        <FlatList
          data={containers}
          keyExtractor={(item, index) => item.Id}
          estimatedItemSize={100}
          renderItem={({ item }) =>
            renderDockerContainer({ item, navigate, showModal })
          }
        />
      </Box>
    </Box>
  )
}

export default DockerInfo
