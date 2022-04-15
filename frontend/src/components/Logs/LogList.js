import React, { useContext, useEffect, useState } from 'react'
import { Link, useHistory } from 'react-router-dom'
import Select from 'react-select'

import { logsAPI } from 'api'
import { prettyDate } from 'utils'
import { APIErrorContext } from 'layouts/Admin'

import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Row,
  Col
} from 'reactstrap'

const LogList = (props) => {
  const [list, setList] = useState([])
  const [listAll, setListAll] = useState([])
  const [containers, setContainers] = useState([])
  const [filterContainers, setFilterContainers] = useState([])

  const contextType = useContext(APIErrorContext)
  let history = useHistory()

  const refreshList = (next) => {
    logsAPI
      .latest()
      .then((logs) => {
        // make sure message is a string
        logs = logs.map((row) => {
          if (Array.isArray(row.MESSAGE)) {
            row.MESSAGE = row.MESSAGE.map((c) => String.fromCharCode(c))
          }

          return row
        })

        setList(logs)
        setListAll(logs)

        if (next) {
          next(logs)
        }
      })
      .catch((err) => {
        contextType.reportError('failed to fetch JSON logs')
      })
  }

  useEffect(() => {
    refreshList((logs) => {
      // get containers from logs
      let cnames = logs.map((row) => row.CONTAINER_NAME).filter((n) => n)
      let cs = Array.from(new Set(cnames))
      setContainers(cs)

      if (props.containers && props.containers.length) {
        console.log('>>filter:', props.containers)
        setFilterContainers(props.containers)
      } else {
        setFilterContainers(cs)
      }
    })
  }, [])

  const filterList = (filter) => {
    let logs = listAll.filter((row) => {
      let match = true
      if (filter.containers) {
        if (row.CONTAINER_NAME === undefined) {
          match = false
        } else {
          match = filter.containers.includes(row.CONTAINER_NAME)
        }
      }

      return match ? row : null
    })

    if (logs) {
      setList(logs)
    }
  }

  const handleChange = (newValues, action) => {
    setFilterContainers(newValues.map((o) => o.value))
  }

  useEffect(() => {
    if (!filterContainers.length) {
      return
    }

    let opts = {
      containers: filterContainers
    }

    history.push('/admin/logs/' + filterContainers.join(','))

    filterList(opts)
  }, [filterContainers])

  const containersOptions = containers.map((c) => {
    return { label: c, value: c }
  })

  let containersValues = filterContainers.map((c) => {
    return { label: c, value: c }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle tag="h4">Logs</CardTitle>
        <Row>
          <Col md="8">
            <Select
              isMulti
              isClearable
              options={containersOptions}
              value={containersValues}
              onChange={handleChange}
            />
          </Col>
        </Row>
      </CardHeader>
      <CardBody>
        {list.length ? (
          <Table responsive>
            <thead className="text-primary">
              <tr>
                <th>Timestamp</th>
                <th>Container</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row, i) => (
                <tr key={i + row.__REALTIME_TIMESTAMP}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {prettyDate(row.__REALTIME_TIMESTAMP / 1e3)}
                  </td>
                  <td>{row.CONTAINER_NAME}</td>
                  <td>{row.MESSAGE}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-muted">Loading...</p>
        )}
      </CardBody>
    </Card>
  )
}

export default LogList
