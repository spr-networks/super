import { useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { ucFirst } from 'utils'

import {
  Button,
  Form,
  FormGroup,
  FormText,
  Label,
  Input,
  Row,
  Col
} from 'reactstrap'

import WifiChannelParameters from 'components/Wifi/WifiChannelParameters'

const WifiHostapd = (props) => {
  const [config, setConfig] = useState({})
  const canEdit = ['ssid']

  const sortConf = (conf) => {
    // put the ones we can change at the top
    return Object.keys(conf)
      .sort((a, b) => {
        if (canEdit.includes(a)) {
          return -1
        }

        return a > b ? 1 : a < b ? -1 : 0
      })
      .reduce((obj, key) => {
        obj[key] = conf[key]
        return obj
      }, {})
  }

  useEffect(() => {
    wifiAPI.config().then((conf) => {
      setConfig(sortConf(conf))
    })
  }, [])

  const handleChange = (e) => {
    let name = e.target.name,
      value = e.target.value

    let configNew = { ...config }
    configNew[name] = value

    setConfig(configNew)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    let data = {
      Ssid: config.ssid,
      Channel: parseInt(config.channel)
    }

    wifiAPI.updateConfig(data).then((config) => {
      setConfig(sortConf(config))
    })
  }

  const updateChannels = (wifiParameters) => {
    let data = {
      Channel: wifiParameters.Channel,
      Vht_oper_centr_freq_seg0_idx: wifiParameters.Vht_oper_centr_freq_seg0_idx,
      He_oper_centr_freq_seg0_idx: wifiParameters.He_oper_centr_freq_seg0_idx,
      Vht_oper_chwidth: wifiParameters.Vht_oper_chwidth,
      He_oper_chwidth: wifiParameters.He_oper_chwidth,
    }

    wifiAPI.updateConfig(data).then((config) => {
      setConfig(sortConf(config))
    })

  }

  return (
    <>
    <WifiChannelParameters config={props.config} notifyChange={updateChannels}/>
    <Form onSubmit={handleSubmit}>
      <Row>
        <Col>
          {Object.keys(config).map((label) => (
            <Row key={label}>
              <Label sm="3" className="sm-text-right">
                {label}
              </Label>
              <Col sm="9">
                <FormGroup className="row" key={label}>
                  <Input
                    autoFocus
                    type="text"
                    disabled={!canEdit.includes(label)}
                    className="col-sm-9"
                    name={label}
                    value={config[label]}
                    onChange={handleChange}
                  />
                </FormGroup>
              </Col>
            </Row>
          ))}
        </Col>
      </Row>

      <p className="text-center text-muted mt-4">
        <em>NOTE:</em> Editing hostapd.conf requires restarting the Wifi &amp;
        your connection will be dropped
      </p>

      <Row className="mt-4">
        <Col sm={{ offset: 0, size: 12 }} className="text-center">
          <Button
            className="btn-wd"
            color="primary"
            size="md"
            type="submit"
            onClick={handleSubmit}
          >
            Save
          </Button>
        </Col>
      </Row>
    </Form>
    </>
  )
}

export default WifiHostapd
