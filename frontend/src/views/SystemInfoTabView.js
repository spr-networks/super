import React, { useContext, useState } from 'react'

import { AlertContext } from 'layouts/Admin'
import SystemInfo from 'views/System/SystemInfo'
import SystemInfoContainers from 'views/System/SystemInfoContainers'
import SystemInfoNetworkMisc from 'views/System/SystemInfoNetworkMisc'

import { Animated, Dimensions, Platform } from 'react-native'
import { TabView, SceneMap } from 'react-native-tab-view'

import { Box, View, Pressable, useColorMode } from '@gluestack-ui/themed'

const SystemInfoTabView = (props) => {
  const [index, setIndex] = useState(0) //1)

  const context = useContext(AlertContext)

  const [routes] = useState([
    {
      key: 'first',
      title: 'System'
    },
    {
      key: 'second',
      title: 'Containers'
    },
    {
      key: 'third',
      title: 'Network Info'
    }
  ])

  const initialLayout = {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height
  }

  const renderScene = SceneMap({
    first: SystemInfo,
    second: SystemInfoContainers,
    third: SystemInfoNetworkMisc
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

          const colorMode = useColorMode()
          const color =
            index === i
              ? colorMode == 'light'
                ? '#000'
                : '#e5e5e5'
              : colorMode == 'light'
              ? '#1f2937'
              : '#a1a1aa'
          const borderColor =
            index === i
              ? '$cyan500'
              : colorMode == 'light'
              ? '$coolGray200'
              : '$gray400'
          return (
            <Box
              key={route.title}
              borderBottomWidth={3}
              borderColor={borderColor}
              flex={1}
              alignItems="center"
              px="$2"
              py="$4"
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

  // also have the tabs
  let navbarHeight = 64
  let tabsHeight = 32
  let heightContent =
    Platform.OS == 'web'
      ? Dimensions.get('window').height - navbarHeight
      : '100%'

  return (
    <View h={heightContent}>
      <TabView
        navigationState={{
          index,
          routes
        }}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
      />
    </View>
  )
}

export default SystemInfoTabView
