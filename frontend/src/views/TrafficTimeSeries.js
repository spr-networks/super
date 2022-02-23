import React, { useContext, Component } from 'react'
// react plugin used to create charts
import { Line } from "react-chartjs-2";
import { getTraffic, getTrafficHistory, getArp, getDevices } from "components/Helpers/Api.js";
import {APIErrorContext} from 'layouts/Admin.js';
import { UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from 'reactstrap';
//for 'timeseries'
import 'chartjs-adapter-moment';
import chroma from "chroma-js";

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

export default class TrafficTimeSeries extends Component {

    state = {
            WanIn_scale: "All Time",
            LanIn_scale: "All Time",
            WanOut_scale: "All Time",
            LanOut_scale: "All Time",
            WanIn : {},
            WanOut : {},
            LanIn : {},
            LanOut : {},
            ignores : {}
          };

    static contextType = APIErrorContext;

    cached_traffic_data = null

    async buildTimeSeries(number_target_events=125) {
      let traffic_data;
      if (this.cached_traffic_data !== null) {
        traffic_data = this.cached_traffic_data
      } else {
        traffic_data = this.cached_traffic_data = await getTrafficHistory().catch(error => {
          this.context.reportError("API Failure get traffic history: " + error.message)
        })
      }

      function drop_quarter_samples(traffic_series, number_target_events) {
        //if we have a lot of points, drop intermediate ones.
        while (traffic_series.length > number_target_events) {
          //drop every fourth
          let new_series = []
          for (let i = 0; i < traffic_series.length; ) {
            new_series.push(traffic_series[i++]);
            if (!traffic_series[i]) break
            new_series.push(traffic_series[i++]);
            if (!traffic_series[i]) break
            new_series.push(traffic_series[i++]);
            if (!traffic_series[i]) break
            i++;
          }
          traffic_series = new_series
        }
        return traffic_series
      }

      let targets = ["WanOut", "WanIn", "LanOut", "LanIn"]
      let series = {}
      for (let target of targets) {
        let scale = this.state[target + "_scale"]

        let offset = 0
        if (scale == "1 Hour") {
          offset = 60-1
        } else if (scale == "1 Day") {
          offset = 60*24-1
        } else if (scale == "15 Minutes") {
          offset = 15-1
        }
        let traffic_series = traffic_data

        if (offset != 0) {
          traffic_series = traffic_data.slice(0, offset)
        }

        let ips = []
        let ipStats = {}
        for (let entry of traffic_series) {
          for (let ip in entry) {
            if (ips.indexOf(ip) == -1) {
              ips.push(ip)
            }
            if (!ipStats[ip]) {
              ipStats[ip] = {}
              ipStats[ip][target] = []
            }
          }
        }


        //calculate total changed per step in first pass
        let deltaSlices = []
        for (let idx = 0; idx < traffic_series.length; idx++) {
          let delta = 0
          for (let ip of ips) {

            if (this.state.ignores[target] && this.state.ignores[target][ip]) {
              //skip ignored IPs in calculating the sum
              continue
            }

            if (!traffic_series[idx][ip] || !(traffic_series[idx+1]) || !(traffic_series[idx+1][ip])) {

            } else {
              delta += traffic_series[idx][ip][target] - traffic_series[idx+1][ip][target]
            }
          }
          deltaSlices.push(delta)
        }

        let ref = new Date()
        for (let idx = 0; idx < traffic_series.length; idx++) {
          ref.setMinutes(ref.getMinutes() -1)
          //let timePoint = idx + " minutes ago"; //new Date(ref).toISOString()
          let timePoint = new Date(ref);

          for (let ip of ips) {
            if (!traffic_series[idx][ip] || !(traffic_series[idx+1]) || !(traffic_series[idx+1][ip])) {
              ipStats[ip][target].push({x: timePoint, y: 0, z: 0})
            } else {
              //calculate the delta change between the most recent (idx) and the measurement before (idx+1)
              //convert to % of total change
              let v = traffic_series[idx][ip][target] - traffic_series[idx+1][ip][target]
              ipStats[ip][target].push({x: timePoint, y: v/deltaSlices[idx], z: v})
            }
          }

        }

        let ret = []
        let colors = chroma.scale(["0000ff", "00ff00", "ffff00", "ff7f00", "ff0000"]).mode('lch').colors(ips.length);
        let colorIdx = 0
        for (let ip of ips) {
          //const c = colors[colorIdx++]
          const c = colors[colorIdx++]
          let d =  drop_quarter_samples(ipStats[ip][target], number_target_events)
          let hiddenState = false
          if (this.state.ignores[target] && this.state.ignores[target][ip]) {
            hiddenState = true
          }
          ret.push({label: ip, data_target: target, hidden: hiddenState,
                    stepped: true,
                    borderColor: c, borderWidth: 1,
                    backgroundColor: c, fill: true,
                    data: d})
        }
        series[target] = {datasets: ret}
      }
      return series
    }

    legendClickHandler(e, legendItem, legend) {
        const index = legendItem.datasetIndex;
        const type = legend.chart.config.type;
        let ci = legend.chart;
        let hiddenState
        ci.data.datasets[index].hidden = hiddenState = !ci.data.datasets[index].hidden;
        let data_target = ci.data.datasets[index].data_target
        let target_ip = ci.data.datasets[index].label

        //update ignores state to match the hidden status.
        //this allows recalculation to ignore the specified IP
        //format: {WanOut: {ip: true/false}}
        let ignores = this.state.ignores
        if (!ignores[data_target]) {
          ignores[data_target] = {}
        }
        ignores[data_target][target_ip] = hiddenState
        //recalculate
        this.setState({ignores: ignores})
        this.buildTimeSeries().then( (result) => {
          this.setState(result)
          ci.update();
        })
    };

    async componentDidMount() {
      let states = await this.buildTimeSeries()
      this.setState(states)

      //bind this.state to the chart callback
      this.templateTimeData.options.plugins.legend.onClick = this.legendClickHandler.bind(this)
    }

    externalTooltipHandler(context) {

      const getOrCreateTooltip = (chart) => {
        let tooltipEl = chart.canvas.parentNode.querySelector('div');

        if (!tooltipEl) {
          tooltipEl = document.createElement('div');
          tooltipEl.style.background = 'rgba(0, 0, 0, 0.7)';
          tooltipEl.style.borderRadius = '3px';
          tooltipEl.style.color = 'white';
          tooltipEl.style.opacity = 1;
          tooltipEl.style.pointerEvents = 'none';
          tooltipEl.style.position = 'absolute';
          tooltipEl.style.transform = 'translate(-50%, 0)';
          tooltipEl.style.transition = 'all .1s ease';

          const table = document.createElement('table');
          table.style.margin = '0px';

          tooltipEl.appendChild(table);
          chart.canvas.parentNode.appendChild(tooltipEl);
        }

        return tooltipEl;
      };


      const {chart, tooltip} = context;
      const tooltipEl = getOrCreateTooltip(chart);

      // Hide if no tooltip
      if (tooltip.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
      }

      // Set Text
      if (tooltip.body) {
        const titleLines = tooltip.title || [];
        const bodyLines = tooltip.body.map(b => b.lines);

        const tableHead = document.createElement('thead');

        titleLines.forEach(title => {
          const tr = document.createElement('tr');
          tr.style.borderWidth = 0;

          const th = document.createElement('th');
          th.style.borderWidth = 0;
          const text = document.createTextNode(title);

          th.appendChild(text);
          tr.appendChild(th);
          tableHead.appendChild(tr);
        });

        const tableBody = document.createElement('tbody');
        console.log(tooltip.body)
        bodyLines.forEach((body, i) => {
          if (i != 0) {
          }
          const colors = tooltip.labelColors[i];

          const span = document.createElement('span');
          span.style.background = colors.backgroundColor;
          span.style.borderColor = colors.borderColor;
          span.style.borderWidth = '2px';
          span.style.marginRight = '10px';
          span.style.height = '10px';
          span.style.width = '10px';
          span.style.display = 'inline-block';

          const tr = document.createElement('tr');
          tr.style.backgroundColor = 'inherit';
          tr.style.borderWidth = 0;

          const td = document.createElement('td');
          td.style.borderWidth = 0;

          let body_string = body[0].split(':')
          const text = document.createTextNode(body);

          td.appendChild(span);
          td.appendChild(text);
          tr.appendChild(td);
          tableBody.appendChild(tr);
        });

        const tableRoot = tooltipEl.querySelector('table');

        // Remove old children
        while (tableRoot.firstChild) {
          tableRoot.firstChild.remove();
        }

        // Add new children
        tableRoot.appendChild(tableHead);
        tableRoot.appendChild(tableBody);
      }

      const {offsetLeft: positionX, offsetTop: positionY} = chart.canvas;

      // Display, position, and set styles for font
      tooltipEl.style.opacity = 1;
      tooltipEl.style.left = positionX + tooltip.caretX + 'px';
      tooltipEl.style.top = positionY + tooltip.caretY + 'px';
      tooltipEl.style.font = tooltip.options.bodyFont.string;
      tooltipEl.style.padding = tooltip.options.padding + 'px ' + tooltip.options.padding + 'px';

    }

    templateTimeData = {
      options : {
        interaction: {
            mode: 'index',
            intersect: false,
        },
        elements: {
            point:{
                radius: 0,
                hitRadius: 0,
                hoverRadius: 0
            },
        },
        scales : {
          y: {
              stacked: true,
              min: 0,
              max: 1,
              ticks: {
                callback: function (value) {
                  return (value * 100).toFixed(0) + '%'; // convert it to percentage
                },
              }

          },
          x : {
            grid: {
              display: false,
              drawBorder: false,
            },
            type: 'timeseries',
            ticks : {
              callback: (value, index, labels) => {
                if(index%5 === 0) {
                  return value ;
                }
                return ''
              },
            },
          }
        },
        plugins: {
            legend: {
            },
            tooltip: {
              //enabled: false,
              //external: this.externalTooltipHandler.bind(this)
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || ''
                  if (label) {
                      label += ': ' + context.raw.z.toLocaleString() + " bytes"
                  }
                  return label
                }
            }
          }
        },
      },
    };


    render() {

      let handleScaleMenu = (e) => {
        let choice = e.target.parentNode.getAttribute("value")
        let scale = e.target.value

        this.state[choice+"_scale"] = scale
        this.buildTimeSeries().then( (result) => {
            this.setState(result)
        })
      }

      return (
        <div className="content">

          { ["WanOut", "WanIn", "LanOut", "LanIn"].map( (x) => {

            const generatedID = Math.random().toString(36).substr(2, 9);

            return <div key={generatedID}>
            <Row key={generatedID+"choice"}>
              <Col md="10"></Col>
              <Col md="2">
                <UncontrolledDropdown group>
                    <DropdownToggle caret color="default">
                        {this.state[x+"_scale"]}
                    </DropdownToggle>
                    <DropdownMenu value={x}>
                        <DropdownItem value="All Time" onClick={handleScaleMenu}>All time</DropdownItem>
                        <DropdownItem value="1 Day"   onClick={handleScaleMenu}>Last Day</DropdownItem>
                        <DropdownItem value="1 Hour" onClick={handleScaleMenu}>Last Hour</DropdownItem>
                        <DropdownItem value="15 Minutes" onClick={handleScaleMenu}>Last 15 Minutes</DropdownItem>
                    </DropdownMenu>
                </UncontrolledDropdown>
              </Col>
            </Row>
            <Row key={generatedID+"graph"}>
              <Col md="12">
                <Card>
                  <CardHeader>
                    <CardTitle tag="h4">
                      {x} ⸺ {this.state[x+"_scale"]} ⸺
                    </CardTitle>
                  </CardHeader>
                  <CardBody>
                    <Line
                      data={this.state[x]}
                      options={this.templateTimeData.options}
                    />
                  </CardBody>
                </Card>
              </Col>
            </Row>
            </div>
          })}
        </div>
      );

    }
}
