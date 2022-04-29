import { useEffect, useState } from 'react'
import StatsChartWidget from './StatsChartWidget'
import { trafficAPI } from 'api'

export const TotalTraffic = (props) => {
  const [data, setData] = useState([])
  let labels = ['WanIn', 'WanOut']

  useEffect(() => {
    trafficAPI.history().then((history) => {
      let traffic = {}

      labels.map((label) => (traffic[label] = []))

      let date = new Date()
      for (let i = 0; i < history.length - 2; i++) {
        date.setMinutes(date.getMinutes() - 1)

        labels.map((label) => {
          let h1 = Object.values(history[i])
            .map((t) => t[label])
            .reduce((prev, v) => prev + v, 0)

          let h2 = Object.values(history[i + 1])
            .map((t) => t[label])
            .reduce((prev, v) => prev + v, 0)

          let x = new Date(date)
          let y = h1 - h2

          traffic[label].push({ x, y })
        })
      }

      setData(Object.values(traffic))
    })
  }, [])

  return (
    <StatsChartWidget
      title="WanIn &amp; WanOut Traffic"
      type="Line"
      labels={labels}
      data={data}
    />
  )
}
