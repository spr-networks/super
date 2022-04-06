import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import Select from 'react-select'

import ClientSelect from 'components/ClientSelect'
import TimeSeriesChart from 'components/Traffic/TimeSeriesChart'
import TimeSeriesList from 'components/Traffic/TimeSeriesList'

// this one show either a chart or table

import {
  Button,
  ButtonGroup,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Row,
  Col
} from 'reactstrap'

const TimeSeries = (props) => {
  const scales = [
    { value: 'All Time', label: 'All Time' },
    { value: '1 Day', label: 'Last day' },
    { value: '1 Hour', label: 'Last hour' },
    { value: '15 Minutes', label: 'Last 15 minutes' }
  ]
  const [filterIPs, setFilterIPs] = useState([])
  const [view, setView] = useState('chart')
  const [scale, setScale] = useState('All Time')
  const [offset, setOffset] = useState(0)

  const handleTimeChange = (newValue) => {
    setScale(newValue.label)
    setOffset(newValue.value)
    if (props.handleTimeChange) {
      props.handleTimeChange(newValue.value, props.type)
    }
  }

  const handleClientChange = (selectedIPs) => {
    let ips = selectedIPs.map((item) => item.value)
    setFilterIPs(ips)
  }

  const handleClientClick = (ip, datapoint) => {
    setFilterIPs([ip])
    setView('table')
  }

  return (
    <>
      <Card>
        <CardHeader>
          <Row>
            <Col md="4">
              <CardTitle tag="h4">{props.title || props.type}</CardTitle>
            </Col>
            <Col md="4" className="pt-2">
              <div className={view == 'chart' ? 'd-none' : null}>
                <ClientSelect
                  isMulti
                  value={filterIPs}
                  onChange={handleClientChange}
                />
              </div>
            </Col>
            <Col md="2" className="pt-2">
              <Select
                onChange={handleTimeChange}
                options={scales}
                value={{ value: offset, label: scale }}
              />
            </Col>
            <Col md="2" className="text-right">
              <ButtonGroup>
                <Button
                  size="sm"
                  color="primary"
                  outline={view == 'chart' ? null : 'outline'}
                  onClick={(e) => setView('chart')}
                >
                  <i className="fa fa-bar-chart" />
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  outline={view == 'table' ? null : 'outline'}
                  onClick={(e) => setView('table')}
                >
                  <i className="fa fa-table" />
                </Button>
              </ButtonGroup>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {view == 'table' ? (
            <>
              <TimeSeriesList
                type={props.type}
                offset={offset}
                ips={filterIPs}
              />
            </>
          ) : (
            <TimeSeriesChart
              type={props.type}
              title={props.title}
              data={props.data}
              handleClientClick={handleClientClick}
            />
          )}
        </CardBody>
      </Card>
    </>
  )
}

export default TimeSeries
