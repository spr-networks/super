import React, { useContext, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  RadioGroup,
  Radio,
  RadioIndicator,
  RadioIcon,
  RadioLabel,
  VStack,
  View,
  CircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon
} from '@gluestack-ui/themed'

import { AlertContext } from 'layouts/Admin'
import TimeSeriesList from 'components/Traffic/TimeSeriesList'
import ClientSelect from 'components/ClientSelect'

import { trafficAPI, wifiAPI } from 'api'

const TrafficList = (props) => {
  const context = useContext(AlertContext)
  const regexLAN = /^192\.168\./ //TODO dont rely on this

  const [list, setList] = useState([])
  const [listFiltered, setListFiltered] = useState([])
  const [type, setType] = useState('WanOut')
  const [filterIps, setFilterIps] = useState([])
  const [offset, setOffset] = useState('All Time')
  const [devices, setDevices] = useState({})
  const [asns, setAsns] = useState({})
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const params = useParams()
  const navigate = useNavigate()

  const perPage = 13

  // filter the list by type and ip
  const filterList = (data) => {
    // filter by ip
    if (filterIps && filterIps.length) {
      let field = type.match(/Out$/) ? 'Src' : 'Dst'
      data = data.filter((row) => filterIps.includes(row[field]))
    }

    setTotal(data.length)

    // by type
    let listFiltered = data
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

    let offset = (page - 1) * perPage

    listFiltered = listFiltered.slice(offset, offset + perPage)

    return listFiltered
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
      .catch((err) => context.error(err))
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
    if (!list.length) {
      return
    }

    refreshAsns()

    setListFiltered(filterList(list))
  }, [devices, list, type, filterIps, asns])

  useEffect(() => {
    if (filterIps.length) {
      navigate(`/admin/trafficlist/${filterIps.join(',')}`)
    }
  }, [filterIps])

  //init
  useEffect(() => {
    let { ips } = params
    if (ips != ':ips') {
      ips = ips.split(',')
      setFilterIps(ips)
    }
    refreshList()

    const interval = setInterval(refreshList, 10 * 1e3)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setListFiltered(filterList(list))
  }, [asns, page])

  let types = ['WanOut', 'WanIn', 'LanIn', 'LanOut']

  const handleChangeClient = (ip) => {
    setFilterIps([ip])
    setPage(1)
  }

  return (
    <View h="100%" sx={{ '@md': { height: '92vh' } }}>
      <VStack
        bg="$backgroundCardLight"
        minHeight={100}
        sx={{
          '@lg': { flexDirection: 'row', minHeight: 60 },
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
        space="md"
      >
        <RadioGroup
          flex={1}
          defaultValue={type}
          accessibilityLabel="Select Type"
          onChange={(type) => {
            setFilterIps([])
            setType(type)
            setPage(1)
          }}
        >
          <HStack py="$1" space="md">
            {types.map((type) => (
              <Radio key={type} value={type} size="md">
                <RadioIndicator mr="$2">
                  <RadioIcon as={CircleIcon} strokeWidth={1} />
                </RadioIndicator>
                <RadioLabel size="sm">
                  {type.replace(/(In|Out)/, ' $1')}
                </RadioLabel>
              </Radio>
            ))}
          </HStack>
        </RadioGroup>
        <Box flex={1}>
          <ClientSelect
            size="sm"
            value={filterIps && filterIps[0]}
            onChange={handleChangeClient}
            onSubmitEditing={handleChangeClient}
          />
        </Box>
      </VStack>

      <Box
        flex={2}
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        px="$4"
      >
        <TimeSeriesList
          type={type}
          data={listFiltered}
          offset={offset}
          filterIps={filterIps}
          setFilterIps={setFilterIps}
        />
      </Box>
      {total > perPage ? (
        <HStack space="md" alignItems="flex-start">
          <Button
            flex={1}
            variant="link"
            isDisabled={page <= 1}
            onPress={() => setPage(page > 1 ? page - 1 : 1)}
          >
            <ButtonIcon as={ArrowLeftIcon} mr="$1" />
            <ButtonText>Previous</ButtonText>
          </Button>
          <Button flex={1} variant="link" onPress={() => setPage(page + 1)}>
            <ButtonText>Next</ButtonText>
            <ButtonIcon as={ArrowRightIcon} ml="$1" />
          </Button>
        </HStack>
      ) : null}
    </View>
  )
}

export default TrafficList
