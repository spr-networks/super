import { useEffect, useState } from 'react'

import { wifiAPI } from 'api'

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  Label,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
  Row,
  Col
} from 'reactstrap'

const WifiHostapd = (props) => {
  const [config, setConfig] = useState({})

  useEffect(() => {
    wifiAPI.config().then((config) => {
      setConfig(config)
    })
  }, [])

  return (
    <>
      <Row>
        <Col>
          <dl className="row">
            {Object.keys(config).map((label) => (
              <>
                <dt className="col-sm-3 sm-text-right">{label}</dt>
                <dd className="col-sm-9">
                  <>{config[label]}</>
                </dd>
              </>
            ))}
          </dl>
        </Col>
      </Row>
    </>
  )
}

export default WifiHostapd
