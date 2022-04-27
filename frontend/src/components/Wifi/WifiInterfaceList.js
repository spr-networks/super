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

const WifiInterface = (props) => {
  //const [iw, setIw] = useState({})
  const [showMore, setShowMore] = useState(false)
  const [tabs, setTabs] = useState('devices')
  const iw = props.iw

  let tabList = [
    'devices',
    'supported_interface_modes',
    'supported_commands',
    'supported_ciphers',
    'supported_extended_features',
    'device_supports',
    'bands',
    'other'
  ]

  const dList = (dict, type = 'row') => {
    if (Object.keys(dict) && type == 'inline') {
      return (
        <>
          {Object.keys(dict).map((label) => (
            <span key={label} className="mr-2">
              <Label>{label}</Label> {dict[label]}
            </span>
          ))}
        </>
      )
    }
    return (
      <dl className="row">
        {Object.keys(dict).map((label) => (
          <>
            <>
              <dt className="col-sm-3 sm-text-right">{label}</dt>
              <dd className="col-sm-9">
                {typeof dict[label] == 'object' ? (
                  <>{dList(dict[label], 'inline')}</>
                ) : (
                  <>{dict[label]}</>
                )}
              </dd>
            </>
          </>
        ))}
      </dl>
    )
  }

  return (
    <>
      <h4 className="m-0">{iw.wiphy}</h4>
      <hr />

      <Row>
        <Col lg="4" md="5" sm="4" xs="12">
          <div className="nav-tabs-navigation verical-navs p-0">
            <div className="nav-tabs-wrapper">
              <Nav className="flex-column nav-stacked" role="tablist" tabs>
                {tabList.map((tab) =>
                  iw[tab] || tab == 'other' ? (
                    <NavItem key={tab}>
                      <NavLink
                        data-toggle="tab"
                        href="#"
                        role="tab"
                        className={tabs === tab ? 'active' : ''}
                        onClick={() => setTabs(tab)}
                      >
                        {tab.replace(/_/g, ' ').replace('supported ', '')}
                      </NavLink>
                    </NavItem>
                  ) : null
                )}
              </Nav>
            </div>
          </div>
        </Col>
        <Col lg="8" md="7" sm="8" xs="12">
          <TabContent activeTab={tabs}>
            {tabList.map((tab) =>
              iw[tab] || tab == 'other' ? (
                <TabPane key={tab} tabId={tab}>
                  {tab == 'devices' ? (
                    <>
                      {Object.keys(iw[tab]).map((iface) => (
                        <>
                          {/*!iw[tab][iface].type.includes('AP') ? (
                            <Button
                              className="pull-right mt-0"
                              size="md"
                              color="primary"
                            >
                              <i className="fa fa-wifi" /> scan
                            </Button>
                          ) : null*/}
                          <h5>
                            {iface}
                            <small className="text-muted ml-2">
                              {iw[tab][iface].type}
                            </small>
                          </h5>
                          {dList(iw[tab][iface])}
                          <hr />
                        </>
                      ))}
                    </>
                  ) : (
                    <>
                      {tab == 'other' ? (
                        <dl className="row">
                          {Object.keys(iw)
                            .filter((k) => !tabList.includes(k) && k != 'bands')
                            .map((k) => (
                              <>
                                <dt className="col-sm-3 sm-text-right">{k}</dt>
                                <dd className="col-sm-9">{iw[k]}</dd>
                              </>
                            ))}
                        </dl>
                      ) : null}
                      {tab == 'bands' ? (
                        <>
                          {iw.bands.map((band) => (
                            <>
                              <h5 className="text-muted">{band.band}</h5>

                              {Object.keys(band)
                                .filter((l) => l !== 'band')
                                .map((label) => (
                                  <dl className="row">
                                    <dt className="col-sm-3 text-right">
                                      {label}
                                    </dt>
                                    <dd className="col-sm-9">
                                      {band[label].map((v) => (
                                        <div>{v}</div>
                                      ))}
                                    </dd>
                                  </dl>
                                ))}
                              <hr />
                            </>
                          ))}
                        </>
                      ) : null}
                      {tab.includes('support') &&
                      iw['supported_interface_modes'] ? (
                        <>
                          <h5 className="text-muted">
                            {tab.replace(/_/g, ' ')}
                          </h5>
                          {iw[tab].map((c) => (
                            <Badge color="secondary">{c}</Badge>
                          ))}

                          {tab == 'supported_interface_modes' ? (
                            <>
                              <h5 className="text-muted mt-2">
                                software interface modes (can always be added)
                              </h5>
                              {iw['software_interface_modes'].map((c) => (
                                <Badge color="secondary">{c}</Badge>
                              ))}
                              <h5 className="text-muted mt-2">
                                valid interface combinations
                              </h5>
                              <em>{iw['valid_interface_combinations']}</em>
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  )}
                </TabPane>
              ) : null
            )}
          </TabContent>
        </Col>
      </Row>
    </>
  )
}

const WifiInterfaceList = (props) => {
  const [devs, setDevs] = useState({})
  const [iws, setIws] = useState([])
  useEffect(() => {
    wifiAPI.iwDev().then((devs) => {
      setDevs(devs)

      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })
        setIws(iws)
      })
    })
  }, [])

  return (
    <>
      <Row>
        <Col>
          {/*<Card>
            <CardHeader>
              <CardTitle tag="h4">Wifi Interfaces</CardTitle>
              <CardSubtitle className="text-muted">
                Connected physical Wifi interfaces
              </CardSubtitle>
            </CardHeader>
            <CardBody>*/}
          {iws.length ? (
            <div className="container">
              {iws.map((iw) => (
                <Row key={iw.wiphy}>
                  <Col key={iw.wiphy}>
                    <WifiInterface iw={iw} />
                  </Col>
                </Row>
              ))}
            </div>
          ) : null}
          {/*</CardBody>
          </Card>*/}
        </Col>
      </Row>
    </>
  )
}

export default WifiInterfaceList
