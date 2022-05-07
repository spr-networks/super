import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { trafficAPI, wifiAPI } from 'api'
import IPInfo from 'components/IPInfo'
import { prettyDate, prettySize } from 'utils'

import {
  Badge,
  Box,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Spacer,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

import { Table } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'

const TimeSeriesList = (props) => {
  const [list, setList] = useState([])
  const [showASN, setShowASN] = useState(
    props.type.match(/^Wan(In|Out)$/) ? true : false
  )

  // filter the list depending on the interface to match the type
  const filterType = (_list, type) => {
    return _list.filter((row) => {
      let regexLAN = /^192\.168\./
      // src == lan && dst == lan
      if (
        type == 'LanIn' &&
        row.Src.match(regexLAN) &&
        row.Dst.match(regexLAN)
      ) {
        return row
      }

      if (
        type == 'LanOut' &&
        row.Src.match(regexLAN) &&
        row.Dst.match(regexLAN)
      ) {
        return row
      }

      //if (type == 'WanIn' && row.Interface == 'wlan0') {
      if (type == 'WanIn' && row.Dst.match(regexLAN)) {
        return row
      }

      //if (type == 'WanOut' && row.Interface != 'wlan0') {
      if (type == 'WanOut' && row.Src.match(regexLAN)) {
        return row
      }
    })
  }

  /*useEffect(() => {
    setShowASN(props.type.match(/^Wan(In|Out)$/) ? true : false)
  }, [props.type])*/

  useEffect(() => {
    trafficAPI.traffic().then((data) => {
      data = filterType(data, props.type)
      // the data we fetch is from now and sorted desc - 1 minute for each row
      let date = new Date()
      date.setSeconds(0)
      data = data.map((row) => {
        date.setMinutes(date.getMinutes() - 1)
        row.Timestamp = new Date(date)
        return row
      })

      if (showASN) {
        let keyIP = props.type == 'WanOut' ? 'Dst' : 'Src'
        let ips = data.map((row) => row[keyIP])
        ips = Array.from(new Set(ips))
        wifiAPI
          .asn(ips)
          .then((asns) => {
            let ip2asn = {}
            for (let asn of asns) {
              ip2asn[asn.IP] = `${asn.Name}, ${asn.Country}`
            }

            data = data.map((row) => {
              row.Asn = ip2asn[row[keyIP]]
              return row
            })

            setList(data)
          })
          .catch((err) => {
            setShowASN(false)
            setList(data)
          })
      } else {
        setList(data)
      }
    })
  }, [])

  let listFiltered = list

  // filter by ip
  if (props.ips && props.ips.length) {
    let ips = props.ips
    let field = props.type.match(/Out$/) ? 'Src' : 'Dst'
    listFiltered = listFiltered.filter((row) => ips.includes(row[field]))
  }

  // filter by date
  if (props.offset) {
    const scaleOffset = {
      '1 Hour': 60 - 1,
      '1 Day': 60 * 24 - 1,
      '15 Minutes': 15 - 1
    }

    let offset = scaleOffset[props.offset] || 0
    let d = new Date()
    d.setMinutes(d.getMinutes() - offset)
    listFiltered = offset
      ? listFiltered.filter((row) => row.Timestamp > d)
      : listFiltered
  }

  return (
    <FlatList
      data={listFiltered}
      renderItem={({ item }) => (
        <Box
          borderBottomWidth="1"
          _dark={{
            borderColor: 'muted.600'
          }}
          borderColor="muted.200"
          py="2"
        >
          <HStack
            direction={{ base: 'column', md: 'row' }}
            space={2}
            justifyContent="space-between"
          >
            <Stack
              direction={{ base: 'column', md: 'row' }}
              flex="2"
              space={2}
              justifyContent="space-between"
            >
              <HStack flex="1" space={2} justifyContent="space-between">
                <Text flex="1">{item.Src}</Text>
                <Icon
                  flex="1"
                  color="muted.200"
                  size="xs"
                  as={FontAwesomeIcon}
                  icon={faArrowRight}
                />
                <Text flex="1">{item.Dst}</Text>
              </HStack>
              {showASN ? (
                <Text flex="1" color="muted.600" isTruncated>
                  {item.Asn}
                </Text>
              ) : null}
            </Stack>

            <Stack
              direction="row"
              marginLeft="auto"
              space={2}
              flex={2 / 3}
              justifyContent="space-between"
            >
              <Badge variant="outline" color="muted.500">
                {prettySize(item.Bytes)}
              </Badge>
              <Text fontSize="xs" alignSelf="flex-start">
                {prettyDate(item.Timestamp)}
              </Text>
            </Stack>
          </HStack>
        </Box>
      )}
      keyExtractor={(item) => item.Timestamp}
    />
  )
}

export default TimeSeriesList
