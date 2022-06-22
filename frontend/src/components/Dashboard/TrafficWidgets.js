import { useEffect, useState } from 'react'
import StatsChartWidget from './StatsChartWidget'
import { trafficAPI } from 'api'

export const TotalTraffic = (props) => {
  const [data, setData] = useState([])
  let labels = ['WanIn', 'WanOut']

  useEffect(() => {
    const fetchData = () => {
      trafficAPI.history().then((history) => {
        let traffic = {}

        labels.map((label) => (traffic[label] = []))

        let start = new Date(),
          step = 20
        for (let i = 0; i < history.length - 2; i += step) {
          if (i >= 20 * step) break

          labels.map((label) => {
            let h1 = Object.values(history[i])
              .map((t) => t[label])
              .reduce((prev, v) => prev + v, 0)

            let h2 = Object.values(history[i + 1])
              .map((t) => t[label])
              .reduce((prev, v) => prev + v, 0)

            let x = new Date(start)
            x.setMinutes(start.getMinutes() - i)
            let y = h1 - h2

            traffic[label].push({ x, y })
          })
        }

        setData(Object.values(traffic))
      })
    }

    fetchData()

    const interval = setInterval(fetchData, 60 * 1e3)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return (
    <StatsChartWidget
      title="Outbound Traffic"
      type="Line"
      labels={labels}
      data={data}
    />
  )
}
