import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'

import ClientSelect from 'components/ClientSelect'
import DateRange from 'components/DateRange'
import TimeSeriesChart from 'components/Traffic/TimeSeriesChart'
import TimeSeriesList from 'components/Traffic/TimeSeriesList'
import Toggle from 'components/Toggle'
// this one show either a chart or table

import {
  Button,
  ButtonGroup,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  FormGroup,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  Label,
  Row,
  Col
} from 'reactstrap'

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
    <>
      <Card>
        <CardHeader>
          <Row>
            <Col md="4">
              <CardTitle tag="h4">{props.title || props.type}</CardTitle>
            </Col>
            <Col md="4">
              <div className={view == 'table' ? 'd-none' : 'text-right'}>
                <ButtonGroup size="sm">
                  <Button
                    color="primary"
                    onClick={(e) => handleChartMode('data')}
                    outline={chartMode !== 'data'}
                  >
                    Data
                  </Button>
                  <Button
                    color="primary"
                    onClick={(e) => handleChartMode('percent')}
                    outline={chartMode !== 'percent'}
                  >
                    Percent
                  </Button>
                </ButtonGroup>
              </div>
              <div className={view == 'chart' ? 'd-none' : 'pt-2'}>
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
              mode={chartMode}
              onClick={handleClickClient}
            />
          )}
        </CardBody>
      </Card>
    </>
  )
}

export default TimeSeries
