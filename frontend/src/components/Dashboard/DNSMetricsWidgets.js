import { Component, useEffect } from 'react'
import { blockAPI } from 'api/DNS'
import StatsWidget from './StatsWidget'

export class DNSMetrics extends Component {
  state = {TotalQueries: 0, BlockedQueries: 0}
  async componentDidMount() {
    const metrics = await blockAPI.metrics()
    this.setState({ TotalQueries: metrics.TotalQueries })
    this.setState({ BlockedQueries: metrics.BlockedQueries })
  }

  render () {
    return (
      <StatsWidget
        icon="fa fa-globe text-success"
        title="Total DNS queries"
        text={this.state.TotalQueries}
        textFooterHide={this.state.BlockedQueries + " blocked"}
        iconFooterHide="fa fa-ban"
      />
    )
  }
}

export class DNSBlockMetrics extends Component {
  state = {TotalQueries: 0, BlockedQueries: 0}
  async componentDidMount() {
    const metrics = await blockAPI.metrics()
    this.setState({ TotalQueries: metrics.TotalQueries })
    this.setState({ BlockedQueries: metrics.BlockedQueries })
  }

  render () {
    return (
      <StatsWidget
        icon="fa fa-ban text-danger"
        title="Blocked DNS queries"
        text={this.state.BlockedQueries}
        textFooterHide={this.state.BlockedQueries + " blocked"}
        iconFooterHide="fa fa-ban"
      />
    )
  }
}

export default DNSMetrics