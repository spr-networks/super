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
  createIcon
} from 'native-base'

import { AlertContext } from 'layouts/Admin'
import TimeSeriesList from 'components/Traffic/TimeSeriesList'
import ClientSelect from 'components/ClientSelect'
import DateRange from 'components/DateRange'

import { trafficAPI } from 'api'

const TrafficList = (props) => {
  const context = useContext(AlertContext)

  const [list, setList] = useState([])
  const [type, setType] = useState('WanOut')
  const [filterIPs, setFilterIPs] = useState([])
  const [offset, setOffset] = useState('All Time')

  const refreshList = () => {
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
        data = data.map((row) => {
          let msAgo = (row.Timeout - row.Expires) * 1e3
          row.Timestamp = new Date(new Date().getTime() - msAgo)

          return row
        })

        setList(data)
      })
      .catch((err) => context.error(err))
  }

  useEffect(() => {
    refreshList()

    const interval = setInterval(refreshList, 5 * 1e3)
    return () => clearInterval(interval)
  }, [])

  const flexDirection = useBreakpointValue({
    base: 'column',
    lg: 'row'
  })

  let types = ['WanOut', 'WanIn', 'LanIn', 'LanOut']

  const handleChangeClient = (ips) => {
    setFilterIPs(ips)
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
            name="exampleGroup"
            defaultValue={type}
            accessibilityLabel="pick a size"
            onChange={(type) => {
              console.log('value change:', type)
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
              value={filterIPs}
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
        <TimeSeriesList
          type={type}
          data={list}
          offset={offset}
          ips={filterIPs}
        />
      </Box>
    </>
  )
}

export default TrafficList
