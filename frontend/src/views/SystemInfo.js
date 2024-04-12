import React, { useContext, useEffect, useState } from 'react'
import Logs from 'views/Logs'

import {
  Box,
  Heading,
  HStack,
  FlatList,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Icon,
  Text,
  VStack,
  ScrollView,
  useColorMode
} from '@gluestack-ui/themed'

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
        .catch((err) => context.error('/info/uptime failed', err))

      api
        .get('/info/hostname')
        .then(setHostname)
        .catch((err) => context.error('/info/hostname failed', err))

      api
        .get('/version')
        .then(setVersion)
        .catch((err) => context.error('/version failed', err))
    }

    fetchInfo()

    //NOTE Time will only update every x sec.
    const interval = setInterval(fetchInfo, 5 * 1e3)
    return () => clearInterval(interval)
  }, [])

  const updateHostname = () => {
    api
      .put('/info/hostname', hostname)
      .then(context.success('Updated hostname'))
      .catch((err) => context.error('hostname update', err))
  }

  const niceKey = (key) => ucFirst(key.replace(/_/, ' ').replace(/m$/, ' min'))

  const colorMode = useColorMode()
  const item = {}

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <ReleaseInfo />
      <VStack space="md">
        <HStack p="$4">
          <Heading size="md">System Info</Heading>
        </HStack>

        <Box>
          <VStack space="md" mb="$4" sx={{ '@md': { flexDirection: 'row' } }}>
            <HStack
              flex={1}
              space="md"
              p="$4"
              bg={
                colorMode == 'light'
                  ? '$backgroundCardLight'
                  : '$backgroundCardDark'
              }
              justifyContent="space-between"
            >
              <Text size="sm">Hostname</Text>
              <FormControl>
                <Input variant="underlined">
                  <InputField
                    value={hostname}
                    onChangeText={(v) => setHostname(v)}
                    onSubmitEditing={(hostname) => updateHostname(hostname)}
                  />
                </Input>
              </FormControl>
            </HStack>
            <HStack
              flex={1}
              space="md"
              p="$4"
              bg={
                colorMode == 'light'
                  ? '$backgroundCardLight'
                  : '$backgroundCardDark'
              }
              justifyContent="space-between"
            >
              <Text size="sm">Version</Text>
              <Text size="md" color="$muted500">
                {version}
              </Text>
            </HStack>
          </VStack>

          <Box
            sx={{
              '@base': { flexDirection: 'column', gap: '$3' },
              '@md': { flexDirection: 'row', gap: '$3' }
            }}
          >
            <FlatList
              flex={1}
              data={['time', 'uptime', 'users']}
              keyExtractor={(item, index) => index}
              estimatedItemSize={100}
              renderItem={({ item }) => (
                <HStack
                  space="md"
                  p="$4"
                  bg={
                    colorMode == 'light'
                      ? '$backgroundCardLight'
                      : '$backgroundCardDark'
                  }
                  borderBottomColor={
                    colorMode == 'light'
                      ? '$borderColorCardLight'
                      : '$borderColorCardDark'
                  }
                  borderBottomWidth={1}
                  justifyContent="space-between"
                >
                  <Text size="sm">{niceKey(item)}</Text>
                  <Text color="$muted500">{uptime[item]}</Text>
                </HStack>
              )}
            />
            <FlatList
              flex={1}
              data={['load_1m', 'load_5m', 'load_15m']}
              keyExtractor={(item, index) => index}
              estimatedItemSize={100}
              renderItem={({ item }) => (
                <HStack
                  space="md"
                  p="$4"
                  bg={
                    colorMode == 'light'
                      ? '$backgroundCardLight'
                      : '$backgroundCardDark'
                  }
                  borderBottomColor={
                    colorMode == 'light'
                      ? '$borderColorCardLight'
                      : '$borderColorCardDark'
                  }
                  borderBottomWidth={1}
                  justifyContent="space-between"
                >
                  <Text size="sm">{niceKey(item)}</Text>
                  <Text color="$muted500">{uptime[item]}</Text>
                </HStack>
              )}
            />
          </Box>
        </Box>

        <Database />
        <ConfigsBackup />
        <DockerInfo />
        <Logs />
      </VStack>
    </ScrollView>
  )
}

export default SystemInfo
