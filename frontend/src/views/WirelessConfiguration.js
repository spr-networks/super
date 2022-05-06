import React, { Component } from 'react'

import { wifiAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'
import WifiClients from 'components/Wifi/WifiClients'
import WifiInterfaceList from 'components/Wifi/WifiInterfaceList'
import WifiScan from 'components/Wifi/WifiScan'
import WifiHostapd from 'components/Wifi/WifiHostapd'

import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
  Row,
  Col
} from 'reactstrap'

export default class WirelessConfiguration extends Component {
  state = { config: '', tab: 'Interfaces' }

  static contextType = APIErrorContext

  constructor(props) {
    super(props)
  }

  async componentDidMount() {
    wifiAPI
      .config()
      .then((config) => {
        this.setState({ config })
      })
      .catch((err) => {
        this.context.reportError('API Failure get traffic: ' + err.message)
      })
  }

  render() {
    let tabList = ['Clients', 'Interfaces', 'Scan', 'Settings']
    let testid = Math.random().toString(36).substr(2, 9)

    return (
      <div className="content">
        <Row>
          <Col>
            <Card>
              <div className="nav-tabs-navigation mb-0">
                <div className="nav-tabs-wrapper pt-2">
                  <Nav tabs>
                    {tabList.map((tab) => (
                      <NavItem key={Math.random().toString(36).substr(2, 9)}>
                        <NavLink
                          data-toggle="tab"
                          href={`#${tab}`}
                          role="tab"
                          className={this.state.tab === tab ? 'active' : ''}
                          onClick={() => this.setState({ tab })}
                        >
                          {tab}
                        </NavLink>
                      </NavItem>
                    ))}
                  </Nav>
                </div>
              </div>

              <TabContent activeTab={this.state.tab} className="p-4">
                <TabPane tabId="Clients">
                  <WifiClients />
                </TabPane>
                <TabPane tabId="Interfaces">
                  <WifiInterfaceList />
                </TabPane>
                <TabPane tabId="Scan">
                  <WifiScan />
                </TabPane>
                <TabPane tabId="Settings">
                  <WifiHostapd config={this.state.config}/>
                </TabPane>
              </TabContent>
            </Card>
          </Col>
        </Row>
      </div>
    )
  }
}
