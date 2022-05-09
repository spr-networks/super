import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faBan,
  faPen,
  faMagnifyingGlass,
  faTrash
} from '@fortawesome/free-solid-svg-icons'

import { AlertContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import DNSAddOverride from './DNSAddOverride'
import ModalForm from 'components/ModalForm'
import { logAPI } from 'api/DNS'
import { prettyDate } from 'utils'
import { format as timeAgo } from 'timeago.js'

import {
  Badge,
  Box,
  Button,
  FlatList,
  FormControl,
  Heading,
  Icon,
  IconButton,
  Input,
  Stack,
  Spinner,
  HStack,
  VStack,
  Text,
  Tooltip,
  ScrollView
} from 'native-base'

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

  return (
    <Box
      borderBottomWidth="1"
      _dark={{
        borderColor: 'muted.600'
      }}
      borderColor="muted.200"
    >
      <HStack
        space={1}
        justifyContent="space-between"
        alignItems="center"
        borderLeftWidth={2}
        borderLeftColor={colorByType(item.Type) + '.500'}
        py="2"
        pl="2"
      >
        <Box display={{ base: 'none', md: 'flex' }} w="20">
          <Badge variant="outline" colorScheme={colorByType(item.Type)}>
            {item.Type}
          </Badge>
        </Box>

        {hideClient ? null : <Text flex="1">{item.Remote.split(':')[0]}</Text>}

        <Stack space={1} flex="3">
          <HStack space={2} alignItems="center">
            <Text bold isTruncated>
              {item.FirstName}
            </Text>
            <Tooltip label="Add Domain Override" openDelay={300}>
              <IconButton
                variant="ghost"
                size="xs"
                p="0"
                icon={
                  <Icon as={FontAwesomeIcon} icon={faPen} color="muted.400" />
                }
                onPress={() => handleClickDomain('permit', item.FirstName)}
              ></IconButton>
            </Tooltip>
            <Tooltip label="Add Domain Block" openDelay={300}>
              <IconButton
                display={{ base: item.Type == 'BLOCKED' ? 'none' : 'flex' }}
                variant="ghost"
                size="xs"
                p="0"
                icon={
                  <Icon as={FontAwesomeIcon} icon={faBan} color="danger.800" />
                }
                onPress={() => handleClickDomain('block', item.FirstName)}
              ></IconButton>
            </Tooltip>
          </HStack>

          <Text color="muted.500" onPress={() => triggerAlert(item)}>
            {item.FirstAnswer || '0.0.0.0'}
          </Text>
        </Stack>

        <Text fontSize="xs" alignSelf="flex-start">
          <Tooltip label={prettyDate(item.Timestamp)}>
            {timeAgo(new Date(item.Timestamp))}
          </Tooltip>
        </Text>
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

  const modalRef = React.createRef(null)

  const refreshList = async () => {
    if (!filterIps.length) {
      return setList([])
    }

    Promise.allSettled(
      filterIps.map(async (ip) => {
        try {
          let list = await logAPI.history(ip)
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

      setList(list)
    })
  }

  const filterList = () => {
    setTotal(list.length)

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

    let perPage = 20,
      offset = (page - 1) * perPage

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
    //let confirmMsg = `Delete history for ${filterIps.join(', ')}?`
    if (!filterIps.length) {
      return
    }

    filterIps.map(async () => await logAPI.deleteHistory)

    refreshList()
  }

  useEffect(() => {
    refreshList()
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
  }, [list, filterText, page])

  return (
    <Box
      _light={{ bg: 'warmGray.50' }}
      _dark={{ bg: 'blueGray.800' }}
      rounded="md"
      width="100%"
      p="4"
    >
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

      <VStack space={2} mb="12">
        <HStack space={2}>
          <Heading fontSize="lg">{filterIps.join(',')} DNS Log</Heading>
          <Text color="muted.500">{total} records</Text>
        </HStack>

        <Stack space={2} direction={{ base: 'column', md: 'row' }}>
          <FormControl flex="2">
            <FormControl.Label>Client</FormControl.Label>
            <ClientSelect
              isDisabled
              value={filterIps ? filterIps[0] : null}
              onChange={handleChangeIp}
            />
          </FormControl>

          <FormControl flex="2">
            <FormControl.Label>Search</FormControl.Label>

            <Input
              type="text"
              name="filterText"
              size="lg"
              placeholder="Filter domain..."
              value={filterText}
              onChangeText={handleChange}
              InputRightElement={
                <Icon
                  as={FontAwesomeIcon}
                  icon={faMagnifyingGlass}
                  color="muted.400"
                  mr={2}
                />
              }
            />
          </FormControl>

          <FormControl flex="1">
            {filterIps.length && list.length ? (
              <>
                <FormControl.Label>Delete history</FormControl.Label>
                <Button
                  size="md"
                  variant="subtle"
                  colorScheme="danger"
                  leftIcon={<Icon as={FontAwesomeIcon} icon={faTrash} />}
                  onPress={deleteHistory}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </FormControl>
        </Stack>

        {filterIps.length && !list.length ? (
          <HStack space={1}>
            <Spinner
              alignSelf="flex-start"
              accessibilityLabel="Loading DNS logs..."
            />
            <Text color="muted.500">Loading DNS logs...</Text>
          </HStack>
        ) : null}
      </VStack>

      <FlatList
        data={listFiltered}
        renderItem={({ item, index }) => (
          <ListItem
            item={item}
            hidenClient={hideClient}
            handleClickDomain={handleClickDomain}
            triggerAlert={triggerAlert}
          />
        )}
        keyExtractor={(item) => item.Timestamp}
      />

      <HStack width="100%" space={2}>
        <Button
          flex="1"
          variant="ghost"
          isDisabled={page <= 1}
          onPress={() => setPage(page > 1 ? page - 1 : 1)}
        >
          &larr; Previous
        </Button>
        <Button flex="1" variant="ghost" onPress={() => setPage(page + 1)}>
          Next &rarr;
        </Button>
      </HStack>
    </Box>
  )
}

DNSLogHistoryList.propTypes = {
  ips: PropTypes.array,
  filterText: PropTypes.string
}

export default DNSLogHistoryList
