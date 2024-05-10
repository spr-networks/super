import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatsChartWidget from './StatsChartWidget'
import StatsWidget from './StatsWidget'
import { AppContext } from 'AppContext'
import { trafficAPI } from 'api'
import { prettySize } from 'utils'

import {
  Box,
  Heading,
  HStack,
  Icon,
  Pressable,
  Text,
  useColorMode,
  VStack
} from '@gluestack-ui/themed'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react-native'
import DeviceItem from 'components/Devices/DeviceItem'

export const TotalTraffic = (props) => {
  const [data, setData] = useState([])
  let labels = ['WanIn', 'WanOut']

  useEffect(() => {
    const fetchData = () => {
      trafficAPI.history().then((history) => {
        let traffic = {}

        labels.map((label) => (traffic[label] = []))

        let start = new Date(),
          step = 20

        // last hour if not enough traffic - reboots
        if (history.length < 1e3) {
          step = 3
        }

        for (let i = 0; i < history.length - 2; i += step) {
          if (i >= 20 * step) break

          labels.map((label) => {
            let h1 = Object.values(history[i])
              .map((t) => t[label])
              .reduce((prev, v) => prev + v, 0)

            let h2 = Object.values(history[i + 1])
              .map((t) => t[label])
              .reduce((prev, v) => prev + v, 0)

            let x = new Date(start)
            x.setMinutes(start.getMinutes() - i)
            let y = h1 - h2

            traffic[label].push({ x, y })
          })
        }

        setData(Object.values(traffic))
      })
    }

    fetchData()

    const interval = setInterval(fetchData, 60 * 1e3)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return (
    <StatsChartWidget
      title="Outbound Traffic"
      type="Line"
      labels={labels}
      data={data}
    />
  )
}

export const DeviceTraffic = ({ minutes, showEmpty, ...props }) => {
  const context = useContext(AppContext)
  const [total, setTotal] = useState([])
  const navigate = useNavigate()

  let windowMinutes = minutes || 60

  const fetchData = () => {
    trafficAPI
      .history()
      .then((history) => {
        let start = new Date(),
          numMinutes = 0
        let items = [],
          total = {}
        // last 15min
        for (let timeWindow of history.slice(0, windowMinutes)) {
          let time = new Date(start)
          time.setMinutes(start.getMinutes() - numMinutes++)

          for (let ip in timeWindow) {
            let { WanIn, WanOut } = timeWindow[ip]

            if (!total[ip]) {
              total[ip] = { ip, WanIn: [WanIn], WanOut: [WanOut] }
            } else {
              total[ip] = {
                ip,
                WanIn: [...total[ip].WanIn, WanIn],
                WanOut: [...total[ip].WanOut, WanOut]
              }
            }
          }
        }

        let totalWithData = Object.values(total)

        if (!showEmpty) {
          totalWithData = totalWithData.filter((v) => {
            return diffSize(v.WanIn) && diffSize(v.WanOut)
          })
        }

        totalWithData.sort((a, b) => {
          return diffSize(b.WanIn) - diffSize(a.WanIn)
        })

        setTotal(totalWithData)
      })
      .catch((err) => {})
  }

  useEffect(() => {
    fetchData()
  }, [])

  let diffSize = (szs) => {
    return szs[0] - szs[szs.length - 1]
  }

  let title = `Traffic Last ${windowMinutes} minutes`
  if (windowMinutes / 60 >= 1) {
    let h = Math.floor(windowMinutes / 60)
    title = `Traffic Last ${h > 1 ? `${h} hours` : 'hour'}`
  }

  return (
    <VStack
      bg={
        useColorMode() == 'light'
          ? '$backgroundCardLight'
          : '$backgroundCardDark'
      }
      space="md"
      borderRadius={10}
      p="$4"
      {...props}
    >
      <Heading size="md" fontWeight={300}>
        {title}
      </Heading>
      <VStack space="md">
        {total.map((item) => (
          <HStack space="sm" key={item.ip}>
            <Pressable
              flex={1}
              onPress={() => navigate(`/admin/trafficlist/${item.ip}`)}
            >
              <DeviceItem
                size="sm"
                item={context.getDevice(item.ip, 'RecentIP')}
                noPress
              />
            </Pressable>
            <HStack flex={1} space="xs" justifyContent="flex-end">
              <HStack space="sm" alignItems="center" justifyContent="flex-end">
                <Icon size="xs" as={ArrowDownIcon} />
                <Text size="xs">{prettySize(diffSize(item.WanIn))}</Text>
              </HStack>
              <HStack space="sm" alignItems="center" justifyContent="flex-end">
                <Icon size="xs" as={ArrowUpIcon} />
                <Text size="xs">{prettySize(diffSize(item.WanOut))}</Text>
              </HStack>
            </HStack>
          </HStack>
        ))}
      </VStack>
    </VStack>
  )
}
