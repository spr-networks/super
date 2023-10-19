import React, { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import PropTypes from 'prop-types'
import { format as timeAgo } from 'timeago.js'

import { prettyDate, prettySize } from 'utils'
import { BrandIcons } from 'FontAwesomeUtils'

import {
  ArrowRightIcon,
  Badge,
  BadgeText,
  Box,
  FlatList,
  HStack,
  Pressable,
  Text,
  VStack
} from '@gluestack-ui/themed'

//import { FlashList } from '@shopify/flash-list'

const TimeSeriesList = ({ data, type, filterIps, setFilterIps, ...props }) => {
  const regexLAN = /^192\.168\./ //TODO dont rely on this

  const [list, setList] = useState([])
  const [showASN, setShowASN] = useState(
    type.match(/^Wan(In|Out)$/) ? true : false
  )

  useEffect(() => {
    setShowASN(type.match(/^Wan(In|Out)$/) ? true : false)
    setList(data)
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

  const AsnIcon = React.memo(({ asn }) => {
    if (!asn) {
      return <></>
    }

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
          <Box p={1} _dark={{ bg: 'muted.100', rounded: 'full' }} mr={1}>
            {asnToIcon[r]}
          </Box>
        )
      }
    }

    return <></>
  })

  const onPressIp = (e) => {
    let ip = e.target.innerText

    // TODO handle this and show popover info with actions
    if (!ip || !ip.match(regexLAN)) {
      return
    }

    if (setFilterIps) {
      setFilterIps([ip])
    }
  }

  return (
    <FlatList
      estimatedItemSize={100}
      data={list}
      renderItem={({ item }) => (
        <VStack
          borderBottomWidth={1}
          borderColor="$muted200"
          py="$4"
          sx={{
            '@md': { height: '$12', py: '$2', flexDirection: 'row' },
            _dark: {
              borderColor: '$muted600'
            }
          }}
          space="md"
          justifyContent="space-between"
        >
          <VStack
            sx={{ '@md': { flexDirection: 'row' } }}
            flex={2}
            space="md"
            justifyContent="space-between"
          >
            <HStack
              flex={1}
              space="md"
              justifyContent="space-between"
              alignItems="center"
            >
              {/*['WanOut', 'LanOut', 'LanIn'].includes(type) ? (
                  <Text bold>{item.deviceSrc && item.deviceSrc.Name}</Text>
                ) : null*/}
              <Pressable flex={1} onPress={onPressIp}>
                <Text size="sm">{item.Src}</Text>
              </Pressable>
              <Box alignText="center">
                <ArrowRightIcon color="$muted200" />
              </Box>
              {/*['WanIn', 'LanOut', 'LanIn'].includes(type) ? (
                  <Text bold>{item.deviceDst && item.deviceDst.Name}</Text>
                ) : null*/}
              <Pressable flex={1} onPress={onPressIp}>
                <Text size="sm" textAlign="right">
                  {item.Dst}
                </Text>
              </Pressable>
            </HStack>
            {showASN ? (
              <HStack flex={1} alignItems="center">
                {/*TODO also src depending on type*/}
                <AsnIcon asn={item.Asn} />
                <Text color="$muted500" isTruncated>
                  {item.Asn}
                </Text>
              </HStack>
            ) : null}
          </VStack>

          <HStack
            space="md"
            flex={1}
            justifyContent="space-between"
            alignItems="center"
            sx={{ '@md': { justifyContent: 'flex-end' } }}
          >
            <Text size="xs">{timeAgo(item.Timestamp)}</Text>
            <Badge action="muted" variant="outline" alignSelf="center">
              <BadgeText>{prettySize(item.Bytes)}</BadgeText>
            </Badge>
          </HStack>
        </VStack>
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
