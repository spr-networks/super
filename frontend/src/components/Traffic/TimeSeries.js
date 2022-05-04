import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'

import ClientSelect from 'components/ClientSelect'
import DateRange from 'components/DateRange'
import TimeSeriesChart from 'components/Traffic/TimeSeriesChart'
import TimeSeriesList from 'components/Traffic/TimeSeriesList'
import Toggle from 'components/Toggle'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faChartColumn,
  faTable,
  faTableCellsLarge
} from '@fortawesome/free-solid-svg-icons'

import {
  Button,
  Box,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Text,
  useColorModeValue
} from 'native-base'

const TimeSeries = (props) => {
  const [filterIPs, setFilterIPs] = useState([])
  const [view, setView] = useState('chart')
  const [offset, setOffset] = useState('All Time')
  const [chartMode, setChartMode] = useState(props.chartMode || 'data')

  const handleChangeTime = (newValue) => {
    setOffset(newValue.value)
    if (props.handleChangeTime) {
      props.handleChangeTime(newValue.value, props.type)
    }
  }

  const handleChartMode = (value) => {
    setChartMode(value)

    if (props.handleChangeMode) {
      props.handleChangeMode(value, props.type)
    }
  }

  const handleChangeClient = (selectedIPs) => {
    let ips = selectedIPs.map((item) => item.value)
    setFilterIPs(ips)
  }

  const handleClickClient = (ip, datapoint) => {
    setFilterIPs([ip])
    setView('table')
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
    >
      <HStack space="2" justifyContent="space-between">
        <Heading>{props.title || props.type}</Heading>
        <HStack marginLeft="auto" space={4}>
          {view == 'chart' ? (
            <Box>
              <Button.Group size="sm" isAttached colorScheme="primary">
                <Button
                  onPress={(e) => handleChartMode('data')}
                  variant={chartMode !== 'data' ? 'outline' : 'solid'}
                >
                  Data
                </Button>
                <Button
                  onPress={(e) => handleChartMode('percent')}
                  variant={chartMode !== 'percent' ? 'outline' : 'solid'}
                >
                  Percent
                </Button>
              </Button.Group>
            </Box>
          ) : (
            <Box w="300">
              <ClientSelect
                isMulti
                value={filterIPs}
                onChange={handleChangeClient}
              />
            </Box>
          )}
          <Box w="200">
            <DateRange onChange={handleChangeTime} />
          </Box>

          <Button.Group size="sm" isAttached colorScheme="primary">
            <IconButton
              variant={view !== 'chart' ? 'outline' : 'solid'}
              icon={<Icon as={FontAwesomeIcon} icon={faChartColumn} />}
              onPress={(e) => setView('chart')}
            />
            <IconButton
              variant={view !== 'table' ? 'outline' : 'solid'}
              icon={<Icon as={FontAwesomeIcon} icon={faTableCellsLarge} />}
              onPress={(e) => setView('table')}
            />
          </Button.Group>
        </HStack>
      </HStack>

      <Box>
        {view == 'table' ? (
          <>
            <TimeSeriesList type={props.type} offset={offset} ips={filterIPs} />
          </>
        ) : (
          <TimeSeriesChart
            type={props.type}
            title={props.title}
            data={props.data}
            mode={chartMode}
            onClick={handleClickClient}
          />
        )}
      </Box>
    </Box>
  )
}

export default TimeSeries
