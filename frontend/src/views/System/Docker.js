import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'
import { Icon } from 'FontAwesomeUtils'
import {
  faHardDrive,
  faListAlt,
  faNetworkWired
} from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonText,
  ButtonIcon,
  Heading,
  HStack,
  Menu,
  MenuItem,
  MenuItemLabel,
  FlatList,
  Text,
  VStack,
  ThreeDotsIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowRightIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

//import { FlashList } from '@shopify/flash-list'

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
        <FlatList
          data={item.Mounts}
          keyExtractor={(item) => item.Source}
          renderItem={({ item: mount }) => (
            <HStack space="md" p="$4" justifyContent="space-around">
              {/*<Text>{mount.Type}</Text>*/}
              <Text flex={1}>{mount.Source}</Text>
              <Text flex={1} color="$muted500">
                {mount.Destination}
              </Text>
              <Badge ml="auto" action="muted" variant="outline">
                <BadgeText>{mount.Mode}</BadgeText>
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
          <VStack space="md">
            <Heading size="sm">IPAddress</Heading>
            <Text>{ipAddress}</Text>
          </VStack>
          {item.Ports && item.Ports.length ? (
            <VStack space="md">
              <Heading size="sm" my="$2">
                Ports
              </Heading>
              {item.Ports.map((pmap, idx) => (
                <HStack key={`pmap-${idx}`} space="md" maxW={400}>
                  <HStack
                    space="md"
                    w={'200'}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Badge variant="outline">{pmap.Type}</Badge>
                    <Text flex={1}>
                      {pmap.IP}:{pmap.PublicPort}
                    </Text>
                    <ArrowRightIcon color="$muted500" />
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
      <Button variant="link" ml="auto" {...triggerProps}>
        <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
      </Button>
    )

    const moreMenu = (
      <Menu
        flex={1}
        trigger={trigger}
        selectionMode="single"
        onSelectionChange={(e) => {
          let value = e.currentKey
          if (value == 'logs') {
            onLogs()
          } else if (value == 'mounts') {
            onMounts()
          } else if (value == 'network') {
            onNetwork()
          }

          if (Platform.OS == 'web' && window !== undefined) {
            window.scrollTo(0, 0)
          }
        }}
      >
        <MenuItem key="logs">
          <Icon icon={faListAlt} color="$muted500" mr="$2" />
          <MenuItemLabel>Logs</MenuItemLabel>
        </MenuItem>
        <MenuItem key="mounts">
          <Icon icon={faHardDrive} color="$muted500" mr="$2" />
          <MenuItemLabel>Mounts</MenuItemLabel>
        </MenuItem>
        <MenuItem key="network" isDisabled={item.State != 'running'}>
          <Icon icon={faNetworkWired} color="$muted500" mr="$2" />
          <MenuItemLabel>Network</MenuItemLabel>
        </MenuItem>
      </Menu>
    )

    const networkSummary = (item) => {
      //<pre>{JSON.stringify(item.Ports)}</pre>
      let networkMode = getNetworkMode(item)
      return (
        <Badge action="muted" variant={'outline'} size="sm">
          <BadgeText>{networkMode}</BadgeText>
        </Badge>
      )
    }

    return (
      <ListItem>
        <VStack flex={1} space="md">
          <Text size="sm">{containerName}</Text>
          <HStack space="md" alignItems="center">
            <Badge action={stateColor(item.State)} variant="outline" size="sm">
              <BadgeText>{item.State}</BadgeText>
            </Badge>
            {networkSummary(item)}
          </HStack>
        </VStack>

        <Text flex={1} size="xs" color="muted.500" isTruncated>
          {item.Image}
        </Text>

        <VStack flex={1}>
          <Text
            sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
            minW="200"
            textAlign="right"
            size="xs"
            color="$muted500"
          >
            {item.Status}
          </Text>
        </VStack>

        {moreMenu}
      </ListItem>
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
      <ListHeader title="Docker Containers">
        <Button
          ml="auto"
          size="sm"
          action="muted"
          variant="link"
          onPress={() => setShowDocker(!showDocker)}
        >
          <ButtonText color="$muted500">
            {showDocker ? 'Hide info' : 'Show info'}
          </ButtonText>
        </Button>
        <ButtonIcon as={showDocker ? EyeOffIcon : EyeIcon} ml="$1" />
      </ListHeader>

      <FlatList
        data={containers}
        display={showDocker ? 'flex' : 'none'}
        keyExtractor={(item, index) => item.Id}
        estimatedItemSize={100}
        renderItem={({ item }) =>
          renderDockerContainer({ item, navigate, showModal })
        }
      />
    </Box>
  )
}

export default DockerInfo
