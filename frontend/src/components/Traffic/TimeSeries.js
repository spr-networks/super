import React, { useState } from 'react'
import PropTypes from 'prop-types'

import DateRange from 'components/DateRange'
import TimeSeriesChart from 'components/Traffic/TimeSeriesChart'

import {
  Button,
  ButtonText,
  ButtonGroup,
  Box,
  HStack
} from '@gluestack-ui/themed'

import { ListHeader } from 'components/List'

const TimeSeries = (props) => {
  const [filterIPs, setFilterIPs] = useState([])
  const [offset, setOffset] = useState(props.scale || 'All Time')
  const [chartMode, setChartMode] = useState(props.chartMode || 'percent')

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
    <>
      <ListHeader title={props.title || props.type}>
        <HStack space="md">
          <ButtonGroup size="xs" isAttached colorScheme="primary">
            <Button
              onPress={(e) => handleChartMode('percent')}
              variant={chartMode !== 'percent' ? 'outline' : 'solid'}
            >
              <ButtonText>Percent</ButtonText>
            </Button>
            <Button
              onPress={(e) => handleChartMode('data')}
              variant={chartMode !== 'data' ? 'outline' : 'solid'}
            >
              <ButtonText>Data</ButtonText>
            </Button>
          </ButtonGroup>

          <ButtonGroup size="sm">
            <DateRange
              colorScheme="primary"
              defaultValue={offset}
              onChange={handleChangeTime}
            />
          </ButtonGroup>
        </HStack>
      </ListHeader>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
        mb="$4"
      >
        <TimeSeriesChart
          type={props.type}
          title={props.title}
          data={props.data}
          mode={chartMode}
          onClick={handleClickClient}
        />
      </Box>
    </>
  )
}

TimeSeries.propTypes = {
  type: PropTypes.string.isRequired,
  title: PropTypes.string,
  chartMode: PropTypes.string,
  data: PropTypes.object,
  handleChangeTime: PropTypes.func
}

export default TimeSeries
