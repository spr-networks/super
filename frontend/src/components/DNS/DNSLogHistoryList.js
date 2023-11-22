import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { format as timeAgo } from 'timeago.js'

import { AlertContext, ModalContext } from 'AppContext'
import DNSAddOverride from './DNSAddOverride'
import ClientSelect from 'components/ClientSelect'
import { Select } from 'components/Select'
import ModalForm from 'components/ModalForm'
import JSONSyntax from 'components/SyntaxHighlighter'
import { Tooltip } from 'components/Tooltip'
import { dbAPI, deviceAPI, logAPI } from 'api'
import { prettyDate } from 'utils'
import { ListHeader } from 'components/List'
import Pagination from 'components/Pagination'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonText,
  ButtonIcon,
  FlatList,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  Input,
  HStack,
  VStack,
  Menu,
  MenuItem,
  MenuItemLabel,
  Text,
  View,
  ScrollView,
  useColorMode,
  ThreeDotsIcon,
  SlashIcon,
  CheckIcon,
  TrashIcon,
  InputField,
  InputIcon,
  SearchIcon,
  InputSlot,
  CloseIcon
} from '@gluestack-ui/themed'

import { BarChartIcon, FilterIcon } from 'lucide-react-native'

const filterTypes = ['BLOCKED', 'NOERROR', 'NODATA', 'OTHERERROR', 'NXDOMAIN']

const TooltipIconButton = ({ label, onPress, icon, color, ...props }) => (
  <Tooltip label={label}>
    <Button
      sx={{
        '@base': { display: 'none' },
        '@md': { display: 'flex' }
      }}
      variant="link"
      onPress={onPress}
    >
      <ButtonIcon as={icon} color={color || '$primary500'} />
    </Button>
  </Tooltip>
)

const ListItem = ({
  item,
  handleClickDomain,
  hideClient,
  triggerAlert,
  setFilterText
}) => {
  const colorByType = (type) => {
    let keys = {
      BLOCKED: 'error',
      NOERROR: 'success',
      NODATA: 'warning',
      OTHERERROR: 'danger',
      NXDOMAIN: 'info'
    }

    return keys[type] || 'muted'
  }

  const trigger = (triggerProps) => (
    <Button variant="link" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
    </Button>
  )

  return (
    <Box
      borderBottomWidth={1}
      bg="$backgroundCardLight"
      borderColor="$borderColorCardLight"
      sx={{
        _dark: {
          bg: '$backgroundCardDark',
          borderColor: '$borderColorCardDark'
        }
      }}
    >
      <HStack
        space="md"
        justifyContent="space-between"
        alignItems="center"
        borderLeftWidth={2}
        borderLeftColor={'$' + colorByType(item.Type) + '500'}
        py="$2"
        pl="$2"
        pr="$4"
      >
        <Box
          sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
          w="$20"
        >
          <Badge
            variant="outline"
            action={colorByType(item.Type)}
            justifyContent="center"
          >
            <BadgeText>{item.Type}</BadgeText>
          </Badge>
        </Box>

        <VStack
          flex={3}
          space="sm"
          sx={{ '@md': { flexDirection: 'row', justifyContent: 'center' } }}
        >
          <VStack space="sm" flex={1}>
            <HStack>
              <Text
                bold
                isTruncated
                onPress={() => setFilterText(item.FirstName)}
              >
                {item.FirstName}
              </Text>
            </HStack>

            <HStack>
              <Text color="$muted500" onPress={() => triggerAlert(item)}>
                {item.FirstAnswer || '0.0.0.0'}
              </Text>
            </HStack>
          </VStack>

          <VStack sx={{ '@md': { justifyContent: 'center' } }}>
            <Tooltip label={timeAgo(new Date(item.Timestamp))}>
              <Text color="$muted500" size="xs">
                {prettyDate(new Date(item.Timestamp))}
              </Text>
            </Tooltip>
          </VStack>
        </VStack>

        <HStack space="lg" ml="auto">
          <TooltipIconButton
            label="Permit Domain"
            icon={CheckIcon}
            color="$green700"
            onPress={() => handleClickDomain('permit', item.FirstName)}
          />

          <TooltipIconButton
            label="Block Domain"
            icon={SlashIcon}
            color="$red700"
            onPress={() => handleClickDomain('block', item.FirstName)}
          />
        </HStack>
      </HStack>
    </Box>
  )
}

