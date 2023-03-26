import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from 'FontAwesomeUtils'
import {
  faEllipsis,
  faHardDrive,
  faListAlt,
  faEye,
  faEyeSlash
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
  useColorModeValue
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

    const onRestart = () => {}
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
          <Menu.Item onPress={onMounts}>
            <HStack space={2} alignItems="center">
              {<Icon icon={faHardDrive} color="muted.500" />}
              <Text>Mounts</Text>
            </HStack>
          </Menu.Item>
          <Menu.Item onPress={onLogs}>
            <HStack space={2} alignItems="center">
              <Icon icon={faListAlt} color="muted.500" />
              <Text>Logs</Text>
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
        <Text flex={1}>{containerName}</Text>

        <Text flex={1} color="muted.500" isTruncated>
          {item.Image}
        </Text>
        <Badge ml="auto" colorScheme={stateColor(item.State)} variant="outline">
          {item.State}
        </Badge>
        <Text
          display={{ base: 'none', md: 'flex' }}
          minW="200px"
          ml="auto"
          textAlign="right"
          fontSize="xs"
          color="muted.500"
        >
          {item.Status}
        </Text>
        {moreMenu}
      </HStack>
    )
  }

  useEffect(() => {
    api
      .get('/info/docker')
      .then((containers) =>
        setContainers(containers.filter((c) => c.Image.match(/spr-networks/)))
      )
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
