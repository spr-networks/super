import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { Platform, Dimensions, ScrollView } from 'react-native'
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

  // Map tab data to a consistent format
  const parsedTabs = Array.isArray(tabs)
    ? tabs.map(tab => ({
        title: tab.label || tab.title,
        icon: tab.icon,
        component: tab.component || tab.renderItem()
      }))
    : tabs;

  const [routes] = useState(
    parsedTabs.map((tab, key) => ({
      key: `tab${key}`,
      title: tab.title,
      icon: tab.icon,
      description: tab.description
    }))
  )

  const initialLayout = {
    width: Dimensions.get('window').width
  }

  // Create scene map correctly to maintain component references
  const renderScene = ({ route }) => {
    const tabIndex = parseInt(route.key.replace('tab', ''), 10)
    const TabComponent = parsedTabs[tabIndex].component

    return (
      <View style={{ flex: 1 }}>
        <TabComponent />
      </View>
    )
  }

  const renderTabBar = (props) => {
    const { colorMode } = useColorMode()
    return (
      <Box borderBottomWidth={1} borderColor={colorMode === 'light' ? '$muted200' : '$muted800'}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={Platform.OS === 'web' && window.innerWidth > 768}
        >
          <HStack>
            {props.navigationState.routes.map((route, i) => {
              let color = colorMode === 'light' ? '$muted600' : '$muted600'
              let borderColor = 'transparent'
              let fontWeight = "normal"
              if (index === i) {
                color = colorMode === 'light' ? '$muted700' : '$muted400'
                borderColor = '$cyan500'
                fontWeight = "bold"
              }
              return (
                <Pressable
                  key={route.title}
                  onPress={() => {
                    setIndex(i)
                  }}
                >
                  <Box
                    borderBottomWidth={3}
                    borderColor={borderColor}
                    px="$3"
                    py="$3"
                  >
                    <HStack space="xs" alignItems="center">
                      {route.icon && (
                        <Icon as={route.icon} color={color} size="sm" />
                      )}
                      <Text size="sm" numberOfLines={1} fontWeight={fontWeight}>
                        {route.title}
                      </Text>
                    </HStack>
                  </Box>
                </Pressable>
              )
            })}
          </HStack>
        </ScrollView>
      </Box>
    )
  }

  return (
    <View style={{ height: "100%" }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
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
          style={{ flex: 1 }}
        />
      </ScrollView>
    </View>
  )
}

TabViewComponent.propTypes = {
  tabs: PropTypes.oneOfType([
    PropTypes.array,
    PropTypes.object
  ]),
}

export default TabViewComponent
