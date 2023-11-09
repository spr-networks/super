import React, { useContext, useEffect, useState } from 'react'
// react plugin used to create charts
import { Chart as ChartJS } from 'chart.js/auto'
import { Bar } from 'react-chartjs-2'

import { deviceAPI, trafficAPI } from 'api'
import DateRange from 'components/DateRange'
import { AlertContext } from 'layouts/Admin'
import { prettySize } from 'utils'

import {
  Box,
  ButtonGroup,
  Heading,
  HStack,
  VStack,
  ScrollView,
  Text
} from '@gluestack-ui/themed'

export default (props) => {
  const context = useContext(AlertContext)
  const [lan, setLan] = useState({ totalIn: 0, totalOut: 0 })
  const [wan, setWan] = useState({ totalIn: 0, totalOut: 0 })
  const [lanScale, setLanScale] = useState('All Time')
  const [wanScale, setWanScale] = useState('All Time')
  const [devices, setDevices] = useState([])

  const processTrafficHistory = async (target, scale) => {
    let processData = (data_in, data_out) => {
      if (!data_in || !data_out) {
        return
      }

      let data = {
        labels: [],
        datasets: [
          {
            label: 'Down',
            borderColor: '#fcc468',
            fill: true,
            backgroundColor: '#fcc468',
            hoverBorderColor: '#fcc468',
            borderWidth: 1,
            barPercentage: 0.7,
            data: []
          },
          {
            label: 'Up',
            borderColor: '#4cbdd7',
            fill: true,
            backgroundColor: '#4cbdd7',
            hoverBorderColor: '#4cbdd7',
            borderWidth: 1,
            barPercentage: 0.7,
            data: []
          }
        ]
      }

      let totalOut = 0
      let totalIn = 0

      let traffic = { Incoming: data_in, Outgoing: data_out }

      let d = {}

      let normalize = (f) => {
        return (f * 1.0) / 1024.0 / 1024.0
      }

      for (const entry of traffic['Outgoing']) {
        if (!d[entry['IP']]) {
          d[entry['IP']] = {}
        }
        totalOut += entry['Bytes']
        d[entry['IP']]['Out'] = normalize(entry['Bytes'])
      }

      for (const entry of traffic['Incoming']) {
        if (!d[entry['IP']]) {
          d[entry['IP']] = {}
        }
        totalIn += entry['Bytes']
        d[entry['IP']]['In'] = normalize(entry['Bytes'])
      }

      let d_labels = []
      let d_in = []
      let d_out = []

      for (const ip of Object.keys(d)) {
        d_labels.push(ip)
        d_in.push(d[ip]['In'])
        d_out.push(d[ip]['Out'])
      }

      data.labels = d_labels
      data.datasets[0].data = d_in
      data.datasets[1].data = d_out
      data.totalIn = totalIn
      data.totalOut = totalOut
      return data
    }

    let do_time_series = scale != 'All Time'

    if (do_time_series) {
      let traffic_series = await trafficAPI.history().catch((error) => {
        context.error('API Failure get traffic history: ' + error.message)
      })

      let recent_reading = traffic_series[0]

      const scaleOffset = {
        '1 Hour': 60 - 1,
        '1 Day': 60 * 24 - 1,
        '15 Minutes': 15 - 1
      }

      let offset = scaleOffset[scale] || 0

      if (offset >= traffic_series.length) {
        offset = traffic_series.length - 1
      }
      let previous_reading = traffic_series[offset]

      //get delta for each IP in the traffic set
      let clientsLanIn = {}
      let clientsLanOut = {}
      let clientsWanIn = {}
      let clientsWanOut = {}

      for (const IP in recent_reading) {
        clientsLanIn[IP] = recent_reading[IP].LanIn
        clientsWanIn[IP] = recent_reading[IP].WanIn
        clientsLanOut[IP] = recent_reading[IP].LanOut
        clientsWanOut[IP] = recent_reading[IP].WanOut
      }

      //subtract delta from the previous reading
      for (const IP in recent_reading) {
        if (previous_reading[IP]) {
          if (previous_reading[IP].LanIn < clientsLanIn[IP])
            clientsLanIn[IP] -= previous_reading[IP].LanIn
          if (previous_reading[IP].WanIn < clientsWanIn[IP])
            clientsWanIn[IP] -= previous_reading[IP].WanIn
          if (previous_reading[IP].LanOut < clientsLanOut[IP])
            clientsLanOut[IP] -= previous_reading[IP].LanOut
          if (previous_reading[IP].WanOut < clientsWanOut[IP])
            clientsWanOut[IP] -= previous_reading[IP].WanOut
        }
      }

      let dataIn = target == 'lan' ? clientsLanIn : clientsWanIn
      let dataOut = target == 'lan' ? clientsLanOut : clientsWanOut
      let dataPointsIn = []
      let dataPointsOut = []
      for (const ip in dataIn) {
        dataPointsIn.push({ IP: ip, Bytes: dataIn[ip] })
      }
      for (const ip in dataOut) {
        dataPointsOut.push({ IP: ip, Bytes: dataOut[ip] })
      }
      return processData(dataPointsIn, dataPointsOut)
    } else {
      //data for all time traffic
      const traffic_in = await trafficAPI
        .traffic('incoming_traffic_' + target)
        .catch((error) => {
          console.error('API Failure get traffic: ' + error.message)
        })
      const traffic_out = await trafficAPI
        .traffic('outgoing_traffic_' + target)
        .catch((error) => {
          console.error(
            'API Failure get ' + target + ' traffic: ' + error.message
          )
        })
      return processData(traffic_in, traffic_out)
    }
  }

  const fetchData = async () => {
    try {
      let devices = await deviceAPI.list()
      setDevices(Object.values(devices))
    } catch (err) {
      context.error(err)
    }

    let lan_data = await processTrafficHistory('lan', lanScale)
    let wan_data = await processTrafficHistory('wan', wanScale)

    if (lan_data) {
      setLan(lan_data)
    }
    if (wan_data) {
      setWan(wan_data)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const deviceByIp = (ip) => {
    return devices.find((dev) => dev.RecentIP == ip)
  }

  const deviceNameOrIp = (ip) => {
    return deviceByIp(ip)?.Name || ip
  }

  let templateData = {
    options: {
      indexAxis: 'x',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          intersect: false,
          position: 'nearest',
          caretSize: 5,
          callbacks: {
            label: (context) => {
              let label = context.dataset.label || ''
              let sz = `${context.raw.toFixed(2)} MB`
              return `${label}: ${sz}`
            },
            beforeBody: (TooltipItems, object) => {
              let ip = TooltipItems[0].label
              let label = deviceByIp(ip)?.MAC

              let name = deviceNameOrIp(ip)

              if (name) {
                label = label + '  ' + name
              }

              return label
            }
          }
        }
      },
      scales: {
        y: {
          min: 0.01,
          type: 'logarithmic',
          ticks: {
            callback: function (value, index, values) {
              return value + 'MB'
            },
            includeBounds: true,
            color: '#9f9f9f',
            maxTicksLimit: 5
          },
          grid: {
            zeroLineColor: 'transparent',
            display: true,
            drawBorder: false,
            color: '#9f9f9f'
          }
        },
        x: {
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            padding: 20,
            color: '#9f9f9f'
          }
        }
      }
    }
  }

  const handleChangeTime = (scale, choice) => {
    if (choice == 'lan') {
      setLanScale(scale)
    } else {
      setWanScale(scale)
    }

    processTrafficHistory(choice, scale).then((result) => {
      if (choice == 'lan') {
        setLan(result)
      } else {
        setWan(result)
      }
    })
  }

  return (
    <ScrollView sx={{ '@md': { height: '92vh' } }}>
      <VStack space="md">
        <Box
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' }
          }}
          p="$4"
        >
          <HStack alignItems="center">
            <VStack>
              <Heading size="sm">Device WAN Traffic</Heading>
              <Text color="$muted500">
                IN: {prettySize(wan.totalIn)}, OUT: {prettySize(wan.totalOut)}
              </Text>
            </VStack>
            <ButtonGroup size="sm" marginLeft="auto">
              <DateRange
                defaultValue={wanScale}
                onChange={(newValue) => handleChangeTime(newValue, 'wan')}
              />
            </ButtonGroup>
          </HStack>
          <Box>
            {wan.datasets ? (
              <Bar data={wan} options={templateData.options} />
            ) : null}
          </Box>
        </Box>
        <Box
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' }
          }}
          p="$4"
          mb="$4"
        >
          <HStack alignItems="center">
            <VStack>
              <Heading size="sm">Device LAN Traffic</Heading>
              <Text color="$muted500">
                IN: {prettySize(lan.totalIn)}, OUT: {prettySize(lan.totalOut)}
              </Text>
            </VStack>
            <ButtonGroup size="sm" marginLeft="auto">
              <DateRange
                defaultValue={lanScale}
                onChange={(newValue) => handleChangeTime(newValue, 'lan')}
              />
            </ButtonGroup>
          </HStack>
          <Box>
            {lan && lan.datasets ? (
              <Bar data={lan} options={templateData.options} />
            ) : null}
          </Box>
        </Box>
      </VStack>
    </ScrollView>
  )
}
