import React from 'react'
import { blockAPI } from 'api/DNS'
import DNSAddBlocklist from 'components/DNS/DNSAddBlocklist'
import ModalForm from 'components/ModalForm'
import Switch from 'components/Switch'
import { APIErrorContext } from 'layouts/Admin'

import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
} from 'reactstrap'

export default class DNSBlocklist extends React.Component {
  static contextType = APIErrorContext
  state = { list: [] }

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
    try {
      const list = await blockAPI.blocklists()
      this.setState({list})
    } catch(error) {
      this.context.reportError("API Failure: " + error.message)
    }
  }

  async notifyChange(type) {
    await this.refreshBlocklists()
  }

  handleItemSwitch(item, value) {
    item.Enabled = value
    const list = this.state.list.map(_item => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    this.setState({list})

    blockAPI.putBlocklist(item)
      .then(res => {
        this.notifyChange('blocklists')
      })
      .catch(error => {
        this.context.reportError("API Failure: " + error.message)
      })
  }

  deleteListItem(item) {
    blockAPI.deleteBlocklist(item)
      .then(res => {
        this.notifyChange('blocklists')
      })
      .catch(error => {
        this.context.reportError("API Failure: " + error.message)
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
            <ModalForm
              title="Add DNS Blocklist"
              triggerText="add"
              triggerClass="pull-right"
              triggerIcon="fa fa-plus"
              modalRef={this.refAddBlocklistModal}
            >
              <DNSAddBlocklist notifyChange={notifyChangeBlocklist} />
            </ModalForm>

            <CardTitle tag="h4">DNS Blocklists</CardTitle>
          </CardHeader>
          <CardBody>
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th>URI</th>
                  <th className="text-center">Enabled</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {
                  this.state.list.map(item => (
                    <tr key={item.URI}>
                      <td>{item.URI}</td>
                      <td className="text-center">
                        <Switch
                          onChange={(el, value) => this.handleItemSwitch(item, value)}
                          value={item.Enabled}
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
                          onClick={(e) => this.deleteListItem(item)}>
                          <i className="fa fa-times" />
                        </Button>
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
