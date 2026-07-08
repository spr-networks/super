import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Box,
  Button,
  ButtonText,
  HStack,
  Heading,
  Icon,
  Text,
  VStack
} from '@gluestack-ui/themed'
import { ChartNetworkIcon } from 'lucide-react-native'

import { topologyAPI } from 'api'
import { isIsolated } from 'components/Topology/topologyLayout'

const TopologyWidget = (props) => {
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    topologyAPI
      .getTopology()
      .then((topology) => {
        const nodes = topology?.Nodes || []
        const devices = nodes.filter((node) => node.Kind == 'device')
        setSummary({
          total: devices.length,
          online: devices.filter((node) => node.Online).length,
          isolated: devices.filter(isIsolated).length,
          leaves: nodes.filter((node) => node.Kind == 'leaf_router').length
        })
      })
      .catch(() => {})
  }, [])

  if (!summary) {
    return null
  }

  return (
    <Box
      bg="$backgroundCardLight"
      sx={{ _dark: { bg: '$backgroundCardDark' } }}
      borderRadius={10}
      p="$4"
      {...props}
    >
      <VStack space="md">
        <HStack space="sm" alignItems="center">
          <Icon as={ChartNetworkIcon} color="$primary500" size={20} />
          <Heading size="xs">Network Map</Heading>
        </HStack>

        <HStack space="lg">
          <VStack>
            <Text size="lg" fontWeight="$semibold">
              {summary.online}/{summary.total}
            </Text>
            <Text size="xs" color="$muted500">
              Devices online
            </Text>
          </VStack>
          <VStack>
            <Text
              size="lg"
              fontWeight="$semibold"
              color={summary.isolated ? '$red500' : '$muted400'}
            >
              {summary.isolated}
            </Text>
            <Text size="xs" color="$muted500">
              Isolated
            </Text>
          </VStack>
          {summary.leaves ? (
            <VStack>
              <Text size="lg" fontWeight="$semibold">
                {summary.leaves}
              </Text>
              <Text size="xs" color="$muted500">
                Mesh APs
              </Text>
            </VStack>
          ) : null}
        </HStack>

        <Button
          size="xs"
          action="primary"
          variant="outline"
          alignSelf="flex-start"
          onPress={() => navigate('/admin/topology')}
        >
          <ButtonText>Open Map</ButtonText>
        </Button>
      </VStack>
    </Box>
  )
}

export default TopologyWidget
