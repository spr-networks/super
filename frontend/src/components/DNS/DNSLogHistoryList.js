import React from 'react'
import PropTypes from 'prop-types'
import { withRouter } from 'react-router'
import ReactBSAlert from 'react-bootstrap-sweetalert'

import { APIErrorContext } from 'layouts/Admin'
import ClientSelect from 'components/Helpers/ClientSelect'
import { logAPI } from 'api/DNS'

import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Label,
  Table,
  FormGroup,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  Row,
  Col
} from 'reactstrap'

export class DNSLogHistoryList extends React.Component {
  static contextType = APIErrorContext
  state = {
    list: [],
    listAll: [],
    filterIPs: [],
    filterText: '',
    showAlert: false,
    alertText: ''
  }

  constructor(props) {
    super(props)

    this.state.filterIPs = props.ips || []
    this.state.alertText = ''

    this.handleIPChange = this.handleIPChange.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.triggerAlert = this.triggerAlert.bind(this)
    this.closeAlert = this.closeAlert.bind(this)
  }

  async componentDidMount() {
    this.refreshList(this.state.filterIPs)
  }

  async refreshList(ips) {
    if (!ips.length) {
      this.setState({ list: [], listAll: [] })
      return
    }

    Promise.allSettled(
      ips.map(async (ip) => {
        try {
          let list = await logAPI.history(ip)
          return list
        } catch (error) {
          throw `${ip}`
        }
      })
    ).then((results) => {
      let rejected = results
        .filter((r) => r.status == 'rejected')
        .map((r) => r.reason)
      if (rejected.length) {
        this.context.reportError(
          'No DNS query history for ' + rejected.join(',')
        )
      }

      let lists = results
        .filter((r) => r.value && r.value.length)
        .map((r) => r.value)

      // merge and sort lists desc
      let list = [].concat.apply([], lists)
      list.sort(
        (a, b) =>
          new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
      )

      this.setState({ list })
      this.setState({ listAll: list })
    })
  }

  filterList(filterText) {
    let list = this.state.listAll

    if (filterText.length) {
      list = list.filter((item) => {
        let match = false

        try {
          match = match || item.FirstName.includes(filterText)
          match = match || item.FirstAnswer.includes(filterText)
          match =
            match || item.Q.filter((r) => r.Name.includes(filterText)).length
          match = match || item.Type.match(filterText.toUpperCase())
        } catch (err) {
          match = false
        }

        return match
      })
    }

    this.setState({ list })
  }

  handleIPChange(selectedIPs) {
    this.setState({ selectedIPs })

    let ips = selectedIPs.map((item) => item.value)

    // update url to include ips
    if (ips.length) {
      this.props.history.push(ips.join(','))
    }

    this.setState({ filterIPs: ips })

    this.refreshList(ips)
  }

  handleChange(event) {
    let filterText = event.target.value

    this.setState({ filterText })

    this.filterList(filterText)
  }

  triggerAlert(index) {
    this.setState({
      alertText: JSON.stringify(this.state.list[index], null, '  ')
    })
    this.setState({ showAlert: true })
  }

  closeAlert() {
    this.setState({ showAlert: false })
  }

  render() {
    const prettyDate = (timestamp) => {
      return new Date(timestamp)
        .toISOString()
        .replace(/T|(\..*)/g, ' ')
        .trim()
    }

    const prettyType = (type) => {
      let keys = {
        NOERROR: 'text-success',
        NODATA: 'text-warning',
        OTHERERROR: 'text-danger',
        NXDOMAIN: 'text-danger'
      }

      let className = keys[type] || 'text-danger'
      return <span className={className}>{type}</span>
    }

    let hideClient = this.state.filterIPs.length <= 1

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
          <pre style={{ 'text-align': 'left', 'font-size': '0.65em' }}>
            {this.state.alertText}
          </pre>
        </ReactBSAlert>

        <Card>
          <CardHeader>
            <CardTitle tag="h4">
              {this.state.filterIPs.join(',')} DNS Log
            </CardTitle>

            <Row>
              <Col md="4">
                <FormGroup>
                  <Label>Client</Label>
                  <ClientSelect
                    isMulti={true}
                    value={this.state.filterIPs}
                    onChange={this.handleIPChange}
                  />
                </FormGroup>
              </Col>
              <Col md="8">
                <FormGroup>
                  <Label>Search</Label>
                  <InputGroup>
                    <Input
                      type="text"
                      name="filterText"
                      placeholder="Filter domain..."
                      value={this.state.filterText}
                      onChange={this.handleChange}
                    />
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
            <Table
              responsive
              className={!this.state.list.length ? 'd-none' : null}
            >
              <thead className="text-primary">
                <tr>
                  <th width="15%">Timestamp</th>
                  <th width="15%">Type</th>
                  <th className={hideClient ? 'd-none' : null}>Client</th>
                  <th>Domain</th>
                  <th>Answer</th>
                </tr>
              </thead>
              <tbody>
                {this.state.list.map((item, index) => (
                  <tr key={item.Timestamp}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {prettyDate(item.Timestamp)}
                    </td>
                    <td>{prettyType(item.Type)}</td>
                    <td className={hideClient ? 'd-none' : null}>
                      {item.Remote.split(':')[0]}
                    </td>
                    <td>{item.FirstName}</td>
                    <td>
                      <a target="#" onClick={(e) => this.triggerAlert(index)}>
                        {item.FirstAnswer}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </>
    )
  }
}

const DNSLogHistoryListWithRouter = withRouter(DNSLogHistoryList)

DNSLogHistoryListWithRouter.propTypes = {
  ips: PropTypes.array,
  history: PropTypes.shape({
    push: PropTypes.func.isRequired
  }).isRequired
}

export default DNSLogHistoryListWithRouter
