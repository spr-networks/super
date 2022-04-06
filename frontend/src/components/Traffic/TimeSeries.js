import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import Select from 'react-select'

import ClientSelect from 'components/ClientSelect'
import DateRange from 'components/DateRange'
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
  const [filterIPs, setFilterIPs] = useState([])
  const [view, setView] = useState('chart')
  const [offset, setOffset] = useState('All Time')

  const handleChangeTime = (newValue) => {
    setOffset(newValue.value)
    if (props.handleChangeTime) {
      props.handleChangeTime(newValue.value, props.type)
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
                  onChange={handleChangeClient}
                />
              </div>
            </Col>
            <Col md="2" className="pt-2">
              <DateRange onChange={handleChangeTime} />
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
              onClick={handleClickClient}
            />
          )}
        </CardBody>
      </Card>
    </>
  )
}

export default TimeSeries
