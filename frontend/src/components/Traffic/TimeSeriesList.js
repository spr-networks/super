import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { format as timeAgo } from 'timeago.js'

import { prettySize } from 'utils'
import { BrandIcons } from 'IconUtils'

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
import { AppContext, ModalContext } from 'AppContext'
import { copy } from 'utils'
import DeviceItem from 'components/Devices/DeviceItem'
import { Tooltip } from 'components/Tooltip'

const TimeSeriesList = ({ data, type, filterIps, setFilterIps, ...props }) => {
  const context = useContext(AppContext)
  const modalContext = useContext(ModalContext)

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
      TELEGRAM: <BrandIcons.Telegram />,
      TWITTER: <BrandIcons.Twitter />,
      STACKPATH: <BrandIcons.StackPath />
    }

    for (let r in asnToIcon) {
      if (asnName.match(new RegExp(`${r}`))) {
        return (
          <Box
            p={1}
            sx={{
              _dark: { bg: '$muted100', rounded: '$full' }
            }}
            mr={1}
          >
            {asnToIcon[r]}
          </Box>
        )
      }
    }

    return <></>
  })

  const onPressIp = (ip) => {
    if (ip.match(regexLAN) && setFilterIps) {
      setFilterIps([ip])
      return
    }

    return copy(ip)
    // TODO handle this and show popover info with actions
    //modalContext.modal(`${ip}`, <Text>{JSON.stringify(ip)}</Text>)
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
            flex={5}
            space="md"
            justifyContent="space-between"
            sx={{ '@md': { flexDirection: 'row' } }}
          >
            <VStack
              flex={2}
              space="md"
              justifyContent="space-between"
              sx={{ '@md': { flexDirection: 'row', alignItems: 'center' } }}
            >
              <VStack sx={{ '@md': { flex: type.match(/Out$/) ? 2 : 3 } }}>
                <Tooltip label={item.SrcDomain}>
                  <Text size="sm" bold isTruncated>
                    {item.SrcDomain}
                  </Text>
                </Tooltip>
                {type == 'WanOut' ? (
                  <DeviceItem
                    item={context.getDevice(item.Src, 'RecentIP')}
                    size="sm"
                  />
                ) : (
                  <Text size="sm" onPress={() => onPressIp(item.Src)}>
                    {item.Src}
                  </Text>
                )}
              </VStack>
              <Box
                alignText="center"
                display="none"
                sx={{ '@md': { display: 'flex' } }}
              >
                <ArrowRightIcon color="$muted200" />
              </Box>
              <VStack flex={type.match(/Out$/) ? 3 : 2}>
                <Tooltip label={item.DstDomain}>
                  <Text size="sm" bold isTruncated>
                    {item.DstDomain}
                  </Text>
                </Tooltip>
                {type == 'WanIn' ? (
                  <DeviceItem
                    item={context.getDevice(item.Dst, 'RecentIP')}
                    size="sm"
                  />
                ) : (
                  <Text size="sm" onPress={() => onPressIp(item.Dst)}>
                    {item.Dst}
                  </Text>
                )}
              </VStack>
            </VStack>
            {showASN ? (
              <HStack flex={1} space="sm" alignItems="center">
                {/*TODO also src depending on type*/}
                <AsnIcon asn={item.Asn} />
                <Text color="$muted500" size="xs" isTruncated>
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
            <Badge
              size="sm"
              action="muted"
              variant="outline"
              alignSelf="center"
            >
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
