import { useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { ucFirst } from 'utils'

import { Input, Row, Col } from 'reactstrap'

const WifiHostapd = (props) => {
  const [config, setConfig] = useState({})

  useEffect(() => {
    wifiAPI.config().then((config) => {
      setConfig(config)
    })
  }, [])

  const handleChange = (e) => {
    let name = e.target.name,
      value = e.target.value

    let configNew = config
    configNew[name] = value
    console.log(name, '=>', value, configNew)
    setConfig(configNew)

    name = ucFirst(name)
    /*let config = {}
    config[name] = value

    wifiAPI.updateConfig(config).then((config) => {
      setConfig(config)
    })*/
  }

  const canEdit = ['ssid', 'channel']

  return (
    <>
      <Row>
        <Col>
          {Object.keys(config).map((label) => (
            <dl className="row" key={label}>
              <dt className="col-sm-3 sm-text-right">{label}</dt>
              <dd className="col-sm-9">{config[label]}</dd>
            </dl>
          ))}
        </Col>
      </Row>
    </>
  )
}

export default WifiHostapd
