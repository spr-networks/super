import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { format as timeAgo } from 'timeago.js'

import { trafficAPI, wifiAPI } from 'api'
import { prettyDate, prettySize } from 'utils'
import { BrandIcons } from 'FontAwesomeUtils'

import {
  Badge,
  Box,
  FlatList,
  Stack,
  HStack,
  Pressable,
  Text
} from 'native-base'

import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'

const TimeSeriesList = ({ data, type, filterIps, setFilterIps, ...props }) => {
  const regexLAN = /^192\.168\./

  const [list, setList] = useState([])
  const [showASN, setShowASN] = useState(
    type.match(/^Wan(In|Out)$/) ? true : false
  )

  const refreshList = () => {
    if (showASN) {
      let keyIP = type == 'WanOut' ? 'Dst' : 'Src'
      let ips = data.map((row) => row[keyIP])
      ips = Array.from(new Set(ips))
      if (!ips.length) {
        return
      }

      wifiAPI
        .asns(ips)
        .then((asns) => {
          let ip2asn = {}
          for (let asn of asns) {
            if (!asn.Name.length) {
              continue
            }

            ip2asn[asn.IP] = `${asn.Name}, ${asn.Country}`
          }

          setList(
            data.map((row) => {
              let asn = ip2asn[row[keyIP]]
              if (asn) {
                row.Asn = asn
              }

              return row
            })
          )
        })
        .catch((err) => {
          setShowASN(false)
          setList(data)
        })
    } else {
      setList(data)
    }
  }

  useEffect(() => {
    //setShowASN(type.match(/^Wan(In|Out)$/) ? true : false)
    refreshList()
  }, [data, type])

  // filter by date
  /*
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
  }*/

  const asnIcon = (asn) => {
    let [asnName] = asn.split(',')
    const asnToIcon = {
      AKAMAI: <BrandIcons.Akamai />,
      AMAZON: <BrandIcons.AmazonAWS />,
      APPLE: <BrandIcons.Apple />,
      AUTOMATTIC: <BrandIcons.Automattic />,
      BLIZZARD: <BrandIcons.BattleNet />,
      CLOUDFLARENET: <BrandIcons.Cloudflare />,
      DIGITALOCEAN: <BrandIcons.DigitalOcean />,
      EDGECAST: <BrandIcons.Edgecast />,
      FACEBOOK: <BrandIcons.Facebook />,
      FASTLY: <BrandIcons.Fastly />,
      GITHUB: <BrandIcons.Github />,
      GOOGLE: <BrandIcons.Google />,
      HETZNER: <BrandIcons.Hetzner />,
      HUAWEI: <BrandIcons.Huawei />,
      LINODE: <BrandIcons.Linode />,
      NETFLIX: <BrandIcons.Netflix />,
      OVH: <BrandIcons.OVH />,
      WIKIMEDIA: <BrandIcons.Wikipedia />,
      MICROSOFT: <BrandIcons.MicrosoftAzure />,
      ALIBABA: <BrandIcons.AlibabaCloud />,
      TAOBAO: <BrandIcons.Taobao />,
      TWITTER: <BrandIcons.Twitter />,
      STACKPATH: <BrandIcons.StackPath />
    }

    for (let r in asnToIcon) {
      if (asnName.match(new RegExp(`${r}`))) {
        return (
          <Box p={1} _dark={{ bg: 'muted.100', rounded: 'full' }}>
            {asnToIcon[r]}
          </Box>
        )
      }
    }

    return <></>
  }

  const onPressIp = (e) => {
    let ip = e.target.innerText

    // TODO handle this and show popover info with actions
    if (!ip.match(regexLAN)) {
      return
    }

    if (setFilterIps) {
      setFilterIps([ip])
    }
  }

  return (
    <FlatList
      data={list}
      renderItem={({ item }) => (
        <Box
          borderBottomWidth={1}
          _dark={{
            borderColor: 'muted.600'
          }}
          borderColor="muted.200"
          py={2}
        >
          <HStack
            direction={{ base: 'column', md: 'row' }}
            space={2}
            justifyContent="space-between"
          >
            <Stack
              direction={{ base: 'column', md: 'row' }}
              flex={2}
              space={2}
              justifyContent="space-between"
            >
              <HStack
                flex={1}
                space={2}
                justifyContent="space-between"
                alignItems="center"
              >
                <Pressable flex={1} onPress={onPressIp}>
                  {['WanOut', 'LanOut', 'LanIn'].includes(type) ? (
                    <Text bold>{item.deviceSrc && item.deviceSrc.Name}</Text>
                  ) : null}
                  <Text>{item.Src}</Text>
                </Pressable>
                <Box flex={1} justifyContent="center">
                  <Icon color="muted.200" icon={faArrowRight} size="xs" />
                </Box>
                <Pressable flex={1} onPress={onPressIp}>
                  {['WanIn', 'LanOut', 'LanIn'].includes(type) ? (
                    <Text bold>{item.deviceDst && item.deviceDst.Name}</Text>
                  ) : null}
                  <Text>{item.Dst}</Text>
                </Pressable>
              </HStack>
              {showASN ? (
                <HStack flex={1} space={2} alignItems="center">
                  {asnIcon(item.Asn)}
                  <Text color="muted.600" isTruncated>
                    {item.Asn}
                  </Text>
                </HStack>
              ) : null}
            </Stack>

            <Stack
              direction="row"
              marginLeft="auto"
              space={2}
              flex={2 / 3}
              justifyContent="space-between"
            >
              <Badge alignSelf="center" variant="outline" color="muted.500">
                {prettySize(item.Bytes)}
              </Badge>
              <Text fontSize="xs" alignSelf="flex-start">
                {timeAgo(item.Timestamp)}
              </Text>
            </Stack>
          </HStack>
        </Box>
      )}
      keyExtractor={(item) => item.Src + item.Dst + item.Bytes}
    />
  )
}

TimeSeriesList.propTypes = {
  data: PropTypes.array,
  filterIps: PropTypes.array,
  setFilterIps: PropTypes.func,
  type: PropTypes.string.isRequired
}

export default TimeSeriesList
