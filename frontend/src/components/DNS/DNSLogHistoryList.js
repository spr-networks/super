import React, { useContext, useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import PropTypes from 'prop-types'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from 'FontAwesomeUtils'
import {
  faBan,
  faEllipsis,
  faEllipsisV,
  faPen,
  faMagnifyingGlass,
  faTrash,
  faFilter
} from '@fortawesome/free-solid-svg-icons'

import { AlertContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import DNSAddOverride from './DNSAddOverride'
import ModalForm from 'components/ModalForm'
import { dbAPI, deviceAPI, logAPI } from 'api'
import { prettyDate } from 'utils'
import { format as timeAgo } from 'timeago.js'

import {
  Badge,
  Box,
  Button,
  FlatList,
  Flex,
  FormControl,
  Heading,
  IconButton,
  Input,
  Menu,
  Stack,
  Spinner,
  HStack,
  VStack,
  Text,
  Tooltip,
  View,
  ScrollView
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

const ListItem = ({ item, handleClickDomain, hideClient, triggerAlert }) => {
  const colorByType = (type) => {
    let keys = {
      NOERROR: 'success',
      NODATA: 'warning',
      OTHERERROR: 'danger',
      NXDOMAIN: 'danger'
    }

    return keys[type] || 'danger'
  }

  const trigger = (triggerProps) => (
    <IconButton
      variant="unstyled"
      _ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}
    ></IconButton>
  )

  const moreMenu = (
    <Menu w={190} p={0} closeOnSelect={true} trigger={trigger}>
      <Menu.Item onPress={() => handleClickDomain('permit', item.FirstName)}>
        Add Domain Override
      </Menu.Item>
      <Menu.Item
        _text={{ color: 'danger.600' }}
        onPress={() => handleClickDomain('block', item.FirstName)}
      >
        Block Domain
      </Menu.Item>
    </Menu>
  )

  return (
    <Box
      borderBottomWidth={1}
      _light={{ bg: 'backgroundCardLight' }}
      _dark={{
        bg: 'backgroundCardDark',
        borderColor: 'borderColorCardDark'
      }}
      borderColor="borderColorCardLight"
    >
      <HStack
        space={{ base: 2, md: 8 }}
        justifyContent="space-between"
        alignItems="center"
        borderLeftWidth={2}
        borderLeftColor={colorByType(item.Type) + '.500'}
        py={2}
        pl={2}
      >
        <Box display={{ base: 'none', md: 'flex' }} w="20">
          <Badge variant="outline" colorScheme={colorByType(item.Type)}>
            {item.Type}
          </Badge>
        </Box>

        {hideClient ? null : (
          <Stack flex={1} space={1} justifyItems="center">
            <Text bold>{item.device.Name}</Text>
            <Text flex={1} display={{ base: 'none', md: 'flex' }}>
              {item.Remote.split(':')[0]}
            </Text>
          </Stack>
        )}

        <Stack flex={3} space={1}>
          <Text bold isTruncated>
            {item.FirstName}
          </Text>

          <Text color="muted.500" onPress={() => triggerAlert(item)}>
            {item.FirstAnswer || '0.0.0.0'}
          </Text>
        </Stack>

        <Text ml="auto" fontSize="xs" display={{ base: 'none', md: 'flex' }}>
          <Tooltip label={prettyDate(item.Timestamp)}>
            {timeAgo(new Date(item.Timestamp))}
          </Tooltip>
        </Text>

        {/*<Tooltip label="Add Domain Override" openDelay={300}>
            <IconButton
              variant="ghost"
              icon={<Icon icon={faPen} color="muted.400" />}
              onPress={() => handleClickDomain('permit', item.FirstName)}
            ></IconButton>
          </Tooltip>*/}

        <HStack space={2} ml="auto">
          <Tooltip label="Add Domain Block" openDelay={300}>
            <IconButton
              display={{
                base: 'none',
                md: 'flex'
              }}
              variant="unstyled"
              icon={<Icon icon={faBan} color="danger.800" />}
              onPress={() =>
                handleClickDomain(
                  item.Type === 'BLOCKED' ? 'permit' : 'block',
                  item.FirstName
                )
              }
            ></IconButton>
          </Tooltip>

          {moreMenu}
        </HStack>
      </HStack>
    </Box>
  )
}

const DNSLogHistoryList = (props) => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()

  const [list, setList] = useState([])
  const [listFiltered, setListFiltered] = useState([])
  const [filterIps, setFilterIps] = useState([])
  const [filterText, setFilterText] = useState(props.filterText || '')
  const [selectedDomain, setSelectedDomain] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [params, setParams] = useState({ num: 1000 })

  const [devices, setDevices] = useState({})

  const modalRef = React.createRef(null)

  const deviceByIp = (ip) => {
    return Object.values(devices).find((device) => device.RecentIP == ip) || {}
  }

  const refreshList = async () => {
    if (!filterIps.length) {
      return setList([])
    }

    // NOTE native dont support Promise.allSettled
    const allSettled = (promises) => {
      return Promise.all(
        promises.map((promise) =>
          promise
            .then((value) => ({ status: 'fulfilled', value }))
            .catch((reason) => ({ status: 'rejected', reason }))
        )
      )
    }

    allSettled(
      filterIps.map(async (ip) => {
        try {
          let bucket = `dns:serve:${ip}`

          let stats = await dbAPI.stats(bucket)
          setTotal(stats.KeyN)

          let list = await dbAPI.items(bucket, params)
          return list
        } catch (error) {
          throw `${ip}`
        }
      })
    ).then((results) => {
      let rejected = results
        .filter((r) => r.status == 'rejected')
        .map((r) => r.reason)

      if (rejected.length) {
        context.error('No DNS query history for ' + rejected.join(','))
        setFilterIps([])
      }

      let lists = results
        .filter((r) => r.value && r.value.length)
        .map((r) => r.value)

      // merge and sort lists desc
      let list = [].concat.apply([], lists)
      list.sort(
        (a, b) =>
          new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
      )

      list = list.map((item) => {
        item.device = deviceByIp(item.Remote.split(':')[0])
        return item
      })

      setList(list)
    })
  }

  const filterList = () => {
    let doFilter = filterText.length,
      listFiltered = []

    if (doFilter) {
      let datematch = filterText.match(
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/
      )

      let dateStart = null,
        dateEnd = null

      if (datematch) {
        try {
          let [filterDateStart, filterDateEnd] = datematch.slice(1, 3)
          dateStart = new Date(filterDateStart).getTime()
          dateEnd = new Date(filterDateEnd).getTime()
        } catch (error) {}
      }

      listFiltered = list.filter((item) => {
        let match = false

        try {
          match = match || item.FirstName.includes(filterText)
          match = match || item.FirstAnswer.includes(filterText)
          match =
            match || item.Q.filter((r) => r.Name.includes(filterText)).length
          match = match || item.Type.match(filterText.toUpperCase())
        } catch (err) {
          match = false
        }

        if (dateStart && dateEnd) {
          let d = new Date(item.Timestamp).getTime()
          if (dateStart < d && d < dateEnd) {
            match = true
          }
        }

        return match
      })
    } else {
      listFiltered = list
    }

    // no pagination for listFiltered if filterText
    let perPage = filterText.length ? 100 : 20,
      offset = 0 //(page - 1) * perPage

    listFiltered = listFiltered.slice(offset, offset + perPage)

    return listFiltered
  }

  const handleChangeIp = (ip) => {
    setFilterIps([ip])
  }

  const handleChange = (value) => {
    setFilterText(value)
    setPage(1)
  }

  const triggerAlert = (item) => {
    context.alert(
      'info',
      'DNS query',
      <ScrollView w="100%" h="400">
        <Text fontSize="xs">{JSON.stringify(item, null, '  ')}</Text>
      </ScrollView>
    )
  }

  const deleteHistory = async () => {
    if (!filterIps.length) {
      return
    }

    for (let ip of filterIps) {
      try {
        await dbAPI.deleteBucket(`dns:serve:${ip}`)
        await logAPI.deleteHistory(ip) // TODO this is old
      } catch (err) {
        context.error(`Failed to delete dns history for ${ip}`)
      }
    }

    context.success(`Deleted dns history for ${filterIps.join(', ')}`)

    refreshList()
  }

  useEffect(() => {
    deviceAPI.list().then((devices) => {
      setDevices(devices)
      refreshList()
    })

    /*
    const interval = setInterval(() => {
      console.log('ZZ', list.length, 'P=', page, 'ips=', filterIps)
      if (!list.length) {
        return
      }

      if (page > 1) {
        return
      }

      refreshList()
    }, 5 * 1e3)

    return () => clearInterval(interval)
    */
  }, [])

  useEffect(() => {
    setFilterIps(props.ips)
  }, [props.ips])

  useEffect(() => {
    refreshList()

    if (filterIps.length) {
      navigate(`/admin/dnsLog/${filterIps.join(',')}/${filterText || ':text'}`)
    }
  }, [filterIps])

  useEffect(() => {
    let max = new Date().toISOString()
    let idx = listFiltered.length - 1
    let l = listFiltered[idx]

    if (page > 1 && l && l.time) {
      max = l.time
    }

    setParams({ ...params, max })
  }, [page])

  useEffect(() => {
    refreshList()
  }, [params])

  const notifyChange = async () => {
    modalRef.current()
  }

  let hideClient = filterIps.length <= 1

  const handleClickDomain = (selectedType, selectedDomain) => {
    setSelectedType(selectedType)
    setSelectedDomain(selectedDomain)
    modalRef.current() // toggle modal
  }

  useEffect(() => {
    setListFiltered(filterList())
  }, [list, filterText])

  const [showForm, setShowForm] = useState(Platform.OS == 'web')

  let h = Platform.OS == 'web' ? Dimensions.get('window').height - 64 : '100%'
  return (
    <View h={h} display="flex">
      <ModalForm
        title={
          'Add ' +
          (selectedType == 'block' ? 'block' : 'override') +
          ' for Domain'
        }
        modalRef={modalRef}
        hideButton={true}
      >
        <DNSAddOverride
          type={selectedType}
          domain={selectedDomain}
          clientip={filterIps.length == 1 ? filterIps[0] : '*'}
          notifyChange={notifyChange}
        />
      </ModalForm>

      <HStack space={2} p={4}>
        <Heading fontSize="md">{filterIps.join(',')} DNS Log</Heading>
        {filterIps.length ? (
          <Text color="muted.500">{total} records</Text>
        ) : null}
      </HStack>

      <Stack
        _light={{ bg: 'backgroundCardLight' }}
        _dark={{ bg: 'backgroundCardDark' }}
        p={4}
        space={{ base: 0, md: 2 }}
        direction={{ base: 'column', md: 'row' }}
        _flex={{ base: 1, md: 'none' }}
        h={Platform.OS == 'web' ? 'auto' : showForm ? 200 : 70}
      >
        <HStack maxW={{ base: '100%', md: '1/3' }}>
          <FormControl flex={1}>
            <FormControl.Label display={{ base: 'none', md: 'flex' }}>
              Client
            </FormControl.Label>
            <ClientSelect
              isDisabled
              value={filterIps ? filterIps[0] : null}
              onChange={handleChangeIp}
            />
          </FormControl>
          <Button
            display={{ base: 'flex', md: 'none' }}
            variant="ghost"
            colorScheme="blueGray"
            leftIcon={<Icon icon={faFilter} />}
            onPress={() => setShowForm(!showForm)}
          />
        </HStack>

        <FormControl
          flex={2}
          display={{
            base: filterIps.length && list.length && showForm ? 'flex' : 'none'
          }}
        >
          <>
            <FormControl.Label>Search</FormControl.Label>

            <Input
              type="text"
              name="filterText"
              size="lg"
              placeholder="Filter domain..."
              value={filterText}
              onChangeText={handleChange}
              InputRightElement={
                <Icon icon={faMagnifyingGlass} color="muted.400" mr={2} />
              }
            />
          </>
        </FormControl>

        <FormControl
          flex={{ base: 2, md: 1 }}
          display={{
            base: filterIps.length && list.length && showForm ? 'flex' : 'none'
          }}
          mt={{ base: 4, md: 0 }}
        >
          <FormControl.Label display={{ base: 'none', md: 'flex' }}>
            Delete history
          </FormControl.Label>
          <Button
            size="md"
            variant="outline"
            colorScheme="danger"
            leftIcon={<Icon icon={faTrash} />}
            onPress={deleteHistory}
          >
            Delete
          </Button>
        </FormControl>
      </Stack>

      <FlashList
        estimatedItemSize={100}
        flex={2}
        data={listFiltered}
        renderItem={({ item, index }) => (
          <ListItem
            item={item}
            hideClient={hideClient}
            handleClickDomain={handleClickDomain}
            triggerAlert={triggerAlert}
          />
        )}
        keyExtractor={(item) => item.Timestamp + item.Remote}
      />

      {total > 20 && !filterText.length ? (
        <HStack space={2} alignItems="flex-start">
          <Button
            flex={1}
            variant="ghost"
            isDisabled={page <= 1}
            onPress={() => setPage(/*page > 1 ? page - 1 : */ 1)}
          >
            &larr; Start
          </Button>
          <Button flex={1} variant="ghost" onPress={() => setPage(page + 1)}>
            Next &rarr;
          </Button>
        </HStack>
      ) : null}
    </View>
  )
}

DNSLogHistoryList.propTypes = {
  ips: PropTypes.array,
  filterText: PropTypes.string
}

export default DNSLogHistoryList
