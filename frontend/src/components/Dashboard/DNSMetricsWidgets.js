import React, { useEffect, useState, Component } from 'react'
import { BanIcon, GlobeIcon } from 'lucide-react-native'
import { blockAPI } from 'api/DNS'
import StatsWidget from './StatsWidget'
import StatsChartWidget from './StatsChartWidget'

import { VStack, Text } from '@gluestack-ui/themed'

export const DNSMetrics = (props) => {
  const [totalQueries, setTotalQueries] = useState(0)
  const [blockedQueries, setBlockedQueries] = useState(0)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const fetchMetrics = () => {
      if (!isMounted) {
        return
      }

      blockAPI
        .metrics()
        .then((metrics) => {
          setTotalQueries(metrics.TotalQueries)
          setBlockedQueries(metrics.BlockedQueries)
        })
        .catch((err) => {})
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30 * 1e3)

    return () => {
      clearInterval(interval)
      setIsMounted(false)
    }
  })

  return (
    <StatsWidget
      icon={GlobeIcon}
      iconColor="$green400"
      title="Total DNS queries"
      text={totalQueries}
    />
  )
}

export const DNSBlockMetrics = (props) => {
  const [totalQueries, setTotalQueries] = useState(0)
  const [blockedQueries, setBlockedQueries] = useState(0)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const fetchMetrics = () => {
      if (!isMounted) {
        return
      }

      blockAPI
        .metrics()
        .then((metrics) => {
          setTotalQueries(metrics.TotalQueries)
          setBlockedQueries(metrics.BlockedQueries)
        })
        .catch((err) => {})
    }

    fetchMetrics()

    const interval = setInterval(fetchMetrics, 30 * 1e3)

    return () => {
      clearInterval(interval)
      setIsMounted(false)
    }
  })

  return (
    <StatsWidget
      icon={BanIcon}
      iconColor="$red400"
      title="Blocked DNS queries"
      text={blockedQueries}
    />
  )
}

export const DNSBlockFullMetrics = (props) => {
  const [totalQueries, setTotalQueries] = useState(0)
  const [blockedQueries, setBlockedQueries] = useState(0)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const fetchMetrics = () => {
      if (!isMounted) {
        return
      }

      blockAPI
        .metrics()
        .then((metrics) => {
          setTotalQueries(metrics.TotalQueries)
          setBlockedQueries(metrics.BlockedQueries)
        })
        .catch((err) => {})
    }

    fetchMetrics()

    const interval = setInterval(fetchMetrics, 30 * 1e3)

    return () => {
      clearInterval(interval)
      setIsMounted(false)
    }
  })

  let percent = Math.round((blockedQueries / totalQueries) * 100)
  if (totalQueries == 0) percent = 0
  return (
    <StatsWidget
      icon={GlobeIcon}
      iconColor="$primary400"
      title="Blocked DNS queries"
    >
      <VStack space="xs">
        <Text
          textAlign="right"
          size="sm"
          fontWeight={300}
          color="$muted800"
          sx={{ _dark: { color: '$muted400' } }}
        >
          {percent}% Blocked DNS Queries
        </Text>
        <VStack space="xs" alignItems="flex-end">
          <Text
            size="xl"
            color="$muted800"
            sx={{ _dark: { color: '$muted400' } }}
          >
            {new Intl.NumberFormat('fr-FR').format(blockedQueries)} blocked
          </Text>

          <Text
            size="lg"
            color="$muted400"
            sx={{ _dark: { color: '$muted400' } }}
          >
            {new Intl.NumberFormat('fr-FR').format(totalQueries)} total
          </Text>
        </VStack>
      </VStack>
    </StatsWidget>
  )
}

export const DNSBlockPercent = (props) => {
  const [totalQueries, setTotalQueries] = useState(0)
  const [blockedQueries, setBlockedQueries] = useState(0)

  useEffect(() => {
    const fetchMetrics = async () => {
      const metrics = await blockAPI.metrics()
      setTotalQueries(metrics.TotalQueries)
      setBlockedQueries(metrics.BlockedQueries)
    }

    fetchMetrics()
  }, [])

  if (!totalQueries || !blockedQueries) {
    return <></>
  }

  let data = [blockedQueries, totalQueries]
  let percent = Math.round((blockedQueries / totalQueries) * 100)
  if (totalQueries == 0) {
    percent = 0
  }

  return (
    <StatsChartWidget
      title="Percent Blocked"
      type="Doughnut"
      descriptionHide="Query block Performance"
      labels={['Blocked', 'Total']}
      data={data}
      text={`${percent}%`}
      colors={['#ef8157', '#f4f3ef']}
    />
  )
}

export default DNSMetrics
