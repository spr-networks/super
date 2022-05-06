import { useContext, useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import WifiClients from 'components/Wifi/WifiClients'
import WifiInterfaceList from 'components/Wifi/WifiInterfaceList'
import WifiScan from 'components/Wifi/WifiScan'
import WifiHostapd from 'components/Wifi/WifiHostapd'

import { Animated, Dimensions, Pressable, StatusBar } from 'react-native'
import { TabView, SceneMap } from 'react-native-tab-view'
import { Box, View, useColorModeValue } from 'native-base'

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

const WirelessConfiguration = (props) => {
  const [config, setConfig] = useState({})
  const [index, setIndex] = useState(0)

  const context = useContext(AlertContext)

  useEffect(() => {
    wifiAPI
      .config()
      .then((config) => {
        setConfig(config)
      })
      .catch((err) => {
        context.error('API Failure get traffic: ' + err.message)
      })
  }, [])

  const [routes] = useState([
    {
      key: 'first',
      title: 'Clients'
    },
    {
      key: 'second',
      title: 'Interfaces'
    },
    {
      key: 'third',
      title: 'Scan'
    },
    {
      key: 'fourth',
      title: 'Hostapd'
    }
  ])

  const initialLayout = {
    width: Dimensions.get('window').width
  }

  const renderScene = SceneMap({
    first: WifiClients,
    second: WifiInterfaceList,
    third: WifiScan,
    fourth: WifiHostapd
  })

  const renderTabBar = (props) => {
    const inputRange = props.navigationState.routes.map((x, i) => i)
    return (
      <Box flexDirection="row">
        {props.navigationState.routes.map((route, i) => {
          const opacity = props.position.interpolate({
            inputRange,
            outputRange: inputRange.map((inputIndex) =>
              inputIndex === i ? 1 : 0.5
            )
          })
          const color =
            index === i
              ? useColorModeValue('#000', '#e5e5e5')
              : useColorModeValue('#1f2937', '#a1a1aa')
          const borderColor =
            index === i
              ? 'cyan.500'
              : useColorModeValue('coolGray.200', 'gray.400')
          return (
            <Box
              borderBottomWidth="3"
              borderColor={borderColor}
              flex={1}
              alignItems="center"
              p="3"
              cursor="pointer"
            >
              <Pressable
                onPress={() => {
                  setIndex(i)
                }}
              >
                <Animated.Text
                  style={{
                    color
                  }}
                >
                  {route.title}
                </Animated.Text>
              </Pressable>
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <TabView
      navigationState={{
        index,
        routes
      }}
      renderScene={renderScene}
      renderTabBar={renderTabBar}
      onIndexChange={setIndex}
      initialLayout={initialLayout}
      style={{
        marginTop: StatusBar.currentHeight
      }}
    />
  )

  let tabList = ['Clients', 'Interfaces', 'Scan', 'Hostapd']

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
              <TabPane tabId="Hostapd">
                <WifiHostapd />
              </TabPane>
            </TabContent>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default WirelessConfiguration
