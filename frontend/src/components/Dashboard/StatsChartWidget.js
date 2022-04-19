import PropTypes from 'prop-types'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'

import { Card, CardHeader, CardBody, CardFooter, CardTitle } from 'reactstrap'

ChartJS.register(ArcElement, Tooltip, Legend, Title)

const StatsChartWidget = (props) => {
  let text = props.text || 'Title'
  let backgroundColor = props.colors || ['#232323', '#f4f3ef']
  let labels = props.labels || ['Sample1', 'Sample2']

  const data = {
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

  const options = {
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

  let chart = ''
  if (props.type == 'Doughnut') {
    chart = (
      <Doughnut
        data={data}
        options={options}
        className="ct-chart ct-perfect-fourth"
      />
    )
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
  data: PropTypes.array.isRequired,
  description: PropTypes.string,
  labels: PropTypes.array,
  text: PropTypes.string,
  colors: PropTypes.array,
  footerIcon: PropTypes.string,
  footerText: PropTypes.string
}

export default StatsChartWidget
