import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'

import DateRange from 'components/DateRange'
import TimeSeriesChart from 'components/Traffic/TimeSeriesChart'

import { Button, Box, Heading, Stack, useColorModeValue } from 'native-base'

const TimeSeries = (props) => {
  const [filterIPs, setFilterIPs] = useState([])
  const [offset, setOffset] = useState('All Time')
  const [chartMode, setChartMode] = useState(props.chartMode || 'data')

  const handleChangeTime = (value) => {
    setOffset(value)
    if (props.handleChangeTime) {
      props.handleChangeTime(value, props.type)
    }
  }

  const handleChartMode = (value) => {
    setChartMode(value)

    if (props.handleChangeMode) {
      props.handleChangeMode(value, props.type)
    }
  }

  const handleClickClient = (device, datapoint) => {
    //setFilterIPs([ip])
    // TODO redir to view
    let timestamp = datapoint.Box
    console.log('TODO redir to traffic view', props.type, device, timestamp)
  }

  return (
    <Box
      bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      __rounded={{ base: 'none', md: 'md' }}
      width="100%"
      p={4}
    >
      <Stack
        direction={{ base: 'column', md: 'row' }}
        space="2"
        justifyContent="space-between"
      >
        <Heading fontSize="md">{props.title || props.type}</Heading>

        <Stack
          direction={{ base: 'column', md: 'row' }}
          space={2}
          alignItems="center"
        >
          <Button.Group size="xs" isAttached colorScheme="primary">
            <Button
              onPress={(e) => handleChartMode('percent')}
              variant={chartMode !== 'percent' ? 'outline' : 'solid'}
            >
              Percent
            </Button>
            <Button
              onPress={(e) => handleChartMode('data')}
              variant={chartMode !== 'data' ? 'outline' : 'solid'}
            >
              Data
            </Button>
          </Button.Group>

          <Button.Group size="sm">
            <DateRange
              colorScheme="primary"
              defaultValue={offset}
              onChange={handleChangeTime}
            />
          </Button.Group>
        </Stack>
      </Stack>

      <TimeSeriesChart
        type={props.type}
        title={props.title}
        data={props.data}
        mode={chartMode}
        onClick={handleClickClient}
      />
    </Box>
  )
}

TimeSeries.propTypes = {
  type: PropTypes.string.isRequired,
  title: PropTypes.string,
  chartMode: PropTypes.string,
  handleChangeTime: PropTypes.func
}

export default TimeSeries