const DNSLogHistoryList = (props) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const navigate = useNavigate()

  const [list, setList] = useState([])
  const [listFiltered, setListFiltered] = useState([])
  const [filterIps, setFilterIps] = useState([])
  const [filterText, setFilterText] = useState('')
  const [filterType, setFilterType] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [params, setParams] = useState({ num: 1000 })

  const [devices, setDevices] = useState({})

  const modalRef = React.useRef(null)

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
    let doFilter = filterText.length || filterType.length,
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
            match ||
            item.Q.filter((r) =>
              r.Name.toLowerCase().includes(filterText.toLowerCase())
            ).length
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

        if (filterType && item.Type !== filterType) {
          match = false
        }

        return match
      })
    } else {
      listFiltered = list
    }

    if (filterText.length) {
      setTotal(listFiltered.length)
    }

    // no pagination for listFiltered if filterText
    let perPage = filterText.length ? 100 : 20,
      offset = 0 //(page - 1) * perPage

    listFiltered = listFiltered.slice(offset, offset + perPage)

    return listFiltered
  }

  const handleChangeIp = (ip) => {
    setFilterIps([ip])

    AsyncStorage.getItem('select')
      .then((oldSelect) => {
        let select = JSON.parse(oldSelect) || {}

        select.filterIps = [ip]
        AsyncStorage.setItem('select', JSON.stringify(select))
          .then((res) => {})
          .catch((err) => {})
      })
      .catch((err) => {})
  }

  const handleChange = (value) => {
    setFilterText(value)
    setPage(1)
  }

  const triggerAlert = (item) => {
    modalContext.modal(
      'DNS query',
      <ScrollView w="100%" maxHeight={320}>
        <JSONSyntax>{JSON.stringify(item, null, '  ')}</JSONSyntax>
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
  }, [])

  useEffect(() => {
    setFilterIps(props.ips)
    setFilterText(props.filterText)
  }, [props.ips, props.filterText])

  useEffect(() => {
    refreshList()

    if (filterIps.length) {
      navigate(`/admin/dnsLog/${filterIps.join(',')}/${filterText || ':text'}`)
    }
  }, [filterIps, filterText])

  //catch on clear
  useEffect(() => {
    if (!filterText.length) {
      refreshList()
    }
  }, [filterText])

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
  }, [list, filterText, filterType])

  const [showForm, setShowForm] = useState(Platform.OS == 'web')

  const onPressStats = () => {
    let nDomains = {}
    list.map((item) => {
      let k = item.FirstName
      if (!nDomains[k]) {
        nDomains[k] = 0
      }

      nDomains[k]++
    })

    let maxTime = list[0].time
    let minTime = list[list.length - 1].time
    let num = list.length

    let title = `${prettyDate(minTime)} - ${prettyDate(
      maxTime
    )}\n${num} records for ${filterIps.join(',')}`

    const onPressDomain = (domain) => {
      modalContext.toggleModal()
      setFilterText(domain)
    }

    modalContext.modal(
      title,

      <ScrollView w="100%" maxHeight={320}>
        <VStack space="xs">
          {Object.entries(nDomains)
            .sort((a, b) => b[1] - a[1])
            .map(([domain, num]) => (
              <HStack key={domain} space="md">
                <HStack w="$16" alignItems="center" justifyContent="flex-end">
                  <Text size="sm" bold>
                    {num}
                  </Text>
                </HStack>
                <HStack flex={2}>
                  <Text size="sm" onPress={() => onPressDomain(domain)}>
                    {domain}
                  </Text>
                </HStack>
              </HStack>
            ))}
        </VStack>
      </ScrollView>
    )
  }

  const colorMode = useColorMode()

  return (
    <View
      h="$full"
      sx={{
        '@md': { h: '92vh' }
      }}
    >
      <ModalForm
        title={'Add override for Domain'}
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

      <ListHeader
        title={filterIps.join(',') + ' DNS Log'}
        description={total ? `${total} records` : 'hello'}
      >
        <HStack
          space="md"
          sx={{
            '@base': { display: 'none' },
            '@md': { display: listFiltered.length ? 'flex' : 'none' }
          }}
        >
          <Button
            size="xs"
            action="secondary"
            onPress={onPressStats}
            isDisabled={!filterIps.length}
          >
            <ButtonIcon as={BarChartIcon} mr="$2" />
            <ButtonText>Stats</ButtonText>
          </Button>
          <Button
            size="xs"
            action="negative"
            onPress={deleteHistory}
            isDisabled={!filterIps.length}
          >
            <ButtonIcon as={TrashIcon} mr="$2" />
            <ButtonText>Delete History</ButtonText>
          </Button>
        </HStack>
      </ListHeader>

      <VStack
        sx={{
          '@md': {
            flexDirection: 'row',
            gap: 'md'
          }
        }}
        bg={
          colorMode == 'light' ? '$backgroundCardLight' : '$backgroundCardDark'
        }
        space="md"
        p="$4"
        h={Platform.OS == 'web' ? 'auto' : showForm ? 200 : 70}
      >
        <HStack
          sx={{ '@base': { maxWidth: '100%' }, '@md': { maxWidth: '$1/3' } }}
          space="md"
        >
          <FormControl flex={1}>
            <FormControlLabel
              sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
            >
              <FormControlLabelText size="sm">Client</FormControlLabelText>
            </FormControlLabel>
            <ClientSelect
              isDisabled
              value={filterIps ? filterIps[0] : null}
              onChange={handleChangeIp}
            />
          </FormControl>
          <Button
            sx={{ '@md': { display: 'none' } }}
            variant="link"
            onPress={() => setShowForm(!showForm)}
          >
            <ButtonIcon as={FilterIcon} />
          </Button>
        </HStack>

        <VStack
          flex={1}
          space="md"
          sx={{
            '@base': {
              display:
                filterIps.length && list.length && showForm ? 'flex' : 'none'
            },
            '@md': { flexDirection: 'row' }
          }}
        >
          <FormControl flex={1}>
            <FormControlLabel
              sx={{
                '@base': { display: 'none' },
                '@md': { display: 'flex' }
              }}
            >
              <FormControlLabelText size="sm">Search</FormControlLabelText>
            </FormControlLabel>

            <Input size="md">
              <InputField
                type="text"
                name="filterText"
                placeholder="Filter domain..."
                value={filterText}
                onChangeText={handleChange}
                autoCapitalize="none"
              />
              <InputSlot
                pr="$3"
                onPress={() => (filterText.length ? setFilterText('') : null)}
              >
                <InputIcon
                  as={CloseIcon}
                  display={filterText.length ? 'flex' : 'none'}
                />
                <InputIcon
                  as={SearchIcon}
                  display={filterText.length ? 'none' : 'flex'}
                />
              </InputSlot>
            </Input>
          </FormControl>

          <FormControl>
            <FormControlLabel
              sx={{
                '@base': { display: 'none' },
                '@md': { display: 'flex' }
              }}
            >
              <FormControlLabelText size="sm">Block Type</FormControlLabelText>
            </FormControlLabel>
            <Select
              selectedValue={filterType}
              onValueChange={(value) => setFilterType(value)}
            >
              <Select.Item label={'All'} value={''} />
              {filterTypes.map((opt) => (
                <Select.Item key={opt} label={opt} value={opt} />
              ))}
            </Select>
          </FormControl>
        </VStack>
      </VStack>

      <FlatList
        estimatedItemSize={100}
        flex={2}
        data={listFiltered}
        renderItem={({ item, index }) => (
          <ListItem
            item={item}
            hideClient={hideClient}
            handleClickDomain={handleClickDomain}
            triggerAlert={triggerAlert}
            setFilterText={setFilterText}
          />
        )}
        keyExtractor={(item) => item.Timestamp + item.Remote}
      />

      {total > 20 && !filterText.length ? (
        <Pagination page={page} pages={total} perPage={20} onChange={setPage} />
      ) : null}
    </View>
  )
}

DNSLogHistoryList.propTypes = {
  ips: PropTypes.array,
  filterText: PropTypes.string
}

export default DNSLogHistoryList
