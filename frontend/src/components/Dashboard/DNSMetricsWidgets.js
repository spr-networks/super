import React, { useEffect, useState, Component } from 'react'
import { faBan, faEarthAmericas } from '@fortawesome/free-solid-svg-icons'

import { blockAPI } from 'api/DNS'
import StatsWidget from './StatsWidget'
import StatsChartWidget from './StatsChartWidget'

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
      icon={faEarthAmericas}
      iconColor="green.400"
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
      icon={faBan}
      iconColor="red400"
      title="Blocked DNS queries"
      text={blockedQueries}
    />
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
