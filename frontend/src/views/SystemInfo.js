import React, { useContext, useEffect, useRef, useState } from 'react'
import {
  Box,
  Heading,
  HStack,
  FlatList,
  Modal,
  Stack,
  Text,
  View,
  VStack,
  ScrollView,
  useDisclose,
  useColorModeValue
} from 'native-base'
import { api } from 'api'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'

import DockerInfo from 'views/System/Docker'
import ReleaseInfo from 'components/System/Release'
import ConfigsBackup from 'views/System/Configs'
import Database from 'views/System/Database'

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
  const refModal = useRef(null)

  const showModal = (title, content) => {
    setModalTitle(title)
    setModalBody(content)
    onOpen()

    return onClose
  }

  return (
    <ScrollView h={'100%'}>
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

        <Database showModal={showModal} closeModal={onClose} />

        <ReleaseInfo />

        <ConfigsBackup />

        <DockerInfo showModal={showModal} />

        <Modal
          ref={refModal}
          isOpen={isOpen}
          onClose={onClose}
          animationPreset="slide"
        >
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
