import React, { useContext, useEffect, useState } from 'react'
import { Platform, TextBase } from 'react-native'
import { Icon } from 'FontAwesomeUtils'
import {
  faBoxArchive,
  faDownload,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  Box,
  Button,
  Heading,
  IconButton,
  HStack,
  FlatList,
  Modal,
  Stack,
  Text,
  VStack,
  ScrollView,
  useDisclose,
  useColorModeValue
} from 'native-base'
import { api } from 'api'
import { AlertContext } from 'AppContext'
import { prettyDate, ucFirst } from 'utils'

import { FlashList } from '@shopify/flash-list'

import DockerInfo from 'components/System/Docker'
import { BrandIcons } from 'FontAwesomeUtils'
import ReleaseInfo from 'components/System/Release'

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
      <HStack alignItems="center" justifyContent="space-between" p={4}>
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
      <VStack space={2}>
        <HStack p={4}>
          <Heading fontSize="md">System Info</Heading>
        </HStack>

        <Box>
          <HStack space={4} mb="4">
            <HStack
              flex={1}
              space={2}
              p={4}
              bg={useColorModeValue(
                'backgroundCardLight',
                'backgroundCardDark'
              )}
              justifyContent="space-between"
            >
              <Text>Hostname</Text>
              <Text color="muted.500">{hostname}</Text>
            </HStack>
            <HStack
              flex={1}
              space={2}
              p={4}
              bg={useColorModeValue(
                'backgroundCardLight',
                'backgroundCardDark'
              )}
              justifyContent="space-between"
            >
              <Text>SPR Version</Text>
              <Text color="muted.500">{version}</Text>
            </HStack>
          </HStack>

          <Stack
            direction={{ base: 'column', md: 'row' }}
            space={4}
            bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          >
            <FlatList
              data={['time', 'uptime', 'users']}
              keyExtractor={(item, index) => index}
              estimatedItemSize={100}
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
            <FlatList
              data={['load_1m', 'load_5m', 'load_15m']}
              keyExtractor={(item, index) => index}
              estimatedItemSize={100}
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
        </Box>

        <ConfigsBackup />

        {/*<HStack px={4}>
          <Button
            variant="ghost"
            _colorScheme="secondary"
            onPress={() => setShowDocker(!showDocker)}
          >
            <HStack space={2} alignItems="center">
              <BrandIcons.Docker
                color={useColorModeValue('blueGray.900', 'white')}
                size="lg"
              />
              <Text color={useColorModeValue('blueGray.900', 'white')}>
                Docker Containers
              </Text>
            </HStack>
          </Button>
        </HStack>*/}

        <ReleaseInfo />

        <DockerInfo showModal={showModal} />

        <Modal isOpen={isOpen} onClose={onClose} animationPreset="slide">
          <Modal.Content maxWidth={{ base: '100%', md: '90%' }}>
            <Modal.CloseButton />
            <Modal.Header>{modalTitle}</Modal.Header>
            <Modal.Body>{modalBody}</Modal.Body>
            {/*<Modal.Footer />*/}
          </Modal.Content>
        </Modal>
      </VStack>
    </ScrollView>
  )
}

export default SystemInfo
