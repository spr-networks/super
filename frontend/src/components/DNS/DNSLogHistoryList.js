import React, { useContext, useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { AlertContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import DNSAddOverride from './DNSAddOverride'
import ModalForm from 'components/ModalForm'
import { dbAPI, deviceAPI, logAPI } from 'api'
import { prettyDate } from 'utils'
import { format as timeAgo } from 'timeago.js'

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
  Tooltip,
  TooltipContent,
  TooltipText,
  useColorMode,
  ThreeDotsIcon,
  SlashIcon,
  TrashIcon,
  InputField,
  InputIcon,
  SearchIcon,
  InputSlot
} from '@gluestack-ui/themed'

//import { FlashList } from '@shopify/flash-list'
import { FilterIcon } from 'lucide-react-native'

const ListItem = ({ item, handleClickDomain, hideClient, triggerAlert }) => {
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

  const moreMenu = (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={(e) => {
        let action = e.currentKey
        handleClickDomain(action, item.FirstName)
      }}
    >
      <MenuItem key="permit">
        <SlashIcon color="$green700" mr="$2" />
        <MenuItemLabel size="sm">Permit Domain</MenuItemLabel>
      </MenuItem>
      <MenuItem key="block">
        <SlashIcon color="$red700" mr="$2" />
        <MenuItemLabel size="sm">Block Domain</MenuItemLabel>
      </MenuItem>
    </Menu>
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
          <Badge variant="outline" action={colorByType(item.Type)}>
            <BadgeText>{item.Type}</BadgeText>
          </Badge>
        </Box>

        {hideClient ? null : (
          <VStack flex={1} space={'md'} justifyItems="center">
            <Text bold>{item.device.Name}</Text>
            <Text
              flex={1}
              sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
            >
              {item.Remote.split(':')[0]}
            </Text>
          </VStack>
        )}

        <VStack flex={3} space="sm">
          <Text bold isTruncated>
            {item.FirstName}
          </Text>

          <Text color="$muted500" onPress={() => triggerAlert(item)}>
            {item.FirstAnswer || '0.0.0.0'}
          </Text>
          <Text color="$muted500" sx={{ '@md': { display: 'none' } }}>
            {timeAgo(new Date(item.Timestamp))}
          </Text>
        </VStack>

        <Tooltip
          placement="bottom"
          trigger={(triggerProps) => (
            <Text
              color="$muted500"
              ml="auto"
              size="xs"
              sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
              {...triggerProps}
            >
              {timeAgo(new Date(item.Timestamp))}
            </Text>
          )}
        >
          <TooltipContent>
            <TooltipText>{prettyDate(item.Timestamp)}</TooltipText>
          </TooltipContent>
        </Tooltip>

        <HStack space="md" ml="auto">
          <Tooltip
            placement="bottom"
            trigger={(triggerProps) => (
              <Button
                sx={{
                  '@base': { display: 'none' },
                  '@md': { display: 'flex' }
                }}
                variant="link"
                {...triggerProps}
                onPress={() =>
                  handleClickDomain(
                    item.Type === 'BLOCKED' ? 'permit' : 'block',
                    item.FirstName
                  )
                }
              >
                <ButtonIcon as={SlashIcon} color="$red700" />
              </Button>
            )}
          >
            <TooltipContent>
              <TooltipText>Add Domain Block</TooltipText>
            </TooltipContent>
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
        <Text size="xs">{JSON.stringify(item, null, '  ')}</Text>
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

  const colorMode = useColorMode()

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

      <HStack space="md" p="$4" alignItems="center">
        <Heading size="sm">{filterIps.join(',')} DNS Log</Heading>
        {filterIps.length ? (
          <Text color="$muted500">{total} records</Text>
        ) : null}
      </HStack>

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

        <FormControl
          flex={1}
          sx={{
            '@base': {
              display:
                filterIps.length && list.length && showForm ? 'flex' : 'none'
            }
          }}
        >
          <FormControlLabel>
            <FormControlLabelText
              size="sm"
              sx={{
                '@base': { display: 'none' },
                '@md': { display: 'flex' }
              }}
            >
              Search
            </FormControlLabelText>
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
            <InputSlot pr="$3">
              <InputIcon as={SearchIcon} />
            </InputSlot>
          </Input>
        </FormControl>

        <FormControl
          flex={1}
          sx={{
            '@base': {
              mt: 4,
              display:
                filterIps.length && list.length && showForm ? 'flex' : 'none'
            },
            '@md': {
              mt: 0
            }
          }}
        >
          <FormControlLabel
            sx={{
              '@base': { display: 'none' },
              '@md': { display: 'flex' }
            }}
          >
            <FormControlLabelText size="sm">
              Delete history
            </FormControlLabelText>
          </FormControlLabel>

          <Button size="sm" action="negative" onPress={deleteHistory}>
            <ButtonIcon as={TrashIcon}></ButtonIcon>
            <ButtonText>Delete</ButtonText>
          </Button>
        </FormControl>
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
          />
        )}
        keyExtractor={(item) => item.Timestamp + item.Remote}
      />

      {total > 20 && !filterText.length ? (
        <HStack space="md" alignItems="flex-start">
          <Button
            flex={1}
            action="secondary"
            variant="link"
            isDisabled={page <= 1}
            size="sm"
            onPress={() => setPage(/*page > 1 ? page - 1 : */ 1)}
          >
            <ButtonText>&larr; Start</ButtonText>
          </Button>
          <Button
            flex={1}
            action="secondary"
            variant="link"
            size="sm"
            onPress={() => setPage(page + 1)}
          >
            <ButtonText>Next &rarr;</ButtonText>
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
