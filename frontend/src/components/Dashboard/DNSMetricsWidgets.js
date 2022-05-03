import { Component } from 'react'
import { faBan, faGlobe } from '@fortawesome/free-solid-svg-icons'

import { blockAPI } from 'api/DNS'
import StatsWidget from './StatsWidget'
import StatsChartWidget from './StatsChartWidget'

export class DNSMetrics extends Component {
  state = { TotalQueries: 0, BlockedQueries: 0 }
  async componentDidMount() {
    const metrics = await blockAPI.metrics()
    this.setState({ TotalQueries: metrics.TotalQueries })
    this.setState({ BlockedQueries: metrics.BlockedQueries })
  }

  render() {
    return (
      <StatsWidget
        icon={faGlobe}
        iconColor="success.400"
        title="Total DNS queries"
        text={this.state.TotalQueries}
        textFooterHide={this.state.BlockedQueries + ' blocked'}
        iconFooterHide="fa fa-ban"
      />
    )
  }
}

export class DNSBlockMetrics extends DNSMetrics {
  render() {
    return (
      <StatsWidget
        icon={faBan}
        iconColor="danger.400"
        title="Blocked DNS queries"
        text={this.state.BlockedQueries}
      />
    )
  }
}

export class DNSBlockPercent extends DNSMetrics {
  render() {
    if (!this.state.TotalQueries) {
      return <div></div>
    }

    let data = [this.state.BlockedQueries, this.state.TotalQueries]
    let percent = Math.round(
      (this.state.BlockedQueries / this.state.TotalQueries) * 100
    )

    return (
      <StatsChartWidget
        title="Percent Blocked"
        type="Doughnut"
        descriptionHide="Query block Performance"
        labels={['Blocked', 'Total']}
        data={data}
        text={`${percent}%`}
        colors={['#ef8157', '#f4f3ef']}
      />
    )
  }
}

export default DNSMetrics
