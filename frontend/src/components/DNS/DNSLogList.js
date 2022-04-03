import React, { useContext, useRef } from 'react'
import PropTypes from 'prop-types'
import DNSAddLog from 'components/DNS/DNSAddLog'
import ModalForm from 'components/ModalForm'
import { APIErrorContext } from 'layouts/Admin'
import ReactBSAlert from 'react-bootstrap-sweetalert'
import { logAPI } from 'api/DNS'

import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table
} from 'reactstrap'

export default class DNSLogList extends React.Component {
  static contextType = APIErrorContext
  state = { type: '', list: [], showAlert: false }

  constructor(props) {
    super(props)

    this.deleteListItem = this.deleteListItem.bind(this)
    this.addListItem = this.addListItem.bind(this)
    this.triggerAlert = this.triggerAlert.bind(this)

    this.state.list = []
    this.state.type = props.type

    this.refModal = React.createRef()
  }

  async componentDidMount() {
    this.refreshBlocklists()
  }

  async refreshBlocklists() {
    console.log('fetchin dns log list', this.state.type)
    try {
      let list = []
      if (this.state.type == 'Domain') {
        list = await logAPI.domainIgnores()
      } else {
        list = await logAPI.hostPrivacyList()
      }

      this.setState({ list })
    } catch (error) {
      this.context.reportError('API Failure: ' + error.message)
    }
  }

  triggerAlert(show) {
    if (show === false) {
      return this.setState({ showAlert: false })
    }

    this.setState({ showAlert: true })
  }

  addListItem(item) {
    let list = this.state.list
    list.push(item)
    this.setState({ list })
    if (this.state.type == 'Domain') {
      logAPI.addDomainIgnores(item)
    } else {
      logAPI.putHostPrivacyList(list)
    }
  }

  deleteListItem(item) {
    if (this.state.type == 'Domain') {
      return alert(`TODO: delete ${item}`)
    }

    let list = this.state.list.filter((_item) => _item != item)
    logAPI
      .putHostPrivacyList(list)
      .then((res) => {
        this.setState({ list })
      })
      .catch((error) => {
        this.context.reportError('API Failure: ' + error.message)
      })
  }

  render() {
    let type = this.state.type
    let list = this.state.list

    const hideAlert = () => this.triggerAlert(false)
    const inputConfirmAlert = (value) => {
      this.addListItem(value)
      hideAlert()
    }

    return (
      <>
        <Card>
          <CardHeader>
            <Button
              className="btn-round pull-right"
              color="primary"
              outline
              onClick={this.triggerAlert}
            >
              <i className="fa fa-plus" /> add
            </Button>

            <ReactBSAlert
              show={this.state.showAlert}
              input
              showCancel
              title={`Add ${type}`}
              onConfirm={(e) => inputConfirmAlert(e)}
              onCancel={() => hideAlert()}
              confirmBtnBsStyle="info"
              cancelBtnBsStyle="danger"
              openAnim={false}
              btnSize=""
            />

            <CardTitle tag="h4">{this.props.title}</CardTitle>
            <p className="text-muted">{this.props.description}</p>
          </CardHeader>
          <CardBody>
            <Table responsive className={!list.length ? 'd-none' : null}>
              <thead className="text-primary">
                <tr>
                  <th style={{ width: '100%' }}>{type}</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr key={item}>
                    <td>{item}</td>
                    <td className="text-center">
                      <Button
                        className="btn-icon"
                        color="danger"
                        size="sm"
                        type="button"
                        onClick={(e) => this.deleteListItem(item)}
                      >
                        <i className="fa fa-times" />
                      </Button>
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

DNSLogList.propTypes = {
  type: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string
}
