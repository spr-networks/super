import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { format as timeAgo } from 'timeago.js'

import { trafficAPI, wifiAPI } from 'api'
import { prettyDate, prettySize } from 'utils'
import { BrandIcons } from 'FontAwesomeUtils'

import { Badge, Box, FlatList, Stack, HStack, Text } from 'native-base'

import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
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
      if (
        type == 'WanIn' &&
        row.Dst.match(regexLAN) &&
        !row.Src.match(regexLAN)
      ) {
        return row
      }

      //if (type == 'WanOut' && row.Interface != 'wlan0') {
      if (
        type == 'WanOut' &&
        row.Src.match(regexLAN) &&
        !row.Dst.match(regexLAN)
      ) {
        return row
      }
    })
  }

  const refreshList = () => {
    //trafficAPI.traffic().then((data) => {
    let data = props.data
    data = filterType(data, props.type)
    // the data we fetch is from now and sorted desc - 1 minute for each row
    /*let date = new Date()
    date.setSeconds(0)
    data = data.map((row) => {
      date.setMinutes(date.getMinutes() - 1)
      row.Timestamp = new Date(date)
      return row
    })*/

    if (showASN) {
      let keyIP = props.type == 'WanOut' ? 'Dst' : 'Src'
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

          data = data.map((row) => {
            let asn = ip2asn[row[keyIP]]
            if (asn) {
              row.Asn = asn
            }

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
    //})
  }

  useEffect(() => {
    //setShowASN(props.type.match(/^Wan(In|Out)$/) ? true : false)
    refreshList()
  }, [props.data, props.type])

  let listFiltered = list

  // filter by ip
  if (props.ips && props.ips.length) {
    let ips = props.ips
    let field = props.type.match(/Out$/) ? 'Src' : 'Dst'
    listFiltered = listFiltered.filter((row) => ips.includes(row[field]))
  }

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
      'AKAMAI-ASN1': <BrandIcons.Akamai />,
      'AMAZON-02': <BrandIcons.AmazonAWS />,
      'AMAZON-AES': <BrandIcons.AmazonAWS />,
      'APPLE-AUSTIN': <BrandIcons.Apple />,
      'APPLE-ENGINEERING': <BrandIcons.Apple />,
      AUTOMATTIC: <BrandIcons.Automattic />,
      BLIZZARD: <BrandIcons.BattleNet />,
      CLOUDFLARENET: <BrandIcons.Cloudflare />,
      'DIGITALOCEAN-ASN': <BrandIcons.DigitalOcean />,
      EDGECAST: <BrandIcons.Edgecast />,
      FACEBOOK: <BrandIcons.Facebook />,
      FASTLY: <BrandIcons.Fastly />,
      GITHUB: <BrandIcons.Github />,
      GOOGLE: <BrandIcons.Google />,
      'HETZNER-AS': <BrandIcons.Hetzner />,
      'LINODE-AP Linode': <BrandIcons.Linode />,
      NETFLIX: <BrandIcons.Netflix />,
      OVH: <BrandIcons.OVH />,
      WIKIMEDIA: <BrandIcons.Wikipedia />,
      'MICROSOFT-CORP-MSN-AS-BLOCK': <BrandIcons.MicrosoftAzure />,
      'AKAMAI-AS': <BrandIcons.Akamai />,
      'ALIBABA-CN-NET Hangzhou Alibaba Advertising Co.': (
        <BrandIcons.AlibabaCloud />
      ),
      'TAOBAO Zhejiang Taobao Network Co.': <BrandIcons.Taobao />
    }

    if (asnToIcon[asnName]) {
      return <>{asnToIcon[asnName]}</>
    }

    return <></>
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
                <Box flex="1" justifyContent="center">
                  <Icon color="muted.200" icon={faArrowRight} size="xs" />
                </Box>
                <Text flex="1">{item.Dst}</Text>
              </HStack>
              {showASN ? (
                <HStack space={1} flex="1">
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
              <Badge variant="outline" color="muted.500">
                {prettySize(item.Bytes)}
              </Badge>
              <Text fontSize="xs" alignSelf="flex-start">
                {timeAgo(item.Timestamp)}
              </Text>
            </Stack>
          </HStack>
        </Box>
      )}
      keyExtractor={(item, index) => item.Src + item.Dst + item.Bytes}
    />
  )
}

TimeSeriesList.propTypes = {
  type: PropTypes.string.isRequired
}

export default TimeSeriesList
