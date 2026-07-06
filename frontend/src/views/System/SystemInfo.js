import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Box,
  Button,
  ButtonText,
  ButtonIcon,
  Heading,
  HStack,
  FlatList,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Icon,
  RepeatIcon,
  Text,
  VStack,
  ScrollView,
  useColorMode
} from '@gluestack-ui/themed'

import { api } from 'api'
import { AlertContext, AppContext } from 'AppContext'
import { ucFirst } from 'utils'
import { themeList, themeKeyFor } from 'Themes'

import ReleaseInfo from 'components/System/Release'
import ConfigsBackup from 'views/System/Configs'
import Database from 'views/System/Database'
import TimeSync from 'components/System/TimeSync'
import { Select } from 'components/Select'
import { ListHeader } from 'components/List'

const TimeDisplay = ({ utcTime }) => {
  const convertToLocalTime = (utcTimeString) => {
    const currentDate = new Date()
    const currentDateString = currentDate.toISOString().split('T')[0]
    const utcDate = new Date(`${currentDateString}T${utcTimeString}Z`)

    return utcDate.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false // Use 24-hour format
    })
  }

  return <Text color="$muted500">{convertToLocalTime(utcTime)}</Text>
}

const SystemInfo = (props) => {
  const context = useContext(AlertContext)
  const { theme, setTheme, customThemes } = useContext(AppContext)
  const navigate = useNavigate()

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

  const doRestart = () => {
    api
      .put('/restart', hostname)
      .then(context.success('Sent restart request'))
      .catch((err) => context.error('failed to call restart', err))
  }

  const niceKey = (key) => ucFirst(key.replace(/_/, ' ').replace(/m$/, ' min'))

  const colorMode = useColorMode()
  const item = {}

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <ReleaseInfo />
      <TimeSync />
      <VStack space="md">
        <HStack
          space="md"
          p="$4"
          bg={
            colorMode == 'light'
              ? '$backgroundCardLight'
              : '$backgroundCardDark'
          }
          justifyContent="space-between"
          alignItems="center"
        >
          <VStack>
            <Text size="sm" bold>
              Theme
            </Text>
          </VStack>
          <HStack space="sm" alignItems="center">
            <Box minWidth="$48" maxWidth="$72">
              <Select
                selectedValue={themeKeyFor(theme, colorMode)}
                onValueChange={(value) => {
                  if (!value) return
                  let [id, mode] = value.split(':')
                  setTheme(id, mode)
                }}
              >
                {themeList.map((t) => (
                  <Select.Item key={t.key} label={t.name} value={t.key} />
                ))}
                {Object.values(customThemes || {}).map((t) => (
                  <Select.Item
                    key={t.id || t.name}
                    label={t.name}
                    value={t.id || t.name}
                  />
                ))}
              </Select>
            </Box>
            <Button variant="link" onPress={() => navigate('/admin/theme')}>
              <ButtonText>Customize…</ButtonText>
            </Button>
          </HStack>
        </HStack>

        <ListHeader title="System Info">
          <Button action="primary" size="sm" onPress={doRestart}>
            <ButtonText>Restart SPR</ButtonText>
            <ButtonIcon as={RepeatIcon} ml="$2" />
          </Button>
        </ListHeader>

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
              alignItems="center"
            >
              <Text flex={1} size="sm">
                Hostname
              </Text>
              <FormControl flex={1}>
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
                  {item == 'time' ? (
                    <TimeDisplay utcTime={uptime[item]} />
                  ) : (
                    <Text color="$muted500">{uptime[item]}</Text>
                  )}
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
      </VStack>
    </ScrollView>
  )
}

export default SystemInfo
