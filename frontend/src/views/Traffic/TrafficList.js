import React, { useContext, useState, useEffect } from 'react'
import {
  Box,
  HStack,
  Radio,
  Stack,
  Icon,
  Image,
  Text,
  VStack,
  useBreakpointValue,
  useColorModeValue,
  SectionList,
  createIcon,
  ScrollView
} from 'native-base'

import { AlertContext } from 'layouts/Admin'
import TimeSeriesList from 'components/Traffic/TimeSeriesList'
import ClientSelect from 'components/ClientSelect'
import DateRange from 'components/DateRange'

import { deviceAPI, trafficAPI, wifiAPI } from 'api'

const TrafficList = (props) => {
  const context = useContext(AlertContext)
  const regexLAN = /^192\.168\./

  const [list, setList] = useState([])
  const [listFiltered, setListFiltered] = useState([])
  const [type, setType] = useState('WanOut')
  const [filterIps, setFilterIps] = useState([])
  const [offset, setOffset] = useState('All Time')
  const [devices, setDevices] = useState({})
  const [asns, setAsns] = useState({})
  const [showASN, setShowASN] = useState(
    type.match(/^Wan(In|Out)$/) ? true : false
  )

  // filter the list by type and ip
  const filterList = (data) => {
    // filter by ip
    if (filterIps && filterIps.length) {
      let field = type.match(/Out$/) ? 'Src' : 'Dst'
      data = data.filter((row) => filterIps.includes(row[field]))
    }

    // by type
    return data
      .filter((row) => {
        // src == lan && dst == lan

        //TODO diff between LanIn|Out on interface
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
      .map((row) => {
        row.Asn = asns[row[type == 'WanOut' ? 'Dst' : 'Src']] || ''
        return row
      })
  }

  const refreshList = () => {
    //console.log('refreshList')
    trafficAPI
      .traffic()
      .then((data) => {
        // TODO merge list with previous & set expire=timeout if  theres a change in packets/bytes
        if (list.length) {
          data = data.map((row) => {
            let idx = list.findIndex(
              (prow) => prow.Src == row.Src && prow.Dst == row.Dst
            )

            if (idx < 0) {
              // new entry
            } else if (row.Packets > list[idx].Packets) {
              // time window here between each interval but we treat it as "just now"
              row.Expires = row.Timeout
            }

            return row
          })
        }

        data.sort((a, b) => b.Expires - a.Expires || b.Dst - a.Dst)
        setList(
          data.map((row) => {
            let msAgo = (row.Timeout - row.Expires) * 1e3
            row.Timestamp = new Date(new Date().getTime() - msAgo)

            return row
          })
        )
      })
      .catch((err) => reject(err))
  }

  const refreshAsns = () => {
    //console.log('refreshAsns')
    if (!type.match(/^Wan(In|Out)$/) || !list.length) {
      return
    }

    let keyIP = type == 'WanOut' ? 'Dst' : 'Src'
    let ips = list.map((row) => row[keyIP])
    ips = Array.from(new Set(ips))
    if (!ips.length) {
      return
    }

    let ipsasn = ips.filter((ip) => !Object.keys(asns).includes(ip))

    if (!ipsasn.length) {
      // set asns to trigger list update
      return
    }

    wifiAPI
      .asns(ipsasn)
      .then((newAsns) => {
        let _asns = { ...asns }
        for (let asn of newAsns) {
          _asns[asn.IP] = asn.Name.length ? `${asn.Name}, ${asn.Country}` : ''
        }

        setAsns(_asns)
      })
      .catch((err) => {
        console.log('asn error:', err)
      })
  }

  useEffect(() => {
    //console.log('eall')

    if (!list.length) {
      return
    }

    refreshAsns()

    setListFiltered(filterList(list))
  }, [devices, list, type, asns])

  useEffect(() => {
    refreshList()

    const interval = setInterval(refreshList, 10 * 1e3)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setListFiltered(filterList(list))
  }, [asns])

  const flexDirection = useBreakpointValue({
    base: 'column',
    lg: 'row'
  })

  let types = ['WanOut', 'WanIn', 'LanIn', 'LanOut']

  const handleChangeClient = (ips) => {
    setFilterIps(ips)
  }

  return (
    <>
      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        rounded={{ base: 'none', md: 'md' }}
        width="100%"
        p={4}
        mb={4}
      >
        <Stack direction={flexDirection} space={2}>
          <Radio.Group
            flex={1}
            name="trafficType"
            defaultValue={type}
            accessibilityLabel="select type"
            onChange={(type) => {
              setFilterIps([])
              setType(type)
            }}
          >
            <HStack alignItems="center" space={4}>
              {types.map((type) => (
                <Radio
                  key={type}
                  value={type}
                  colorScheme="primary"
                  size="sm"
                  my={1}
                >
                  {type.replace(/(In|Out)/, ' $1')}
                </Radio>
              ))}
            </HStack>
          </Radio.Group>
          <Box flex={1}>
            <ClientSelect
              isMultiple
              value={filterIps}
              onChange={handleChangeClient}
            />
          </Box>
        </Stack>
      </Box>
      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        rounded={{ base: 'none', md: 'md' }}
        width="100%"
        p={4}
        mb={4}
      >
        <ScrollView h="100%">
          <TimeSeriesList
            type={type}
            data={listFiltered}
            offset={offset}
            filterIps={filterIps}
            setFilterIps={setFilterIps}
          />
        </ScrollView>
      </Box>
    </>
  )
}

export default TrafficList
