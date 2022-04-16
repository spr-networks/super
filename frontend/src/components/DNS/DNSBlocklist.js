import React from 'react'

import { blockAPI } from 'api/DNS'
import DNSAddBlocklist from 'components/DNS/DNSAddBlocklist'
import ModalForm from 'components/ModalForm'
import Toggle from 'components/Toggle'
import { APIErrorContext } from 'layouts/Admin'
import Spinner from 'components/Spinner'

import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table
} from 'reactstrap'

export default class DNSBlocklist extends React.Component {
  static contextType = APIErrorContext
  state = { list: [], pending: false }

  constructor(props) {
    super(props)

    this.state.list = []

    this.handleItemSwitch = this.handleItemSwitch.bind(this)
    this.deleteListItem = this.deleteListItem.bind(this)
    this.notifyChange = this.notifyChange.bind(this)

    this.refAddBlocklistModal = React.createRef()
  }

  async componentDidMount() {
    this.refreshBlocklists()
  }

  async refreshBlocklists() {
    let list = []
    // pending requests
    setTimeout(() => {
      if (!list.length) {
        this.setState({ list })
        this.setState({ pending: true })
      }
    }, 1500)

    blockAPI
      .blocklists()
      .then((blocklist) => {
        list = blocklist
        this.setState({ list })
        this.setState({ pending: false })
      })
      .catch((error) => {
        this.context.reportError('API Failure: ' + error.message)
      })
  }

  async notifyChange(type) {
    this.setState({ pending: false })
    await this.refreshBlocklists()
  }

  handleItemSwitch(item, value) {
    item.Enabled = value
    const list = this.state.list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    // only update the ui
    this.setState({ list })
    this.setState({ pending: true })

    blockAPI
      .putBlocklist(item)
      .then((res) => {
        this.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.reportError('API Failure: ' + error.message)
      })
  }

  deleteListItem(item) {
    if (this.state.pending) {
      return this.context.reportError('Wait for pending updates to finish')
    }

    this.setState({ pending: true })

    blockAPI
      .deleteBlocklist(item)
      .then((res) => {
        this.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.reportError('API Failure: ' + error.message)
      })
  }

  render() {
    const notifyChangeBlocklist = async () => {
      await this.notifyChange()
      // close modal when added
      this.refAddBlocklistModal.current()
    }

    return (
      <>
        <Card>
          <CardHeader>
            {!this.state.pending ? (
              <ModalForm
                title="Add DNS Blocklist"
                triggerText="add"
                triggerClass="pull-right"
                triggerIcon="fa fa-plus"
                modalRef={this.refAddBlocklistModal}
              >
                <DNSAddBlocklist notifyChange={notifyChangeBlocklist} />
              </ModalForm>
            ) : null}

            <CardTitle tag="h4" className="float-left">
              DNS Blocklists
            </CardTitle>

            <Spinner text="Update running..." isVisible={this.state.pending} />
          </CardHeader>
          <CardBody>
            {this.state.list.length ? (
              <Table responsive>
                <thead className="text-primary">
                  <tr>
                    <th>URI</th>
                    <th className="text-center">Enabled</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {this.state.list.map((item) => (
                    <tr key={item.URI}>
                      <td>{item.URI}</td>
                      <td className="text-center">
                        <Toggle
                          onChange={(el, value) =>
                            this.handleItemSwitch(item, value)
                          }
                          isDisabled={this.state.pending}
                          isChecked={item.Enabled}
                          onColor="info"
                          offColor="info"
                        />
                      </td>
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
            ) : null}
          </CardBody>
        </Card>
      </>
    )
  }
}
