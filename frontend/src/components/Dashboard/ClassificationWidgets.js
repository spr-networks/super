import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-native'

import {
  Box,
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
import { strToDate } from 'utils'

const recentWindowMs = 7 * 24 * 3600 * 1000

const RecentClassifications = (props) => {
  const navigate = useNavigate()
  const [items, setItems] = useState([])

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

  if (!items.length) {
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
        <Text
          size="md"
          fontWeight={300}
          color="$muted800"
          sx={{ _dark: { color: '$muted400' } }}
        >
          New devices identified
        </Text>

        {items.map(({ device, classification }) => (
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

export { RecentClassifications }
export default RecentClassifications
