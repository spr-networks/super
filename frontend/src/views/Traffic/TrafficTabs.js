import React from 'react'
import { Platform } from 'react-native'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button, ButtonGroup, ButtonText, View } from '@gluestack-ui/themed'

import TrafficList from 'views/Traffic/TrafficList'
import TrafficInsights from 'views/Traffic/TrafficInsights'
import Traffic from 'views/Traffic/Traffic'
import TrafficTimeSeries from 'views/Traffic/TrafficTimeSeries'

const panes = [
  {
    name: 'Traffic',
    path: '/admin/traffic',
    match: ['/admin/traffic', '/admin/trafficlist'],
    component: TrafficList
  },
  {
    name: 'Insights',
    path: '/admin/traffic_insights',
    match: ['/admin/traffic_insights'],
    component: TrafficInsights
  },
  {
    name: 'Bandwidth Summary',
    path: '/admin/traffic/summary',
    match: ['/admin/traffic/summary'],
    component: Traffic,
    webOnly: true
  },
  {
    name: 'Bandwidth Timeseries',
    path: '/admin/timeseries',
    match: ['/admin/timeseries'],
    component: TrafficTimeSeries,
    webOnly: true
  }
]

const TrafficTabs = () => {
  const location = useLocation()
  const navigate = useNavigate()

  let active = panes[0]
  let best = 0
  for (let pane of panes) {
    for (let m of pane.match) {
      if (
        (location.pathname == m || location.pathname.startsWith(m + '/')) &&
        m.length > best
      ) {
        best = m.length
        active = pane
      }
    }
  }

  const visiblePanes = panes.filter(
    (p) => !(p.webOnly && Platform.OS == 'ios')
  )

  const Pane = active.component

  return (
    <View>
      <ButtonGroup size="xs" space="sm" flexWrap="wrap" p="$4" pb="$2">
        {visiblePanes.map((p) => (
          <Button
            key={p.name}
            action="secondary"
            variant={active.name == p.name ? 'solid' : 'outline'}
            onPress={() => navigate(p.path)}
          >
            <ButtonText>{p.name}</ButtonText>
          </Button>
        ))}
      </ButtonGroup>

      <Pane key={active.name} />
    </View>
  )
}

export default TrafficTabs
