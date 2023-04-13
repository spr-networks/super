import PropTypes from 'prop-types'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import chroma from 'chroma-js'

import { prettySize } from 'utils'

import { Divider, Box, Text, useColorModeValue } from 'native-base'

ChartJS.register(ArcElement, Tooltip, Legend, Title)

const StatsChartWidget = (props) => {
  let text = props.text || 'Title'
  let backgroundColor = props.colors || ['#232323', '#f4f3ef']
  let labels = props.labels || ['Sample1', 'Sample2']

  let chart = ''
  if (props.type == 'Doughnut') {
    let options = {
      /*layout: {
        padding: {
          bottom: 40
        }
      },*/
      plugins: {
        title: {
          display: true,
          text: text,
          position: 'bottom',
          color: '#66615c',
          padding: { bottom: 20 },
          font: { weight: 300, size: 24 }
        },
        legend: { display: false }
      }
    }

    let data = {
      labels,
      datasets: [
        {
          label: '# of queries',
          data: props.data || [50, 50],
          backgroundColor,
          borderWidth: 0,
          maintainAspectRatio: false,
          radius: '70%',
          cutout: '90%'
        }
      ]
    }

    chart = (
      <Doughnut
        data={data}
        options={options}
        className="ct-chart ct-perfect-fourth"
      />
    )
  } else {
    let options = {
      spanGaps: true,
      plugins: {
        title: {
          display: false
        },
        legend: { display: false },
        tooltip: {
          intersect: false,
          position: 'nearest',
          caretSize: 5,
          itemSort: (a, b) => b.raw.y - a.raw.y,
          callbacks: {
            label: (context) => {
              let label = context.dataset.label || ''
              let sz = prettySize(context.raw.y)

              return `${label}: ${sz}`
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          display: true,
          type: 'timeseries',
          distribution: 'linear',
          ticks: {
            callback: (value, index, labels) => (index % 4 === 0 ? value : '')
          }
        },
        y: {
          grid: { display: false },
          display: true,
          type: 'logarithmic',
          ticks: {
            callback: (value, index, ticks) => {
              if ((index + 1) % 10 == 0) {
                return prettySize(value, true)
              }
            }
          }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      elements: {
        point: {
          pointStyle: 'circle',
          radius: 1,
          hitRadius: 50,
          hoverRadius: 2
        }
      },
      tension: 0.4,
      fill: true
    }

    let dataopts = { datasets: [] }
    let datas = props.data
    if (!Array.isArray(datas[0])) {
      datas = [datas]
    }

    //    let colors = chroma.scale('Spectral').mode('lch').colors(labels.length)
    let colors = useColorModeValue(
      chroma
        .scale('BuPu')
        .mode('lch')
        .colors(labels.length + 1),
      ['#cc0000', '#00cccc', '#cc00cc']
    )

    dataopts.datasets = datas.map((data, i) => {
      return {
        label: labels[i],
        data,
        //fill: true,
        //backgroundColor: chroma(colors[i]).alpha(0.75).css(),
        //borderColor: chroma(colors[i]).alpha(0.75).css(),
        backgroundColor: chroma(colors[i + 1])
          .alpha(0.2)
          .css(),
        borderColor: colors[i + 1],
        borderWidth: 1,
        pointBorderColor: chroma(colors[i + 1])
          .alpha(0.4)
          .css()
      }
    })

    chart = <Line data={dataopts} options={options} />
  }

  return (
    <Box
      bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      borderRadius="10"
      mb="4"
      p="5"
      shadow={4}
    >
      <Text
        fontSize="lg"
        fontWeight={300}
        _light={{ color: 'muted.800' }}
        _dark={{ color: 'muted.400' }}
        textAlign="center"
      >
        {props.title}
      </Text>
      {props.description ? <Text>{props.description}</Text> : null}
      <Box minH={{ base: 100, md: 280 }}>{chart}</Box>
      {props.footerText ? (
        <Box p="2">
          <Divider _light={{ bg: 'muted.200' }} my="2" />
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
