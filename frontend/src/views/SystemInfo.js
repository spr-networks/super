import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'
import { Icon } from 'FontAwesomeUtils'
import {
  faBoxArchive,
  faDownload,
  faEllipsis,
  faHardDrive,
  faListAlt,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  Box,
  Button,
  Heading,
  IconButton,
  HStack,
  Menu,
  Modal,
  Stack,
  Text,
  ScrollView,
  VStack,
  useDisclose,
  useColorModeValue
} from 'native-base'
import { api } from 'api'
import { AlertContext } from 'AppContext'
import { prettyDate, ucFirst } from 'utils'

import { FlashList } from "@shopify/flash-list";

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

const ConfigsBackup = (props) => {
  const context = useContext(AlertContext)

  const [backups, setBackups] = useState([])

  const doConfigsBackup = () => {
    api
      .put('/backup')
      .then((filename) => {
        context.success('got backup:', filename)
        setBackups([
          ...backups.filter((b) => b.Name !== filename),
          { Name: filename, Timestamp: new Date() }
        ])
      })
      .catch((err) => {
        context.error('backup error', err)
      })
  }

  // NOTE only if web
  const downloadBackup = async (filename) => {
    let url = `/backup/${filename}`

    api
      .fetch(url)
      .then((res) => {
        res.blob().then((blob) => {
          var url = window.URL.createObjectURL(blob)
          var a = document.createElement('a')
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          a.remove()
        })
      })
      .catch((err) => {
        context.error('Failed to download backup', err)
      })
  }

  const deleteBackup = (filename) => {
    api
      .delete(`/backup/${filename}`)
      .then((res) => {
        setBackups(backups.filter((b) => b.Name !== filename))
      })
      .catch((err) => context.error('Failed to remove backup', err))
  }

  useEffect(() => {
    api.get('/backup').then(setBackups).catch(context.error)
  }, [])

  const showDownloadBackups = Platform.OS == 'web'

  return (
    <>
      <HStack
        space={2}
        alignItems="center"
        justifyContent="space-between"
        p={4}
      >
        <Heading fontSize="md">Backups</Heading>
        <Button
          size="sm"
          variant="ghost"
          colorScheme="blueGray"
          leftIcon={<Icon icon={faBoxArchive} />}
          onPress={doConfigsBackup}
        >
          Backup configs
        </Button>
      </HStack>

      <Box
        space={2}
        p={4}
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      >
        <FlashList
          data={backups}
          keyExtractor={(item, index) => item.Timestamp}
          renderItem={({ item }) => (
            <Stack
              direction="row"
              space={{ base: 2, md: 4 }}
              py={4}
              borderBottomColor="borderColorCardLight"
              _dark={{ borderBottomColor: 'borderColorCardDark' }}
              borderBottomWidth={1}
              alignItems="center"
            >
              <Badge variant="outline">{prettyDate(item.Timestamp)}</Badge>
              <HStack space={2} display={{ base: 'none', md: 'flex' }}>
                {/*<Text>Filename</Text>*/}
                <Text color="muted.500">{item.Name}</Text>
              </HStack>
              <IconButton
                size="sm"
                onPress={() => downloadBackup(item.Name)}
                icon={<Icon icon={faDownload} />}
                display={showDownloadBackups ? 'flex' : 'none'}
              />
              <IconButton
                size="sm"
                colorScheme="danger"
                onPress={() => deleteBackup(item.Name)}
                icon={<Icon icon={faTrash} />}
              />
            </Stack>
          )}
        />
        {!backups.length ? (
          <Text color="muted.500">No backups available</Text>
        ) : null}
      </Box>
    </>
  )
}

const SystemInfo = (props) => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()

  const [containers, setContainers] = useState([])
  const [uptime, setUptime] = useState({})
  const [hostname, setHostname] = useState('')
  const [version, setVersion] = useState('')

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

      api
        .get('/info/hostname')
        .then(setHostname)
        .catch((err) => context.error(err))

      api
        .get('/version')
        .then(setVersion)
        .catch((err) => context.error(err))
    }

    fetchInfo()

    //NOTE Time will only update every x sec.
    const interval = setInterval(fetchInfo, 5 * 1e3)
    return () => clearInterval(interval)
  }, [])

  const niceKey = (key) => ucFirst(key.replace(/_/, ' ').replace(/m$/, ' min'))

  const { isOpen, onOpen, onClose } = useDisclose()

  const [modalTitle, setModalTitle] = useState('Container')
  const [modalBody, setModalBody] = useState('')

  const showModal = (title, content) => {
    setModalTitle(title)
    setModalBody(content)
    onOpen()
  }

  return (
    <ScrollView>
      <HStack space={2} alignItems="flex-end" p={4}>
        <Heading fontSize="md">System Info</Heading>
      </HStack>

      <HStack space={4} mb={4}>
        <HStack
          flex={1}
          space={2}
          p={4}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          justifyContent="space-between"
        >
          <Text>Hostname</Text>
          <Text color="muted.500">{hostname}</Text>
        </HStack>
        <HStack
          flex={1}
          space={2}
          p={4}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          justifyContent="space-between"
        >
          <Text>SPR Version</Text>
          <Text color="muted.500">{version}</Text>
        </HStack>
      </HStack>

      <Stack direction={{ base: 'column', md: 'row' }}   _rounded="md" space={4} mb={4} bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}>
        <FlashList
          data={['time', 'uptime', 'users']}
          keyExtractor={(item, index) => index}
          renderItem={({ item }) => (
            <HStack
              space={2}
              p={4}
              borderBottomColor="borderColorCardLight"
              _dark={{ borderBottomColor: 'borderColorCardDark' }}
              borderBottomWidth={1}
              justifyContent="space-between"
            >
              <Text>{niceKey(item)}</Text>
              <Text color="muted.500">{uptime[item]}</Text>
            </HStack>
          )}
        />
        <FlashList
          data={['load_1m', 'load_5m', 'load_15m']}
          keyExtractor={(item, index) => index}
          renderItem={({ item }) => (
            <HStack
              space={2}
              p={4}
              borderBottomColor="borderColorCardLight"
              _dark={{ borderBottomColor: 'borderColorCardDark' }}
              borderBottomWidth={1}
              justifyContent="space-between"
            >
              <Text>{niceKey(item)}</Text>
              <Text color="muted.500">{uptime[item]}</Text>
            </HStack>
          )}
        />
      </Stack>

      <ConfigsBackup />

      <Heading fontSize="md" p={4}>
        Docker Containers
      </Heading>
      <Box minH={400} bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')} _rounded="md">
      <FlashList
        data={containers}
        keyExtractor={(item, index) => item.Id}
        renderItem={({ item }) =>
          renderDockerContainer({ item, navigate, showModal })
        }
      />
      </Box>
      <Modal isOpen={isOpen} onClose={onClose} animationPreset="slide">
        <Modal.Content maxWidth={{ base: '100%', md: '90%' }}>
          <Modal.CloseButton />
          <Modal.Header>{modalTitle}</Modal.Header>
          <Modal.Body>{modalBody}</Modal.Body>
          {/*<Modal.Footer />*/}
        </Modal.Content>
      </Modal>
    </ScrollView>
  )
}

export default SystemInfo
