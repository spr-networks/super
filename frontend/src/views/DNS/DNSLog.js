import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import AsyncStorage from '@react-native-async-storage/async-storage'

import DNSLogHistoryList from 'components/DNS/DNSLogHistoryList'
//import DNSChart from 'components/DNS/DNSChart'
import DNSLogEdit from 'views/DNS/DNSLogEdit'
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import { Animated, Dimensions, Platform } from 'react-native'
import { TabView, SceneMap } from 'react-native-tab-view'

import { Box, View, Pressable, useColorMode } from '@gluestack-ui/themed'


const DNSLog = (props) => {
  const [isEnabled, setIsEnabled] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [filterIps, setFilterIps] = useState([])

  const params = useParams()

  useEffect(() => {
    let { ips, text } = params
    if (ips && ips != ':ips') {
      setFilterIps(ips.split(','))
    } else {
      AsyncStorage.getItem('select')
        .then((oldSelect) => {
          let select = JSON.parse(oldSelect) || {}
          if (select?.filterIps) {
            setFilterIps(select.filterIps)
          }
        })
        .catch((err) => {})
    }

    if (text && text != ':text') {
      setFilterText(text)
    }

    logAPI.config().catch((error) => setIsEnabled(false))
  }, [])

  if (!isEnabled) {
    return <PluginDisabled plugin="dns" />
  }

  return (
    <DNSLogHistoryList ips={filterIps} filterText={filterText} />
  )
}


const DNSTabView = (props) => {
  const [index, setIndex] = useState(0) //1)
  const [routes] = useState([
    {
      key: 'first',
      title: 'DNS Log'
    },
    {
      key: 'second',
      title: 'Log Settings'
    }
/*    ,
    {
      key: 'third',
      title: 'Graph'
    }
*/
  ])

  const initialLayout = {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height
  }

  const renderScene = SceneMap({
    first: DNSLog,
    second: DNSLogEdit,
//    third: DNSChart
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

  if (Platform.OS == 'web') {
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
  } else {
    return (
      <View>
        <DNSLog {...props}/>
      </View>
    )
  }
}

export default DNSTabView
