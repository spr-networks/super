import React, { useContext, Component } from 'react'
// react plugin used to create charts
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { getTraffic } from "components/Helpers/Api.js";
import {APIErrorContext} from 'layouts/Admin.js';


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

export default class Traffic extends Component {

    state = {lan: {}, wan : {}};

    static contextType = APIErrorContext;

    async componentDidMount() {

      const setState = (v) => {
        this.setState(v)
      }

      async function refreshTraffic() {


        const traffic_in_lan = await getTraffic("incoming_traffic_lan").catch(error => {
          this.context.reportError("API Failure get traffic: " + error.message)
        })
        const traffic_in_wan = await getTraffic("incoming_traffic_wan").catch(error => {
          this.context.reportError("API Failure get traffic: " + error.message)
        })
        const traffic_out_lan = await getTraffic("outgoing_traffic_lan").catch(error => {
          this.context.reportError("API Failure get traffic: " + error.message)
        })
        const traffic_out_wan = await getTraffic("outgoing_traffic_wan").catch(error => {
          this.context.reportError("API Failure get traffic: " + error.message)
        })

        if (!traffic_in_lan) {
          return
        }

        let normalize = (f) => {
          return (f*1.0) / 1024.0 /1024.0
        }

        let processData = (data_in, data_out)  => {

          let data = {
            labels: [
            ],
            datasets: [
              {
                label: "Down",
                borderColor: "#fcc468",
                fill: true,
                backgroundColor: "#fcc468",
                hoverBorderColor: "#fcc468",
                borderWidth: 1,
                barPercentage: 0.9,
                data: [
                ],
              },
              {
                label: "Up",
                borderColor: "#4cbdd7",
                fill: true,
                backgroundColor: "#4cbdd7",
                hoverBorderColor: "#4cbdd7",
                borderWidth: 1,
                barPercentage: 0.9,
                data: [
                ],
              },
            ]
          }


          let totalOut = 0
          let totalIn = 0

          let traffic = {"Incoming" : data_in, "Outgoing": data_out}

          let d = {}
          for (const entry of traffic["Outgoing"]) {
            if (!d[entry["IP"]]) {
              d[entry["IP"]] = {}
            }
            totalOut += entry["Bytes"]
            d[entry["IP"]]["Out"] = normalize(entry["Bytes"])
          }

          for (const entry of traffic["Incoming"]) {
            if (!d[entry["IP"]]) {
              d[entry["IP"]] = {}
            }
            totalIn += entry["Bytes"]
            d[entry["IP"]]["In"] = normalize(entry["Bytes"])
          }

          let d_labels = []
          let d_in = []
          let d_out = []

          for (const e of Object.keys(d)) {
            d_labels.push(e)
            //download
            d_in.push(d[e]["In"])
            //upload
            d_out.push(d[e]["Out"])
          }

          data.labels = d_labels
          data.datasets[0].data = d_in
          data.datasets[1].data = d_out
          data.totalIn = totalIn
          data.totalOut = totalOut
          return data
        }

        let lan_data = processData(traffic_in_lan, traffic_out_lan)
        let wan_data = processData(traffic_in_wan, traffic_out_wan)

        setState({lan: lan_data, wan: wan_data})
      }

      refreshTraffic = refreshTraffic.bind(this)
      refreshTraffic()

    }


  templateData = {
  options: {
    indexAxis: 'x',
    plugins: {
      legend: {
        display: false,
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
      y: {
        ticks: {
          color: "#9f9f9f",
          beginAtZero: true,
          maxTicksLimit: 5,
          padding: 20,
        },
        grid: {
          zeroLineColor: "transparent",
          display: true,
          drawBorder: false,
          color: "#9f9f9f",
        },
      },
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          padding: 20,
          color: "#9f9f9f",
        },
      },
    },
  },
};


    render() {

      return (
        <div className="content">
          <Row>
            <Col md="12">
              <Card>
                <CardHeader>
                  <CardTitle tag="h4">Device WAN Traffic --
                    IN: {parseFloat(this.state.wan.totalIn/1024/1024/1024).toFixed(2) } GB --
                    OUT: {parseFloat(this.state.wan.totalOut/1024/1024/1024).toFixed(2) } GB
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Bar
                    data={this.state.wan}
                    options={this.templateData.options}
                  />
                </CardBody>
              </Card>
            </Col>
          </Row>

          <Row>
            <Col md="12">
              <Card>
                <CardHeader>
                  <CardTitle tag="h4">Device LAN Traffic --
                    IN: {parseFloat(this.state.lan.totalIn/1024/1024/1024).toFixed(2) } GB --
                    OUT: {parseFloat(this.state.lan.totalOut/1024/1024/1024).toFixed(2) } GB
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Bar
                    data={this.state.lan}
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
