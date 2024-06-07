import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Dimensions } from 'react-native'
import { TabView, SceneMap } from 'react-native-tab-view'

import {
  Box,
  HStack,
  Icon,
  Pressable,
  Text,
  View,
  useColorMode
} from '@gluestack-ui/themed'

const TabViewComponent = ({ tabs, ...props }) => {
  const [index, setIndex] = useState(0)
  const [routes] = useState(
    tabs.map((tab, key) => ({
      key: `tab${key}`,
      title: tab.title,
      icon: tab.icon
    }))
  )

  const initialLayout = {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height
  }

  //NOTE key maps to title in routes
  let sceneMap = Object.fromEntries(
    tabs.map((tab, i) => [`tab${i}`, tab.component])
  )
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
          let color = colorMode == 'light' ? '$muted600' : '$muted600'
          let borderColor = colorMode == 'light' ? '$muted200' : '$muted800'

          if (index === i) {
            color = colorMode == 'light' ? '$muted700' : '$muted400'
            borderColor = '$cyan500'
          }

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
                  {route.icon ? (
                    <Icon as={route.icon} color={color} size="xs" />
                  ) : null}
                  <Text size="sm" color={color}>
                    {route.title}
                  </Text>
                </HStack>
              </Pressable>
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <View h="$full">
      <TabView
        navigationState={{
          index,
          routes
        }}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        swipeEnabled={false}
      />
    </View>
  )
}

TabViewComponent.propTypes = {
  tabs: PropTypes.array
}

export default TabViewComponent
