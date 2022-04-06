import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { trafficAPI } from 'api/Traffic'
import { prettyDate, prettySize } from 'utils'

import { Table, Row, Col } from 'reactstrap'

const TimeSeriesList = (props) => {
  const [list, setList] = useState([])

  // filter the list depending on the interface to match the type
  const filterType = (_list, type) => {
    return _list.filter((row) => {
      let regexLAN = /^192\.168\./
      // src == lan && dst == lan
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
      if (type == 'WanIn' && row.Dst.match(regexLAN)) {
        return row
      }

      //if (type == 'WanOut' && row.Interface != 'wlan0') {
      if (type == 'WanOut' && row.Src.match(regexLAN)) {
        return row
      }
    })
  }

  useEffect(() => {
    trafficAPI.traffic().then((data) => {
      data = filterType(data, props.type)
      // the data we fetch is from now and sorted desc - 1 minute for each row
      let date = new Date()
      date.setSeconds(0)
      data = data.map((row) => {
        date.setMinutes(date.getMinutes() - 1)
        row.Timestamp = new Date(date)
        return row
      })

      setList(data)
    })
  }, [])

  let listFiltered = list

  // filter by type
  if (props.type) {
  }

  // filter by ip
  if (props.ips && props.ips.length) {
    let ips = props.ips
    let field = props.type.match(/Out$/) ? 'Src' : 'Dst'
    listFiltered = listFiltered.filter((row) => ips.includes(row[field]))
  }

  // filter by date
  if (props.offset) {
    const scaleOffset = {
      '1 Hour': 60 - 1,
      '1 Day': 60 * 24 - 1,
      '15 Minutes': 15 - 1
    }

    let offset = scaleOffset[props.offset] || 0
    let d = new Date()
    d.setMinutes(d.getMinutes() - offset)
    listFiltered = offset
      ? listFiltered.filter((row) => row.Timestamp > d)
      : listFiltered
  }

  return (
    <Table responsive>
      <thead className="text-primary">
        <tr>
          <th>Timestamp</th>
          <th>Interface</th>
          <th>Src IP</th>
          <th>Dst IP</th>
          <th>Size</th>
        </tr>
      </thead>
      <tbody>
        {listFiltered.map((row) => (
          <tr>
            <td>{prettyDate(row.Timestamp)}</td>
            <td>{row.Interface}</td>
            <td>{row.Src}</td>
            <td>{row.Dst}</td>
            {/*<td>{row.Packets}</td>*/}
            <td>{prettySize(row.Bytes)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

export default TimeSeriesList
