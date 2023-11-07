import React, { useContext, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigate } from 'react-router-dom'
/*import { useNavigate as useNavigateWeb } from 'react-router-dom'
import { useNavigate as useNavigateNative } from 'react-router-native'*/
import { Animated } from 'react-native'
import { AppContext } from 'AppContext'

import {
  Box,
  Pressable,
  ScrollView,
  HStack,
  Icon,
  VStack,
  Text,
  useColorMode,
  Input,
  InputField
} from '@gluestack-ui/themed'

import { ChevronDownIcon } from 'lucide-react-native'

const Collapse = ({ isOpen, ...props }) => {
  return <VStack display={isOpen ? 'flex' : 'none'}>{props.children}</VStack>
}

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

  if (!sidebarItems.length) {
    return <></>
  }

  return (
    <ScrollView
      w={isMini ? '20' : '100%'}
      borderRightWidth={isMobile ? '$0' : '$1'}
      sx={{
        _light: {
          bg: '$sidebarBackgroundLight',
          borderColor: '$coolGray100'
        },
        _dark: { bg: '$sidebarBackgroundDark', borderColor: '$coolGray800' }
      }}
    >
      {showSearch ? (
        <Box p="$4">
          <Input>
            <InputField
              onChangeText={onChangeFilter}
              placeholder="Search menu"
            />
          </Input>
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
  const navigate = useNavigate()

  /*useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeSidebarItem])*/

  return sidebarItems.map((item, index) => {
    let display = 'flex'
    if (item.redirect || (item.layout !== 'admin' && !item.views)) {
      display = 'none'
      return null
    }

    // if mesh
    let meshItems = [
      'Auth',
      'Events',
      'Uplink',
      'Logs',
      'Notifications',
      'Home',
      'Wifi',
      'MESH',
      'System',
      'Plugins',
      'System Info',
      'Signal Strength'
    ]

    if (isMeshNode && !meshItems.includes(item.name)) {
      display = 'none'
      return null
    }

    // menu items hidden when wifi mode is disabled
    if (item.wifi === true && isWifiDisabled) {
      display = 'none'
    }

    // menu items hidden when plus mode is disabled
    if (item.plus === true && isPlusDisabled) {
      display = 'none'
    }

    if (item.hidden) {
      display = 'none'
    }

    const colorMode = useColorMode()

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
            sx={{
              bg:
                item.path === activeSidebarItem
                  ? colorMode == 'light'
                    ? '$coolGray200'
                    : '$coolGray800'
                  : 'transparent',

              ':hover': {
                bg:
                  item.path === activeSidebarItem
                    ? '$blueGray200'
                    : '$coolGray100',

                _dark: {
                  bg:
                    item.path === activeSidebarItem
                      ? '$coolGray600'
                      : '$coolGray900'
                }
              }
            }}
          >
            <Box px="$8" py="$2.5">
              <HStack
                space="sm"
                alignItems="center"
                pl={level > 1 ? level + 14 : '0'}
              >
                {item.icon !== undefined ? (
                  <Icon
                    as={item.icon}
                    size={18}
                    color={
                      colorMode == 'light' ? '$coolGray600' : '$coolGray400'
                    }
                  />
                ) : null}
                {isMini ? null : (
                  <Text
                    fontWeight="300"
                    size="sm"
                    color={colorMode == 'light' ? '#11181c' : '$coolGray300'}
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
  const colorMode = useColorMode()

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
            px={'$8'}
            py={'$2.5'}
          >
            {/*icon && typeof icon !== 'string' ? (
              <Icon icon={icon} />
            ) : null*/}
            <Box flexShrink="1">
              <Text
                size="sm"
                textTransform="uppercase"
                fontWeight="600"
                color={colorMode == 'light' ? '$blueGray900' : '$coolGray300'}
              >
                {isMini ? title.substr(0, 1) : title}
              </Text>
            </Box>
            <RotatingView isCollapsed={isCollapsed}>
              <Icon as={ChevronDownIcon} color="$coolGray400" />
            </RotatingView>
          </HStack>
        </Pressable>
        <Collapse isOpen={!isCollapsed}>{children}</Collapse>
      </Box>
    )
  else
    return (
      <Box mb="$9">
        <HStack
          justifyContent="space-between"
          alignItems="center"
          pl="$8"
          px="$4"
          py="$2.5"
        >
          <Box
            flexShrink="1"
            _text={{
              textTransform: 'uppercase',
              fontWeight: '600',
              size: 'sm',
              _dark: { color: '$coolGray50' },
              _light: { color: '$blueGray900' }
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
      useNativeDriver: Platform.OS == 'ios' //true
    }).start()
  }

  const rotateLeft = () => {
    Animated.timing(rotateAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: Platform.OS == 'ios' //true
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
