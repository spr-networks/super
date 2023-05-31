import React, { useContext, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'
/*import { useNavigate as useNavigateWeb } from 'react-router-dom'
import { useNavigate as useNavigateNative } from 'react-router-native'*/
import { Animated } from 'react-native'
import Icon from 'FontAwesomeUtils'
import { faCaretDown } from '@fortawesome/free-solid-svg-icons'
import { AppContext } from 'AppContext'

import {
  Box,
  Link,
  Pressable,
  ScrollView,
  HStack,
  Text,
  Collapse,
  useColorModeValue,
  Input
} from 'native-base'

const Sidebar = (props) => {
  const { isMobile, isMini, isOpenSidebar, setIsOpenSidebar } = props
  //const sidebarItems = props.routes || []
  const [sidebarItems, setSidebarItems] = useState([])

  useEffect(() => {
    setSidebarItems(props.routes)
  }, [])

  const onChangeFilter = (value) => {
    //TODO have some more logic here
    let items = sidebarItems.map((pitem) => {
      if (pitem.views) {
        pitem.views = pitem.views.map((item) => {
          item.hidden = !item.name.toLowerCase().startsWith(value.toLowerCase())

          return item
        })

        // hide main if no match
        let isEmpty = pitem.views.filter((item) => !item.hidden).length == 0
        if (isEmpty) {
          pitem.hidden = true
        } else {
          pitem.hidden = false
        }
      } else {
        if (pitem.name) {
          pitem.hidden = !pitem.name
            .toLowerCase()
            .startsWith(value.toLowerCase())
        }
      }

      return pitem
    })

    setSidebarItems(items)
  }

  const showSearch = false

  return (
    <ScrollView
      _mb={{ base: Platform.OS == 'ios' ? 20 : 0, md: 0 }}
      pb={5}
      w={isMini ? '20' : '100%'}
      borderRightWidth={isMobile ? '0' : '1'}
      _light={{
        bg: 'sidebarBackgroundLight',
        borderColor: 'sidebarBorderColorLight'
      }}
      _dark={{ bg: 'sidebarBackgroundDark', borderColor: 'borderColorDark' }}
    >
      {showSearch ? (
        <Box p={4}>
          <Input onChangeText={onChangeFilter} placeholder="Search menu" />
        </Box>
      ) : null}
      <SidebarItem
        sidebarItems={sidebarItems}
        level={0}
        isMobile={isMobile}
        isMini={isMini}
        setIsOpenSidebar={setIsOpenSidebar}
      />
    </ScrollView>
  )
}

const SidebarItem = (props) => {
  const { sidebarItems, level, isMobile, isMini, setIsOpenSidebar } = props
  const { isWifiDisabled, isPlusDisabled, isMeshNode } = useContext(AppContext)
  const { activeSidebarItem, setActiveSidebarItem } = useContext(AppContext)

  /*useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeSidebarItem])*/

  /*
  const getCollapseInitialState = (routes) => {
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].collapse && getCollapseInitialState(routes[i].views)) {
        return true
      } else if (window.location.pathname.indexOf(routes[i].path) !== -1) {
        return true
      }
    }
    return false
  }

  const activeRoute = (routeName) => {
    return props.location.pathname.indexOf(routeName) > -1 ? 'active' : ''
  }

  React.useEffect(() => {
    setCollapseStates(getCollapseStates(props.routes))
  }, [])*/

  /*

  const getCollapseStates = (routes) => {
    let initialState = {}
    routes.map((prop, key) => {
      if (prop.collapse) {
        initialState = {
          [prop.state]: getCollapseInitialState(prop.views),
          ...getCollapseStates(prop.views),
          ...initialState
        }
      }
      return null
    })
    return initialState
  }
*/

  //const navigate = Platform.OS == 'web' ? useNavigateWeb() : useNavigateNative()
  const navigate = useNavigate()

  return sidebarItems.map((item, index) => {
    let display = { base: 'flex' }
    if (item.redirect || (item.layout !== 'admin' && !item.views)) {
      display.base = 'none'
      return null
    }

    // if mesh
    let meshItems = [
      'Auth',
      'Logs',
      'Notifications',
      'Home',
      'Wifi',
      'MESH',
      'System',
      'Plugins',
      'System Info'
    ]
    if (isMeshNode && !meshItems.includes(item.name)) {
      display.base = 'none'
      return null
    }

    // menu items hidden when wifi mode is disabled
    if (item.wifi === true && isWifiDisabled) {
      display.base = 'none'
    }

    // menu items hidden when plus mode is disabled
    if (item.plus === true && isPlusDisabled) {
      display.base = 'none'
    }

    if (item.hidden) {
      display.base = 'none'
    }

    return (
      <Box key={index} w="100%" display={display}>
        {item.views === undefined ? (
          <Pressable
            onPress={() => {
              setActiveSidebarItem(item.path)

              let url = `/${item.layout}/${item.path}`

              navigate(url)
              if (isMobile) {
                setIsOpenSidebar(false)
              }
            }}
            _hover={{
              _light: {
                bg:
                  item.path === activeSidebarItem
                    ? 'activeSidebarItemHoverBackgroundLight'
                    : 'inactiveSidebarItemHoverBackgroundLight'
              },
              _dark: {
                bg:
                  item.path === activeSidebarItem
                    ? 'activeSidebarItemHoverBackgroundDark'
                    : 'inactiveSidebarItemHoverBackgroundDark'
              }
            }}
            _light={{
              bg:
                item.path === activeSidebarItem
                  ? 'activeSidebarItemBackgroundLight'
                  : 'transparent'
            }}
            _dark={{
              bg:
                item.path === activeSidebarItem
                  ? 'activeSidebarItemBackgroundDark'
                  : 'transparent'
            }}
          >
            <Box px="8" py="2">
              <HStack
                space="3"
                alignItems="center"
                pl={level > 1 ? level + 14 + 'px' : '0px'}
              >
                {item.icon && typeof item.icon !== 'string' ? (
                  <Icon
                    color={useColorModeValue(
                      'sidebarItemIconLight',
                      'sidebarItemIconDark'
                    )}
                    icon={item.icon}
                  />
                ) : null}
                {isMini ? null : (
                  <Text
                    fontWeight="300"
                    fontSize="sm"
                    color={useColorModeValue(
                      'sidebarItemTextLight',
                      'sidebarItemTextDark'
                    )}
                  >
                    {item.name}
                  </Text>
                )}
                {item.status && <SidebarBadge status={item.status} />}
              </HStack>
            </Box>
          </Pressable>
        ) : (
          <CollapsibleSidebarItem
            isMobile={isMobile}
            isMini={isMini}
            title={item.name}
            icon={item.icon}
            level={level}
            collapsed={item.isCollapsed || false}
            setIsOpenSidebar={setIsOpenSidebar}
          >
            <SidebarItem
              sidebarItems={item.views}
              level={level + 1}
              setIsOpenSidebar={setIsOpenSidebar}
              isMobile={isMobile}
              isMini={isMini}
            />
          </CollapsibleSidebarItem>
        )}
      </Box>
    )
  })
}

export const CollapsibleSidebarItem = (props) => {
  const {
    children,
    title,
    level,
    collapsed,
    icon,
    isMobile,
    isMini,
    setIsOpenSidebar
  } = props
  const [isCollapsed, setIsCollapsed] = useState(collapsed)
  const isHeadingCollapsible = true

  if (isHeadingCollapsible || level > 0)
    return (
      <Box>
        <Pressable
          onPress={() => {
            setIsCollapsed(!isCollapsed)
          }}
        >
          <HStack
            justifyContent="space-between"
            alignItems="center"
            px={8}
            py={2.5}
          >
            {/*icon && typeof icon !== 'string' ? (
              <Icon icon={icon} />
            ) : null*/}
            <Box
              flexShrink="1"
              _text={{
                fontWeight: '600', // '300',
                textTransform: 'uppercase',
                fontSize: 'sm',
                color: useColorModeValue(
                  'sidebarItemHeadingTextLight',
                  'sidebarItemHeadingTextDark'
                )
              }}
            >
              {isMini ? title.substr(0, 1) : title}
            </Box>
            <RotatingView isCollapsed={isCollapsed}>
              <Icon icon={faCaretDown} size="2" color="coolGray.400" />
            </RotatingView>
          </HStack>
        </Pressable>
        <Collapse isOpen={!isCollapsed}>{children}</Collapse>
      </Box>
    )
  else
    return (
      <Box mb="9">
        <HStack
          justifyContent="space-between"
          alignItems="center"
          pl="8"
          px="4"
          py="2.5"
        >
          <Box
            flexShrink="1"
            _text={{
              textTransform: 'uppercase',
              fontWeight: '600',
              fontSize: 'sm',
              _dark: { color: 'coolGray.50' },
              _light: { color: 'blueGray.900' }
            }}
          >
            {title}
          </Box>
        </HStack>
        {children}
      </Box>
    )
}

const RotatingView = (props) => {
  const { isCollapsed, children } = props
  const rotateAnim = useRef(new Animated.Value(0)).current
  const rotateRight = () => {
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true
    }).start()
  }

  const rotateLeft = () => {
    Animated.timing(rotateAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true
    }).start()
  }

  useEffect(() => {
    if (isCollapsed === true) {
      rotateLeft()
    } else {
      rotateRight()
    }
  }, [isCollapsed])

  return (
    <Animated.View
      style={[
        {
          transform: [
            {
              rotate: rotateAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '180deg']
              })
            }
          ]
        }
      ]}
    >
      {children}
    </Animated.View>
  )
}

export default Sidebar
