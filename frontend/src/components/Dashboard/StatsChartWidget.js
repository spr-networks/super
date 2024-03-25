import React from 'react'
import PropTypes from 'prop-types'
import { prettySize } from 'utils'
import { Divider, Box, Text, useColorMode } from '@gluestack-ui/themed'
import { Dimensions } from 'react-native'
import { LineChart, ProgressChart } from 'react-native-chart-kit'
import chroma from 'chroma-js'

const StatsChartWidget = (props) => {
  let maxNum = 16
  const colorMode = useColorMode()

  let backgroundColor =
    props.colors || colorMode == 'light'
      ? '$backgroundCardLigt'
      : '$backgroundCardDark'
  let legends = props.labels || ['Sample1', 'Sample2']
  let isLineChart = props.type === 'Line'
  let title = props.title

  if (!props.data || !props.data.length) {
    return <></>
  }

  let colors =
    colorMode == 'light'
      ? chroma.scale('BuPu').mode('lch').colors(3)
      : ['#cc0000', '#00cccc', '#cc00cc']

  let values = []
  let charts = []

  // kb default
  if (!isLineChart) {
    let total = props.data[0] + props.data[1]
    let p = props.data[0] / total

    title = `${parseInt(p * 100)}% ${title}`
    let data = [p]

    data = { labels: [legends[0]], data }

    let chartConfig = {
      backgroundColor,
      backgroundGradientFromOpacity: 0,
      backgroundGradientToOpacity: 0,
      decimalPlaces: 0, // optional, defaults to 2dp
      color: (opacity = 1) => chroma(colors[1]).alpha(opacity).css() //`rgba(0, 0, 0, ${opacity})`
    }
    charts.push(
      <ProgressChart
        data={data}
        width={Dimensions.get('window').width}
        height={270}
        strokeWidth={32}
        radius={64}
        chartConfig={chartConfig}
        hideLegend={true}
      />
    )
  } else {
    // LineChart
    values = props.data.map((vals) =>
      vals
        .map((val) => val.y / 1024)
        .reverse()
        .slice(0, maxNum)
    )

    for (let idx = 0; idx < legends.length; idx++) {
      let legend = [legends[idx]]

      let labels = []

      if (isLineChart) {
        let nLabels = props.data[0].slice(0, maxNum).length

        while (nLabels--) {
          let d = props.data[0][nLabels].x
          labels.push(d.toLocaleTimeString().split(':').slice(0, 2).join(':'))
        }
      }

      let data = values[idx]

      //>10mb
      let yAxisSuffix = ' kB'
      if (Math.max(...data) > 10 * 1024) {
        data = data.map((v) => v / 1024)
        yAxisSuffix = ' MB'
      }

      let datasets = [
        {
          data,
          strokeWidth: 1,
          color: (opacity = 1) =>
            chroma(colors[idx + 1])
              .alpha(0.6)
              .css() /*`rgba(128,0,0,${opacity})` // optional*/
        }
      ]

      // NOTE we show two charts for mobile
      let chart = (
        <LineChart
          bezier
          withHorizontalLabels={true}
          withVerticalLabels={true}
          verticalLabelRotation={-40}
          withInnerLines={false}
          withOuterLines={false}
          data={{
            labels,
            datasets,
            legend
          }}
          width={Dimensions.get('window').width - 40}
          height={270}
          yAxisSuffix={yAxisSuffix}
          chartConfig={{
            backgroundColor,
            backgroundGradientFromOpacity: 0,
            backgroundGradientToOpacity: 0,
            decimalPlaces: 0,
            propsForDots: { r: 2 },
            propsForLabels: { fontSize: 9 },
            color: (opacity = 1) => colors[idx + 1],
            style: {
              borderRadius: 16
            }
          }}
          style={{
            marginVertical: 8,
            borderRadius: 8
          }}
        />
      )

      charts.push(chart)
    }
  }

  return (
    <Box
      bg="$backgroundCardLight"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
      borderRadius={10}
      mb="$4"
      py="$5"
    >
      <Text
        size="lg"
        fontWeight={300}
        color="$muted800"
        sx={{
          _dark: { color: '$muted400' }
        }}
        textAlign="center"
      >
        {title}
      </Text>
      {props.description ? <Text>{props.description}</Text> : null}

      {charts.map((chart, idx) => (
        <Box
          key={`chart_${idx}`}
          sx={{ '@base': { minH: 100 }, '@md': { minH: 280 } }}
        >
          {chart}
        </Box>
      ))}

      {props.footerText ? (
        <Box p="$2">
          <Divider my="$2" />
          {/*<i className={props.footerIcon} />*/}
          <Text>{props.footerText}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

StatsChartWidget.propTypes = {
  title: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  data: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
  description: PropTypes.string,
  labels: PropTypes.array,
  text: PropTypes.string,
  colors: PropTypes.array,
  footerIcon: PropTypes.string,
  footerText: PropTypes.string
}

export default StatsChartWidget
