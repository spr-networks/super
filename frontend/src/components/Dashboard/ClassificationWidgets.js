import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  Box,
  CloseIcon,
  HStack,
  Icon,
  Pressable,
  Text,
  useColorMode,
  VStack
} from '@gluestack-ui/themed'

import { ChevronRightIcon } from 'lucide-react-native'

import { deviceAPI, classifyAPI } from 'api'
import {
  ClassificationBadge,
  displayGuess
} from 'components/Devices/Classification'
import StatsWidget from 'components/Dashboard/StatsWidget'
import { LaptopIcon } from 'lucide-react-native'
import { strToDate } from 'utils'

const recentWindowMs = 7 * 24 * 3600 * 1000

const isUnclassified = (device, byMAC) => {
  let classification = byMAC[device.MAC?.toLowerCase()]
  return !classification?.Category || classification.Category == 'unknown'
}

const DeviceStats = (props) => {
  const navigate = useNavigate()
  const [newCount, setNewCount] = useState(0)
  const [unclassifiedCount, setUnclassifiedCount] = useState(0)

  useEffect(() => {
    Promise.all([deviceAPI.list(), classifyAPI.list().catch(() => [])])
      .then(([devices, classifications]) => {
        if (!Array.isArray(devices)) {
          devices = Object.values(devices)
        }
        devices = devices.filter((d) => d.MAC && d.MAC != 'pending')

        let byMAC = {}
        for (let entry of classifications) {
          byMAC[entry.MAC?.toLowerCase()] = entry
        }

        setNewCount(
          devices.filter((d) => {
            let first = strToDate(d.DHCPFirstTime)
            return first && Date.now() - first.getTime() < recentWindowMs
          }).length
        )
        setUnclassifiedCount(
          devices.filter((d) => isUnclassified(d, byMAC)).length
        )
      })
      .catch(() => {})
  }, [])

  const showDevices = (filter) =>
    navigate('/admin/devices', { state: { tab: 'Devices', filter } })

  const stat = (label, count, filter) => (
    <Pressable onPress={() => showDevices(filter)}>
      <VStack space="xs">
        <Text
          textAlign="right"
          size="sm"
          fontWeight={300}
          color="$muted800"
          sx={{ _dark: { color: '$muted400' } }}
        >
          {label}
        </Text>
        <Text
          textAlign="right"
          size="xl"
          color="$muted800"
          sx={{ _dark: { color: '$muted400' } }}
        >
          {count}
        </Text>
      </VStack>
    </Pressable>
  )

  return (
    <StatsWidget icon={LaptopIcon} iconColor="$blue400" {...props}>
      <HStack space="2xl" alignItems="center">
        {stat('New this week', newCount, { New: true })}
        {stat('Unclassified', unclassifiedCount, { Unclassified: true })}
      </HStack>
    </StatsWidget>
  )
}

const RecentClassifications = (props) => {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [dismissed, setDismissed] = useState(null)

  useEffect(() => {
    AsyncStorage.getItem('classify-dismissed')
      .then((res) => setDismissed(JSON.parse(res) || []))
      .catch(() => setDismissed([]))
  }, [])

  const dismissAll = () => {
    let macs = items.map(({ device }) => device.MAC)
    //cap growth, old entries fall outside the 7 day window anyway
    let next = [...new Set((dismissed || []).concat(macs))].slice(-100)
    AsyncStorage.setItem('classify-dismissed', JSON.stringify(next)).catch(
      (err) => {}
    )
    setDismissed(next)
  }

  useEffect(() => {
    Promise.all([deviceAPI.list(), classifyAPI.list()])
      .then(([devices, classifications]) => {
        if (!Array.isArray(devices)) {
          devices = Object.values(devices)
        }

        let byMAC = {}
        for (let entry of classifications) {
          byMAC[entry.MAC?.toLowerCase()] = entry
        }

        let recent = devices
          .filter((d) => d.MAC && byMAC[d.MAC.toLowerCase()])
          .filter((d) => {
            let first = strToDate(d.DHCPFirstTime)
            return first && Date.now() - first.getTime() < recentWindowMs
          })
          .sort(
            (a, b) => strToDate(b.DHCPFirstTime) - strToDate(a.DHCPFirstTime)
          )
          .slice(0, 5)
          .map((d) => ({
            device: d,
            classification: byMAC[d.MAC.toLowerCase()]
          }))

        setItems(recent)
      })
      .catch(() => {})
  }, [])

  const colorMode = useColorMode()

  const visible = dismissed
    ? items.filter(({ device }) => !dismissed.includes(device.MAC))
    : []

  if (!visible.length) {
    return null
  }

  return (
    <Box
      bg={colorMode == 'light' ? '$backgroundCardLight' : '$backgroundCardDark'}
      borderRadius={10}
      p="$4"
      {...props}
    >
      <VStack space="md">
        <HStack alignItems="center" justifyContent="space-between">
          <Text
            size="md"
            fontWeight={300}
            color="$muted800"
            sx={{ _dark: { color: '$muted400' } }}
          >
            New devices identified
          </Text>
          <Pressable onPress={dismissAll} p="$1">
            <Icon as={CloseIcon} color="$muted500" />
          </Pressable>
        </HStack>

        {visible.map(({ device, classification }) => (
          <Pressable
            key={device.MAC}
            onPress={() => navigate(`/admin/devices/${device.MAC}`)}
          >
            <HStack space="md" alignItems="center">
              <VStack flex={1}>
                <Text bold size="sm" isTruncated>
                  {device.Name || device.MAC}
                </Text>
                <Text size="xs" color="$muted500">
                  {displayGuess(classification)}
                  {classification.Confidence && classification.Confidence != 'Unknown'
                    ? ` · ${classification.Confidence} confidence`
                    : ''}
                </Text>
              </VStack>
              <ClassificationBadge classification={classification} />
              <Icon as={ChevronRightIcon} color="$muted500" size={16} />
            </HStack>
          </Pressable>
        ))}
      </VStack>
    </Box>
  )
}

export { RecentClassifications, DeviceStats }
export default RecentClassifications
