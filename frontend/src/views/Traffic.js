import React, { useContext, Component } from 'react'
// react plugin used to create charts
import { Chart as ChartJS } from 'chart.js/auto'
import { Bar } from 'react-chartjs-2'

import { deviceAPI, trafficAPI, wifiAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'

import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Row,
  Col,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem
} from 'reactstrap'

export default class Traffic extends Component {
  state = {
    lan: { totalIn: 0, totalOut: 0 },
    wan: { totalIn: 0, totalOut: 0 },
    wan_scale: 'All Time',
    lan_scale: 'All Time'
  }

  static contextType = APIErrorContext
  macToName = {}
  ipToMac = {}

  async processTrafficHistory(target, scale) {
    const devices = await deviceAPI.list().catch((error) => {
      this.context.reportError(
        'API Failure get ' + target + 'traffic: ' + error.message
      )
    })

    const arp = await wifiAPI.arp().catch((error) => {
      this.context.reportError(
        'API Failure get arp information: ' + error.message
      )
    })

    for (const a of arp) {
      //skip incomplete entries
      if (a.MAC == '00:00:00:00:00:00') {
        continue
      }
      this.ipToMac[a.IP] = a.MAC
    }

    Object.keys(devices).forEach((mac) => {
      this.macToName[mac] = devices[mac].Name
    })

    let processData = (data_in, data_out) => {
      if (!data_in || !data_out) {
        return
      }

      let data = {
        labels: [],
        datasets: [
          {
            label: 'Down',
            borderColor: '#fcc468',
            fill: true,
            backgroundColor: '#fcc468',
            hoverBorderColor: '#fcc468',
            borderWidth: 1,
            barPercentage: 0.7,
            data: []
          },
          {
            label: 'Up',
            borderColor: '#4cbdd7',
            fill: true,
            backgroundColor: '#4cbdd7',
            hoverBorderColor: '#4cbdd7',
            borderWidth: 1,
            barPercentage: 0.7,
            data: []
          }
        ]
      }

      let totalOut = 0
      let totalIn = 0

      let traffic = { Incoming: data_in, Outgoing: data_out }

      let d = {}

      let normalize = (f) => {
        return (f * 1.0) / 1024.0 / 1024.0
      }

      for (const entry of traffic['Outgoing']) {
        if (!d[entry['IP']]) {
          d[entry['IP']] = {}
        }
        totalOut += entry['Bytes']
        d[entry['IP']]['Out'] = normalize(entry['Bytes'])
      }

      for (const entry of traffic['Incoming']) {
        if (!d[entry['IP']]) {
          d[entry['IP']] = {}
        }
        totalIn += entry['Bytes']
        d[entry['IP']]['In'] = normalize(entry['Bytes'])
      }

      let d_labels = []
      let d_in = []
      let d_out = []

      for (const e of Object.keys(d)) {
        d_labels.push(e)
        d_in.push(d[e]['In'])
        d_out.push(d[e]['Out'])
      }

      data.labels = d_labels
      data.datasets[0].data = d_in
      data.datasets[1].data = d_out
      data.totalIn = totalIn
      data.totalOut = totalOut
      return data
    }

    let do_time_series = scale != 'All Time'

    if (do_time_series) {
      let traffic_series = await trafficAPI.history().catch((error) => {
        this.context.reportError(
          'API Failure get traffic history: ' + error.message
        )
      })

      let recent_reading = traffic_series[0]
      let offset = 0
      if (scale == '1 Hour') {
        offset = 60 - 1
      } else if (scale == '1 Day') {
        offset = 60 * 24 - 1
      } else if (scale == '15 Minutes') {
        offset = 15 - 1
      }

      if (offset >= traffic_series.length) {
        offset = traffic_series.length - 1
      }
      let previous_reading = traffic_series[offset]

      //get delta for each IP in the traffic set
      let clientsLanIn = {}
      let clientsLanOut = {}
      let clientsWanIn = {}
      let clientsWanOut = {}

      for (const IP in recent_reading) {
        clientsLanIn[IP] = recent_reading[IP].LanIn
        clientsWanIn[IP] = recent_reading[IP].WanIn
        clientsLanOut[IP] = recent_reading[IP].LanOut
        clientsWanOut[IP] = recent_reading[IP].WanOut
      }

      //subtract delta from the previous reading
      for (const IP in recent_reading) {
        if (previous_reading[IP]) {
          if (previous_reading[IP].LanIn < clientsLanIn[IP])
            clientsLanIn[IP] -= previous_reading[IP].LanIn
          if (previous_reading[IP].WanIn < clientsWanIn[IP])
            clientsWanIn[IP] -= previous_reading[IP].WanIn
          if (previous_reading[IP].LanOut < clientsLanOut[IP])
            clientsLanOut[IP] -= previous_reading[IP].LanOut
          if (previous_reading[IP].WanOut < clientsWanOut[IP])
            clientsWanOut[IP] -= previous_reading[IP].WanOut
        }
      }

      let dataIn = target == 'lan' ? clientsLanIn : clientsWanIn
      let dataOut = target == 'lan' ? clientsLanOut : clientsWanOut
      let dataPointsIn = []
      let dataPointsOut = []
      for (const ip in dataIn) {
        dataPointsIn.push({ IP: ip, Bytes: dataIn[ip] })
      }
      for (const ip in dataOut) {
        dataPointsOut.push({ IP: ip, Bytes: dataOut[ip] })
      }
      return processData(dataPointsIn, dataPointsOut)
    } else {
      //data for all time traffic
      const traffic_in = await trafficAPI
        .traffic('incoming_traffic_' + target)
        .catch((error) => {
          this.context.reportError('API Failure get traffic: ' + error.message)
        })
      const traffic_out = await trafficAPI
        .traffic('outgoing_traffic_' + target)
        .catch((error) => {
          this.context.reportError(
            'API Failure get ' + target + ' traffic: ' + error.message
          )
        })
      return processData(traffic_in, traffic_out)
    }
  }

