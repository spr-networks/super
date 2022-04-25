import { useEffect, useState } from 'react'
import Select from 'react-select'

import { wifiAPI } from 'api'
import { prettySignal } from 'utils'

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  Label,
  Spinner,
  Table,
  Row,
  Col
} from 'reactstrap'

const WifiScan = (props) => {
  const [iface, setIface] = useState(null)
  const [devs, setDevs] = useState({})
  const [list, setlist] = useState([])

  useEffect(() => {
    wifiAPI.iwDev().then((devs) => {
      setDevs(devs)
    })
  }, [])

  const scan = (_iface) => {
    wifiAPI.iwScan(_iface).then((scanList) => {
      setlist(scanList)
    })
  }

  const onChange = (opt) => {
    let { value } = opt

    scan(value)
  }

  let devsScan = []
  for (let phy in devs) {
    for (let iface in devs[phy]) {
      if (!devs[phy][iface].type.includes('AP')) {
        devsScan.push(iface)
      }
    }
  }

  devsScan = devsScan.map((value) => {
    return { label: value, value }
  })

  return (
    <>
      <Row>
        <Col md="9">
          <Select
            options={devsScan}
            defaultValue={devsScan[0]}
            onChange={onChange}
          />
        </Col>
        <Col md="3">
          <Button
            color="primary"
            size="md"
            className="btn-wd mt-0"
            onClick={(e) => scan(iface)}
          >
            <i className="fa fa-wifi" /> Scan
          </Button>
        </Col>
      </Row>
      {list.length ? (
        <Row>
          <Col>
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th className="text-center">SSID/bssid</th>
                  <th className="text-center">channel</th>
                  <th className="text-center">freq</th>
                  <th className="text-center">signal</th>
                  <th>info</th>
                  <th>auth</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr>
                    <td className="text-center">
                      <div>{row.ssid}</div>
                      <div className="text-muted">
                        <small>{row.bssid}</small>
                      </div>
                    </td>
                    <td className="text-center">{row.primary_channel}</td>
                    <td className="text-center">
                      {Number(row.freq / 1e3).toFixed(2)} GHz
                    </td>
                    <td className="text-center">
                      {prettySignal(row.signal_dbm)}
                    </td>
                    <td>
                      {/*<div>
                        <Label>Manufacturer</Label> {row.manufacturer}
                      </div>*/}
                      {row.model ? (
                        <div>
                          <Label>Model</Label> {row.model} / {row.model_number}
                        </div>
                      ) : null}
                      {row.device_name ? (
                        <div>
                          <Label>Device Name</Label> {row.device_name}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.authentication_suites}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Col>
        </Row>
      ) : null}
      <div>
        <Spinner size="sm" hidden={iface && list.length} />
        <span className="mt-4 ml-1" hidden={iface && list.length}>
          Loading...
        </span>
      </div>
    </>
  )
}

export default WifiScan
