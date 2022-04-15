import React from 'react'
import PropTypes from 'prop-types'
import { withRouter } from 'react-router'
import ReactBSAlert from 'react-bootstrap-sweetalert'

import { APIErrorContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import DNSAddOverride from './DNSAddOverride'
import ModalForm from 'components/ModalForm'
import { logAPI } from 'api/DNS'
import { prettyDate } from 'utils'

import {
  Button,
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
    filterDateStart: '',
    filterDateEnd: '',
    showAlert: false,
    alertText: '',
    selectedDomain: ''
  }

  constructor(props) {
    super(props)

    this.state.filterIPs = props.ips || []
    this.state.filterText = props.filterText || ''
    this.state.alertText = ''

    this.modalRef = React.createRef(null)

    this.handleChangeIP = this.handleChangeIP.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.triggerAlert = this.triggerAlert.bind(this)
    this.closeAlert = this.closeAlert.bind(this)
    this.deleteHistory = this.deleteHistory.bind(this)
  }

  async componentDidMount() {
    await this.refreshList(this.state.filterIPs, this.filterList)
  }

  // next function is to ensure the state.list is updated
  async refreshList(ips, next) {
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

      this.setState({ listAll: list })
      this.setState({ list }, next)
    })
  }

  filterList(filterText = null) {
    if (!filterText) {
      filterText = this.state.filterText
    }

    if (!filterText.length) {
      return
    }

    let list = this.state.listAll

    let doFilter = false
    doFilter = doFilter || filterText.length

    let datematch = filterText.match(
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/
    )

    let dateStart = null,
      dateEnd = null

    if (datematch) {
      try {
        let [filterDateStart, filterDateEnd] = datematch.slice(1, 3)
        dateStart = new Date(filterDateStart).getTime()
        dateEnd = new Date(filterDateEnd).getTime()
      } catch (error) {}
    }

    if (doFilter) {
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

        if (dateStart && dateEnd) {
          let d = new Date(item.Timestamp).getTime()
          if (dateStart < d && d < dateEnd) {
            match = true
          }
        }

        return match
      })
    }

    this.setState({ list })
  }

  handleChangeIP(selectedIPs) {
    this.setState({ selectedIPs })

    let ips = selectedIPs.map((item) => item.value)

    // update url to include ips & filterText
    if (ips.length) {
      this.props.history.push(
        `/admin/dnsLog/${ips.join(',')}/${this.state.filterText}`
      )
    }

    this.setState({ filterIPs: ips })

    this.refreshList(ips)
  }

  handleChange(event) {
    let name = event.target.name
    let value = event.target.value

    this.setState({ [name]: value })

    this.filterList(value)
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

  deleteHistory(e) {
    let msg = `Delete history for ${this.state.filterIPs.join(', ')}?`
    if (!confirm(msg) || !this.state.filterIPs.length) {
      return
    }

    this.state.filterIPs.map(logAPI.deleteHistory)

    this.refreshList(this.state.filterIPs, this.filterList)
  }

  render() {
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

    const dateSelection = {
      startDate: new Date(),
      endDate: new Date(),
      key: 'selection'
    }

    const handleClickDomain = (e) => {
      let selectedDomain = e.target.innerText
      this.setState({ selectedDomain })
      this.modalRef.current() // toggle modal
      e.preventDefault()
    }

    const notifyChange = async () => {
      this.modalRef.current()
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
          <pre style={{ 'text-align': 'left', 'font-size': '0.65em' }}>
            {this.state.alertText}
          </pre>
        </ReactBSAlert>

        <ModalForm
          key="mf"
          title="Block domain"
          modalRef={this.modalRef}
          hideButton={true}
        >
          <DNSAddOverride
            type="block"
            domain={this.state.selectedDomain}
            notifyChange={notifyChange}
          />
        </ModalForm>

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
                    isMulti
                    value={this.state.filterIPs}
                    onChange={this.handleChangeIP}
                  />
                </FormGroup>
              </Col>
              <Col md="6">
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

              <Col md="2">
                <FormGroup
                  className={
                    this.state.filterIPs.length && this.state.list.length
                      ? ''
                      : 'd-none'
                  }
                >
                  <Label>Delete history</Label>
                  <Button
                    className="mt-0"
                    color="danger"
                    type="button"
                    onClick={this.deleteHistory}
                  >
                    Delete <i className="fa fa-times"></i>
                  </Button>
                </FormGroup>
              </Col>
              {/*
              <Col md="4">
                <Row>
                  <Col md="6">
                    <FormGroup>
                      <Label>From</Label>
                      <Input
                        type="date"
                        name="filterDateStart"
                        value={this.state.filterDateStart}
                        onChange={this.handleChange}
                        placeholder="Start"
                      />
                    </FormGroup>
                  </Col>
                  <Col md="6">
                    <FormGroup>
                      <Label>To</Label>
                      <Input
                        type="date"
                        name="filterDateEnd"
                        value={this.state.filterDateEnd}
                        onChange={this.handleChange}
                        placeholder="End"
                      />
                    </FormGroup>
                  </Col>
                </Row>
              </Col>
              */}
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
                  <tr key={Math.random().toString(36).substr(2, 9)}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {prettyDate(item.Timestamp)}
                    </td>
                    <td>{prettyType(item.Type)}</td>
                    <td className={hideClient ? 'd-none' : null}>
                      {item.Remote.split(':')[0]}
                    </td>
                    <td>
                      <a target="/admin/dnsBlock" onClick={handleClickDomain}>
                        {item.FirstName}
                      </a>
                    </td>
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
  filterText: PropTypes.string,
  history: PropTypes.shape({
    push: PropTypes.func
  }) //.isRequired
}

export default DNSLogHistoryListWithRouter