  async componentDidMount() {
    let lan_data = await this.processTrafficHistory('lan', this.state.lan_scale)
    let wan_data = await this.processTrafficHistory('wan', this.state.wan_scale)

    this.setState({ lan: lan_data, wan: wan_data })
  }

  templateData = {
    options: {
      indexAxis: 'x',
      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          callbacks: {
            beforeBody: (TooltipItems, object) => {
              let ip = TooltipItems[0].label
              let label = ''
              let mac = this.ipToMac[ip]
              let name = this.macToName[mac]
              if (mac) {
                label = mac
              }
              if (name) {
                label = label + '  ' + name
              }

              return label
            }
          }
        },

        tooltips: {
          tooltipFillColor: 'rgba(0,0,0,0.5)',
          tooltipFontFamily:
            "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
          tooltipFontSize: 14,
          tooltipFontStyle: 'normal',
          tooltipFontColor: '#fff',
          tooltipTitleFontFamily:
            "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
          tooltipTitleFontSize: 14,
          tooltipTitleFontStyle: 'bold',
          tooltipTitleFontColor: '#fff',
          tooltipYPadding: 6,
          tooltipXPadding: 6,
          tooltipCaretSize: 8,
          tooltipCornerRadius: 6,
          tooltipXOffset: 10
        }
      },
      scales: {
        y: {
          min: 0.01,
          type: 'logarithmic',
          ticks: {
            /* callback: (a,b,c) => {}, */
            callback: function (value, index, values) {
              return value + 'MB'
            },
            includeBounds: true,
            color: '#9f9f9f',
            maxTicksLimit: 5
          },
          grid: {
            zeroLineColor: 'transparent',
            display: true,
            drawBorder: false,
            color: '#9f9f9f'
          }
        },
        x: {
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            padding: 20,
            color: '#9f9f9f'
          }
        }
      }
    }
  }

  render() {
    let handleScaleMenu = (e) => {
      let choice = e.target.parentNode.getAttribute('value')
      let scale = e.target.value

      this.state[choice + '_scale'] = scale
      this.processTrafficHistory(choice, scale).then((result) => {
        let o = {}
        o[choice] = result
        this.setState(o)
      })
    }

    return (
      <div className="content">
        <Row>
          <Col md="10"></Col>
          <Col md="2">
            <UncontrolledDropdown group>
              <DropdownToggle caret color="default">
                {this.state.wan_scale}
              </DropdownToggle>
              <DropdownMenu value="wan">
                <DropdownItem value="All Time" onClick={handleScaleMenu}>
                  All time
                </DropdownItem>
                <DropdownItem value="1 Day" onClick={handleScaleMenu}>
                  Last Day
                </DropdownItem>
                <DropdownItem value="1 Hour" onClick={handleScaleMenu}>
                  Last Hour
                </DropdownItem>
                <DropdownItem value="15 Minutes" onClick={handleScaleMenu}>
                  Last 15 Minutes
                </DropdownItem>
              </DropdownMenu>
            </UncontrolledDropdown>
          </Col>
        </Row>
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <CardTitle tag="h4">
                  Device WAN Traffic ⸺ {this.state.wan_scale} ⸺ IN:{' '}
                  {parseFloat(
                    this.state.wan
                      ? this.state.wan.totalIn / 1024 / 1024 / 1024
                      : 0
                  ).toFixed(2)}{' '}
                  GB OUT:{' '}
                  {parseFloat(
                    this.state.wan
                      ? this.state.wan.totalOut / 1024 / 1024 / 1024
                      : 0
                  ).toFixed(2)}{' '}
                  GB
                </CardTitle>
              </CardHeader>
              <CardBody>
                {this.state.wan.datasets ? (
                  <Bar
                    data={this.state.wan}
                    options={this.templateData.options}
                  />
                ) : null}
              </CardBody>
            </Card>
          </Col>
        </Row>

        <Row>
          <Col md="10"></Col>
          <Col md="2">
            <UncontrolledDropdown group>
              <DropdownToggle caret color="default">
                {this.state.lan_scale}
              </DropdownToggle>
              <DropdownMenu value="lan">
                <DropdownItem value="All Time" onClick={handleScaleMenu}>
                  All time
                </DropdownItem>
                <DropdownItem value="1 Day" onClick={handleScaleMenu}>
                  Last Day
                </DropdownItem>
                <DropdownItem value="1 Hour" onClick={handleScaleMenu}>
                  Last Hour
                </DropdownItem>
                <DropdownItem value="15 Minutes" onClick={handleScaleMenu}>
                  Last 15 Minutes
                </DropdownItem>
              </DropdownMenu>
            </UncontrolledDropdown>
          </Col>
        </Row>
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <CardTitle tag="h4">
                  Device LAN Traffic ⸺ {this.state.lan_scale} ⸺ IN:{' '}
                  {parseFloat(
                    this.state.lan
                      ? this.state.lan.totalIn / 1024 / 1024 / 1024
                      : 0
                  ).toFixed(2)}{' '}
                  GB OUT:{' '}
                  {parseFloat(
                    this.state.lan
                      ? this.state.lan.totalOut / 1024 / 1024 / 1024
                      : 0
                  ).toFixed(2)}{' '}
                  GB
                </CardTitle>
              </CardHeader>
              <CardBody>
                {this.state.lan && this.state.lan.datasets ? (
                  <Bar
                    data={this.state.lan}
                    options={this.templateData.options}
                  />
                ) : null}
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
    )
  }
}
