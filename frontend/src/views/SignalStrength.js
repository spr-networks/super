import React, { useContext, Component } from 'react'
// react plugin used to create charts
import { Line, Bar, Scatter } from "react-chartjs-2";
import { hostapdAllStations, getArp, getDevices } from "components/Helpers/Api.js";
import {APIErrorContext} from 'layouts/Admin.js';
import { UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from 'reactstrap';


// reactstrap components
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Label,
  FormGroup,
  Input,
  Table,
  Row,
  Col,
  UncontrolledTooltip,
} from "reactstrap";

export default class SignalStrength extends Component {

    state = {signals : {}, signal_scale: "All Time"};

    static contextType = APIErrorContext;
    macToName = {}
    macToIP = {}

    async processTrafficHistory(target, scale) {
      const devices = await getDevices().catch(error => {
        this.context.reportError("API Failure get traffic: " + error.message)
      })

      const arp = await getArp().catch(error => {
        this.context.reportError("API Failure get traffic: " + error.message)
      })

      for (const a of arp) {
        //skip incomplete entries
        if (a.Mac == "00:00:00:00:00:00") {
          continue
        }
        this.macToIP[a.Mac] = a.IP
      }

      Object.keys(devices).forEach( (mac) => {
        this.macToName[mac] = devices[mac].Comment
      })

      let processData = (signals)  => {

        let data = {
          labels: [
          ],
          datasets: [
            {
              label: "Signal",
              yAxisID: 'RSSI',
              fill: true,
              backgroundColor: [],
              borderWidth: 1,
              barPercentage: 0.5,
              data: [
              ],
            },/*
            {
              label: "RX Rate",
              yAxisID: 'Rate',
              fill: true,
              backgroundColor: "#4cbdd7",
              borderWidth: 1,
              barPercentage: 0.5,
              data: [
              ],
            },
            {
              label: "TX Rate",
              yAxisID: 'Rate',
              fill: true,
              backgroundColor: "#4cbdd7",
              borderWidth: 1,
              barPercentage: 0.5,
              data: [
              ],
            }*/
          ]
        }



        let d_labels = []
        let d_signal = []
        let d_tx = []
        let d_rx = []
        let d_colors = []
        for (const entry of signals) {
          d_labels.push(entry.Mac)
          d_signal.push(entry.Signal)
          d_tx.push(entry.TX)
          d_rx.push(entry.RX)
          let color = ""
          //match _variables.scss
          if (entry.Signal >= -60) {
            color = "rgb(24, 206, 15)"
          } else if (entry.Signal >= -70) {
            color = "rgb(44, 168, 255)"
          } else if (entry.Signal >= -80) {
            color = "rgb(255, 178, 54)"
          } else {
            color = "rgb(255, 54, 54)"
          }
          d_colors.push(color)
        }

        data.labels = d_labels
        data.datasets[0].data = d_signal
        data.datasets[0].backgroundColor = d_colors
        /*
        data.datasets[1].data = d_rx
        data.datasets[2].data = d_tx
        */
        return data
      }

      if (scale == "All Time") {
        //data for all time traffic
        const stations = await hostapdAllStations().catch(error => {
          this.context.reportError("API Failure get traffic: " + error.message)
        })
        let signals = []
        for (let mac in stations) {
          let station = stations[mac]
          signals.push({Mac: mac, Signal: parseInt(station.signal), TX: parseInt(station.tx_rate_info), RX: parseInt(station.rx_rate_info)})
        }
        return processData(signals)
      }

    }

    async componentDidMount() {
      let signal_data = await this.processTrafficHistory("signal", this.state.signal_scale)
      this.setState({signals: signal_data})
    }


    templateData = {
      options: {
        indexAxis: 'x',
        plugins: {
          legend: {
            display: false,
          },

          tooltip: {
            callbacks: {
              beforeBody: (TooltipItems, object) => {
                let mac = TooltipItems[0].label
                let ip = this.macToIP[mac]
                let name = this.macToName[mac]
                let label = ""
                if (name) {
                  label = label + "  " + name
                }
                if (ip) {
                  label = label + "  " + ip
                }

                return label
              }
            }

          },

          tooltips: {
            tooltipFillColor: "rgba(0,0,0,0.5)",
            tooltipFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
            tooltipFontSize: 14,
            tooltipFontStyle: "normal",
            tooltipFontColor: "#fff",
            tooltipTitleFontFamily:
              "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
            tooltipTitleFontSize: 14,
            tooltipTitleFontStyle: "bold",
            tooltipTitleFontColor: "#fff",
            tooltipYPadding: 6,
            tooltipXPadding: 6,
            tooltipCaretSize: 8,
            tooltipCornerRadius: 6,
            tooltipXOffset: 10,
          },
        },
        scales: {
          'RSSI': {
            position: 'left',
            type: 'linear',
            ticks: {
              includeBounds: true,
              color: "#9f9f9f",
            },
            grid: {
              zeroLineColor: "transparent",
              display: true,
              drawBorder: false,
              color: "#9f9f9f",
            },
          },
          'Rate' : {
            position: 'right',
            type: 'linear',
            ticks: {
              includeBounds: true,
              color: "#9f9f9f",
            },
            grid: {
              zeroLineColor: "transparent",
              display: true,
              drawBorder: false,
              color: "#9f9f9f",
            },
          },
        },
      },
    };


    render() {

      let handleScaleMenu = (e) => {
        let choice = e.target.parentNode.getAttribute("value")
        let scale = e.target.value

        this.processTrafficHistory(choice, scale).then( (result) => {
          let o = {}
          o[choice + "_scale"] = scale
          o[choice] = result
          this.setState(o)
        })
      }

      return (
        <div className="content">
          <Row>
            <Col md="10">
            </Col>
            <Col md="2">
              <UncontrolledDropdown group>
                  <DropdownToggle caret color="default">
                      {this.state.signal_scale}
                  </DropdownToggle>
                  <DropdownMenu value="signals">
                      <DropdownItem value="All Time" onClick={handleScaleMenu}>All time</DropdownItem>
                  </DropdownMenu>
              </UncontrolledDropdown>
            </Col>
          </Row>
          <Row>
            <Col md="12">
              <Card>
                <CardHeader>
                  <CardTitle tag="h4">Device Signal Strength (RSSI)
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Bar
                    data={this.state.signals}
                    options={this.templateData.options}
                  />
                </CardBody>
              </Card>
            </Col>
          </Row>
        </div>
      );

    }
}
