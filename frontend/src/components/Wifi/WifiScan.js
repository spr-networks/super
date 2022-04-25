import { useEffect, useState } from 'react'
import Select from 'react-select'
import ReactBSAlert from 'react-bootstrap-sweetalert'

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
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAlert, setShowAlert] = useState(false)
  const [scanDetail, setScanDetail] = useState({})

  useEffect(() => {
    wifiAPI.iwDev().then((devs) => {
      setDevs(devs)
    })
  }, [])

  const scan = (_iface) => {
    setLoading(true)
    wifiAPI.iwScan(_iface).then((scanList) => {
      setList(scanList)
      setLoading(false)
    })
  }

  const onChange = (opt) => {
    let { value } = opt
    setIface(value)
  }

  const closeAlert = () => setShowAlert(false)

  const showScanItem = (item) => {
    setScanDetail(item)
    setShowAlert(true)
  }

  let devsScan = []
  for (let phy in devs) {
    for (let iface in devs[phy]) {
      let type = devs[phy][iface].type
      let label = `${iface} ${type}`

      devsScan.push({ value: iface, disabled: type.includes('AP'), label })
    }
  }

  return (
    <>
      <ReactBSAlert
        type="custom"
        show={showAlert}
        onConfirm={closeAlert}
        onCancel={closeAlert}
        title="Wifi Scan"
        confirmBtnBsStyle="info"
        cancelBtnBsStyle="danger"
        openAnim={false}
        closeOnClickOutside={true}
        btnSize=""
      >
        <dl className="row" style={{ fontSize: '0.70rem' }}>
          {Object.keys(scanDetail).map((label) => (
            <>
              <dt className="col-sm-6 text-right">
                {label.replace(/_/g, ' ')}
              </dt>
              {Array.isArray(scanDetail[label]) ? (
                <dd className="col-sm-6 text-left">
                  {scanDetail[label].join(', ')}
                </dd>
              ) : (
                <dd className="col-sm-6 text-left">{scanDetail[label]}</dd>
              )}
            </>
          ))}
        </dl>
      </ReactBSAlert>
      <Row>
        <Col md={{ offset: 3, size: 4 }} xs={{ size: 8 }}>
          <Select
            options={devsScan}
            defaultValue={devsScan[0]}
            isOptionDisabled={(option) => option.disabled}
            onChange={onChange}
          />
        </Col>
        <Col xs="4" md="2">
          <Button
            color="primary"
            size="md"
            className="mt-0"
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
                  <th className="d-none d-sm-table-cell">info</th>
                  <th>auth</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr>
                    <td
                      className="text-center"
                      onClick={(e) => showScanItem(row)}
                      style={{ cursor: 'pointer' }}
                    >
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
                    <td className="d-none d-sm-table-cell">
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
        <Spinner size="sm" hidden={!loading} />
        <span className="mt-4 ml-1" hidden={!loading}>
          Loading...
        </span>
      </div>
    </>
  )
}

export default WifiScan
