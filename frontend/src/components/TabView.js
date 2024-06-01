import React, { useState } from 'react'

import { Dimensions } from 'react-native'
import { TabView, SceneMap } from 'react-native-tab-view'
import {
  Box,
  HStack,
  Icon,
  Pressable,
  Text,
  useColorMode
} from '@gluestack-ui/themed'

const TabViewComponent = ({ tabs, ...props }) => {
  const [index, setIndex] = useState(0)
  const [routes] = useState(
    tabs.map((tab, key) => ({ key, title: tab.title, icon: tab.icon }))
  )

  const initialLayout = {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height
  }

  //NOTE key maps to title in routes
  let sceneMap = Object.fromEntries(tabs.map((tab, i) => [i, tab.component]))
  const renderScene = SceneMap(sceneMap)

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
                {/*<Animated.Text style={{color}}>{route.title}</Animated.Text>*/}
                <HStack space="xs" alignItems="center">
                  {route.icon ? <Icon as={route.icon} size="xs" /> : null}
                  <Text size="sm">{route.title}</Text>
                </HStack>
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
    />
  )
}

export default TabViewComponent
