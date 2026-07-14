import React from 'react'
import PropTypes from 'prop-types'
import { Dimensions } from 'react-native'
import { LineChart } from 'react-native-chart-kit'
import { Box, Text, useColorMode } from '@gluestack-ui/themed'
import { buildWanSeries, metricSuffix, withAlpha } from './wanChartData'

const MAX_POINTS = 24

const resample = (points, count) => {
  if (!points.length || count <= 0) {
    return []
  }
  if (points.length == 1) {
    return Array(count).fill(points[0])
  }
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(points[Math.round((i * (points.length - 1)) / (count - 1))])
  }
  return out
}

const WanHealthChart = ({ histories, metric }) => {
  const colorMode = useColorMode()
  const tickColor = colorMode == 'light' ? '#64748b' : '#94a3b8'
  const gridColor =
    colorMode == 'light' ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.15)'

  const series = buildWanSeries(histories, metric).filter(
    (s) => s.points.length
  )

  if (!series.length) {
    return (
      <Box p="$4">
        <Text size="sm" color="$muted500">
          No samples recorded yet
        </Text>
      </Box>
    )
  }

  const target = Math.min(
    MAX_POINTS,
    Math.max(...series.map((s) => s.points.length))
  )
  const sampled = series.map((s) => ({
    ...s,
    points: resample(s.points, target)
  }))

  const labelEvery = Math.max(1, Math.ceil(target / 6))
  const labels = sampled[0].points.map((p, i) => {
    if (i % labelEvery) {
      return ''
    }
    return new Date(p.x).toLocaleTimeString().split(':').slice(0, 2).join(':')
  })

  const datasets = sampled.map((s) => ({
    data: s.points.map((p) => (Number.isFinite(p.y) ? p.y : 0)),
    color: (opacity = 1) => withAlpha(s.color, opacity),
    strokeWidth: 1.5
  }))

  const data = { labels, datasets }
  if (sampled.length > 1) {
    data.legend = sampled.map((s) => s.label)
  }

  const chartConfig = {
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    decimalPlaces: metric == 'loss' ? 0 : 1,
    color: (opacity = 1) => withAlpha(sampled[0].color, opacity),
    labelColor: () => tickColor,
    propsForBackgroundLines: { stroke: gridColor, strokeDasharray: '' },
    propsForLabels: { fontSize: 11 }
  }

  return (
    <LineChart
      bezier
      fromZero
      withDots={false}
      withInnerLines={true}
      withOuterLines={false}
      segments={4}
      data={data}
      width={Dimensions.get('window').width - 32}
      height={260}
      yAxisSuffix={metricSuffix(metric)}
      chartConfig={chartConfig}
    />
  )
}

WanHealthChart.propTypes = {
  histories: PropTypes.object,
  metric: PropTypes.string
}

export default WanHealthChart
