import React, { useContext, useRef } from "react"
import { withRouter } from "react-router"
import { useHistory } from "react-router-dom"
import DNSAddLog from "components/DNS/DNSAddLog"
import ModalForm from "components/ModalForm"
import { APIErrorContext } from 'layouts/Admin'
import ReactBSAlert from "react-bootstrap-sweetalert"
import { logAPI } from "api/DNS"
import { deviceAPI } from "api/Device"

import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Label,
  Table,
  Form,
  FormGroup,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  Row, Col
} from "reactstrap"

export class DNSLogHistoryList extends React.Component {
  static contextType = APIErrorContext;
  state = { ip: '', list: [], listAll: [], clients: [], filterText: '',
    showAlert: false, alertText: '' }

  constructor(props) {
    super(props)

    //this.state.list = []
    this.state.ip = props.ip || ""
    this.state.alertText = ""
    //this.state.clients = []

    this.handleIPChange = this.handleIPChange.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.triggerAlert = this.triggerAlert.bind(this)
    this.closeAlert = this.closeAlert.bind(this)
  }

  async componentDidMount() {
    this.getClients()
    this.refreshList()
  }

  async getClients() {
    try {
      let devices = await deviceAPI.list()
      let clients = Object.values(devices)
        //.map(d => {d.Name, d.RecentIP})
        .filter(d => d.RecentIP.length)
      
      // todo show client name
      this.setState({clients})
    } catch(error) {
      this.context.reportError(error.message)
    }
  }
 
  async refreshList(ip) {
    ip = ip || this.state.ip
    if (!ip.length) {
      return
    }

    console.log('fetchin dns log list', ip)

    let list = []
    try {
      list = await logAPI.history(ip)
      list.reverse()
    } catch (error) {
      let msg = "API Failure: " + error.message
      if (error.message == '404') {
        msg = `No DNS query history for ${ip}`
      }
      this.context.reportError(msg)
    }

    this.setState({list})
    this.setState({listAll: list})
  }

  filterList(filterText) {
    let list = this.state.listAll
    
    if (filterText.length) {
      list = list.filter(item => {
        let match = false
        
        match = match || item.FirstName.includes(filterText)
        match = match || item.FirstAnswer.includes(filterText)
        match = match || item.Q.filter(r => r.Name.includes(filterText)).length

        return match
      })
    }

    this.setState({list})
  }

  handleIPChange(event) {
    let ip = event.target.value
    if (!ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
      return
    }

    // update url to include ip
    this.props.history.push(ip)

    this.setState({ip})
    this.refreshList(ip)
  }

  handleChange(event) {
    let filterText = event.target.value

    this.setState({filterText})

    this.filterList(filterText)
  }

  triggerAlert(index) {
    this.setState({alertText: JSON.stringify(this.state.list[index], null, "  ")})
    this.setState({showAlert: true})
  }

  closeAlert() {
    this.setState({showAlert: false})
  }

  render() {
    
    const prettyType = (type) => {
      let keys = {
        'NOERROR': 'text-success',
        'NODATA': 'text-warning',
        'OTHERERROR': 'text-danger',
        'NXDOMAIN': 'text-danger'
      }

      let className = keys[type] || 'text-danger'
      return (<span className={className}>{type}</span>)
    }

    return (
      <>
          <ReactBSAlert
            type="custom"
            show={this.state.showAlert}
            onConfirm={this.closeAlert}
            onCancel={this.closeAlert}
            title="DNS query"
            confirmBtnBsStyle="info"
            cancelBtnBsStyle="danger"
            openAnim={false}
            closeOnClickOutside={true}
            btnSize=""
          >
            <pre style={{"text-align":"left", "font-size": "0.65em"}}>{this.state.alertText}</pre>
            </ReactBSAlert>

        <Card>
          <CardHeader>

            <CardTitle tag="h4">{this.state.ip} DNS logs</CardTitle>

            <Row>

            <Col md="3">

              <FormGroup>
                <Label>Client</Label>
                <Input type="select" onChange={this.handleIPChange} value={this.state.ip}>
                  <option>Select Client</option>
                  {
                    this.state.clients.map(client => {
                      let ip = client.RecentIP
                      let selected = ip == this.state.ip
                      return (<option key={ip} value={ip}>{client.Name} / {ip}</option>)
                    })
                  }

                </Input>
              </FormGroup>

            </Col>
            <Col md="9">
              <FormGroup>
                  <Label>Search</Label>
                  <InputGroup>
                  <Input type="text" name="filterText" placeholder="Filter domain..." value={this.state.filterText} onChange={this.handleChange} />
                  <InputGroupAddon addonType="append">
                    <InputGroupText>
                      <i className="nc-icon nc-zoom-split" />
                    </InputGroupText>
                  </InputGroupAddon>
                  </InputGroup>
                 
            
              </FormGroup>
              </Col>
            </Row>


          </CardHeader>
          <CardBody>
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th width="15%">Timestamp</th>
                  <th width="15%">Type</th>
                  <th>Domain</th>
                  <th>Answer</th>
                </tr>
              </thead>
              <tbody>
                {
                  this.state.list.map((item, index) => (
                    <tr key={item.Timestamp}>
                      <td style={{"whiteSpace": "nowrap"}}>{new Date(item.Timestamp).toISOString().replace(/T|(\..*)/g, ' ').trim()}</td>
                      <td>{prettyType(item.Type)}</td>
                      <td>{item.FirstName}</td>
                      <td>
                        <a target="#" onClick={e => this.triggerAlert(index)}>{item.FirstAnswer}</a>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </>
    )
  }
}

const DNSLogHistoryListWithRouter = withRouter(DNSLogHistoryList)
export default DNSLogHistoryListWithRouter