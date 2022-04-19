import PropTypes from 'prop-types'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import chroma from 'chroma-js'

import { prettySize } from 'utils'

import { Card, CardHeader, CardBody, CardFooter, CardTitle } from 'reactstrap'

ChartJS.register(ArcElement, Tooltip, Legend, Title)

const StatsChartWidget = (props) => {
  let text = props.text || 'Title'
  let backgroundColor = props.colors || ['#232323', '#f4f3ef']
  let labels = props.labels || ['Sample1', 'Sample2']

  let chart = ''
  if (props.type == 'Doughnut') {
    let options = {
      plugins: {
        title: {
          display: true,
          text: text,
          position: 'bottom',
          color: '#66615c',
          font: { weight: 400, size: 30 }
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
          radius: '80%',
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
              if (index % 4 == 0) {
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
          radius: 0,
          hitRadius: 50,
          hoverRadius: 2
        }
      }
    }

    let dataopts = { datasets: [] }
    let datas = props.data
    if (!Array.isArray(datas[0])) {
      datas = [datas]
    }

    let colors = chroma.scale('Spectral').mode('lch').colors(labels.length)

    dataopts.datasets = datas.map((data, i) => {
      return {
        label: labels[i],
        data,
        backgroundColor: colors[i],
        borderColor: colors[i],
        borderWidth: 1
      }
    })

    chart = <Line data={dataopts} options={options} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle tag="h5" className="text-muted text-center">
          {props.title}
        </CardTitle>
        {props.description ? (
          <p className="card-category">{props.description}</p>
        ) : null}
      </CardHeader>
      <CardBody style={{ paddingTop: 0 }}>{chart}</CardBody>
      {props.footerText ? (
        <CardFooter style={{ paddingTop: 0 }}>
          <hr />
          <div className="stats">
            <i className={props.footerIcon} />
            {props.footerText}
          </div>
        </CardFooter>
      ) : null}
    </Card>
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
