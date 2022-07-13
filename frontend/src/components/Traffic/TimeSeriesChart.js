import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { prettySize } from 'utils'
import { Text } from 'native-base'

const TimeSeriesChart = (props) => {
  return <></>
}

TimeSeriesChart.propTypes = {
  type: PropTypes.string,
  title: PropTypes.string,
  data: PropTypes.object,
  handleTimeChange: PropTypes.func,
  onClick: PropTypes.func
}

export default TimeSeriesChart
