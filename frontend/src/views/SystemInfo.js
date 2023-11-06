import React, { useContext, useEffect, useState } from 'react'

import {
  Box,
  Heading,
  HStack,
  FlatList,
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

  const colorMode = useColorMode()

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <VStack space="md">
        <HStack p="$4">
          <Heading size="md">System Info</Heading>
        </HStack>

        <Box>
          <HStack space="md" mb="$4">
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
              <Text color="$muted500">{hostname}</Text>
            </HStack>
            <HStack
              flex={1}
              space={'md'}
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
          </HStack>

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
        <ReleaseInfo />
        <ConfigsBackup />
        <DockerInfo />
      </VStack>
    </ScrollView>
  )
}

export default SystemInfo
