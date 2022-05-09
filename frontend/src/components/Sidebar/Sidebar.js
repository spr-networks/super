import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Animated } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faCaretDown } from '@fortawesome/free-solid-svg-icons'
import { AppContext } from 'AppContext'

import {
  Box,
  Icon,
  Link,
  Pressable,
  ScrollView,
  HStack,
  Text,
  Collapse
} from 'native-base'

const Sidebar = (props) => {
  const { isMobile, isMini, isOpenSidebar, setIsOpenSidebar } = props
  const sidebarItems = props.routes || []

  return (
    <ScrollView overflowY="overlay">
      <Box
        py="5"
        w={isMini ? '20' : '100%'} // 64
        flex="1"
        borderRightWidth={isMobile ? '0' : '1'}
        _light={{
          borderColor: 'coolGray.200',
          bg: 'coolGray.100'
        }}
        _dark={{ borderColor: 'coolGray.800', bg: 'blueGray.900' }}
      >
        <SidebarItem
          sidebarItems={sidebarItems}
          level={0}
          isMobile={isMobile}
          isMini={isMini}
          setIsOpenSidebar={setIsOpenSidebar}
        />
      </Box>
    </ScrollView>
  )
}

const SidebarItem = (props) => {
  const { sidebarItems, level, isMobile, isMini, setIsOpenSidebar } = props
  const { activeSidebarItem, setActiveSidebarItem } = useContext(AppContext)

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

  return sidebarItems.map((item, index) => {
    if (item.redirect === true) return null
    const navigate = useNavigate()

    return (
      <Box key={index} w="100%">
        {item.views === undefined ? (
          <Pressable
            onPress={() => {
              setActiveSidebarItem(item.path)
              navigate(`/${item.layout}/${item.path}`)
              if (isMobile) {
                setIsOpenSidebar(false)
              }
            }}
            _hover={{
              _light: {
                bg:
                  item.path === activeSidebarItem
                    ? 'cyan.200:alpha.80'
                    : 'blueGray.200'
              },
              _dark: {
                bg:
                  item.path === activeSidebarItem ? 'cyan.600' : 'blueGray.800'
              }
            }}
            _light={{
              bg:
                item.path === activeSidebarItem
                  ? 'cyan.200:alpha.60'
                  : 'transparent'
            }}
            _dark={{
              bg: item.path === activeSidebarItem ? 'cyan.700' : 'transparent'
            }}
          >
            <Link>
              <Box pl="8" px="4" py="2">
                <HStack
                  space="3"
                  alignItems="center"
                  pl={level > 1 ? level + 14 + 'px' : '0px'}
                >
                  {item.icon && typeof item.icon !== 'string' ? (
                    <Icon as={FontAwesomeIcon} icon={item.icon} />
                  ) : null}
                  {isMini ? null : (
                    <Text
                      fontWeight="300"
                      fontSize="sm"
                      _dark={{ color: 'coolGray.200' }}
                      _light={{ color: 'blueGray.900' }}
                    >
                      {item.name}
                    </Text>
                  )}
                  {item.status && <SidebarBadge status={item.status} />}
                </HStack>
              </Box>
            </Link>
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
            pl="8"
            px="4"
            py="2.5"
          >
            {/*icon && typeof icon !== 'string' ? (
              <Icon as={FontAwesomeIcon} icon={icon} />
            ) : null*/}
            <Box
              flexShrink="1"
              _text={{
                fontWeight: '600', // '300',
                textTransform: 'uppercase',
                fontSize: 'sm',
                _dark: { color: 'coolGray.50' },
                _light: { color: 'blueGray.900' }
              }}
            >
              {isMini ? title.substr(0, 1) : title}
            </Box>
            <RotatingView isCollapsed={isCollapsed}>
              <Icon
                as={FontAwesomeIcon}
                icon={faCaretDown}
                size="2"
                color="coolGray.400"
              />
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
