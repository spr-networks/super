import React, { useContext, useEffect, useRef, useState } from 'react'
import { Link, useHistory } from 'react-router-dom'
import Select from 'react-select'

import { pluginAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'
import ModalForm from 'components/ModalForm'
import Toggle from 'components/Toggle'
import AddPlugin from 'components/Plugins/AddPlugin'

import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  Table,
  Row,
  Col
} from 'reactstrap'

const PluginList = (props) => {
  const [list, setList] = useState([])
  const contextType = useContext(APIErrorContext)

  const refreshList = (next) => {
    pluginAPI
      .list()
      .then((plugins) => {
        setList(plugins)
      })
      .catch((err) => {
        contextType.reportError('failed to fetch plugins')
      })
  }

  useEffect(() => {
    refreshList()
  }, [])

  const handleChange = (plugin, value) => {
    plugin.Enabled = value
    pluginAPI.update(plugin).then(setList)
  }

  const deleteListItem = (row) => {
    pluginAPI
      .remove(row)
      .then((res) => {
        refreshList()
      })
      .catch((err) => {})
  }

  const refModal = useRef(null)

  const notifyChange = (type) => {
    refModal.current()
    refreshList()
  }

  return (
    <Card>
      <CardHeader>
        <ModalForm
          title="Add a new Plugin"
          triggerText="add"
          triggerClass="pull-right"
          triggerIcon="fa fa-plus"
          modalRef={refModal}
        >
          <AddPlugin notifyChange={notifyChange} />
        </ModalForm>
        <CardTitle tag="h4">Plugins</CardTitle>
      </CardHeader>
      <CardBody>
        {list.length ? (
          <Table responsive>
            <thead className="text-primary">
              <tr>
                <th>Name</th>
                <th>URI</th>
                <th>UnixPath</th>
                <th>Active</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row, i) => (
                <tr key={i}>
                  <td>{row.Name}</td>
                  <td>{row.URI}</td>
                  <td>{row.UnixPath}</td>
                  <td>
                    <Toggle
                      isChecked={row.Enabled}
                      onChange={(e, value) => handleChange(row, value)}
                    />
                  </td>
                  <td>
                    <Button
                      className="btn-icon"
                      color="danger"
                      size="sm"
                      type="button"
                      onClick={(e) => deleteListItem(row)}
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
  )
}

export default PluginList
