import { useEffect, useRef, useState } from 'react'

import { firewallAPI, deviceAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddForward from './AddForward'

import {
  Button,
  Label,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Row,
  Col
} from 'reactstrap'

const ForwardList = (props) => {
  const [list, setList] = useState([])

  const refreshList = () => {
    firewallAPI.config().then((config) => {
      //setList(config.ForwardingRules)
      let flist = config.ForwardingRules
      deviceAPI
        .list()
        .then((devices) => {
          flist = flist.map((rule) => {
            let deviceDst = Object.values(devices)
              .filter((d) => d.RecentIP == rule.DstIP)
              .pop()

            if (deviceDst) {
              rule.deviceDst = deviceDst
            }

            return rule
          })

          setList(flist)
        })
        .catch((err) => {
          //context.reportError('deviceAPI.list Error: ' + err)
          setList(flist)
        })
    })
  }

  const deleteListItem = (item) => {
    firewallAPI.deleteForward(item).then((res) => {
      refreshList()
    })
  }

  useEffect(() => {
    refreshList()
  }, [])

  let refModal = useRef(null)

  const notifyChange = (type) => {
    refModal.current()
    refreshList()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <ModalForm
            title="Add Forward Rule"
            triggerText="add"
            triggerClass="pull-right"
            triggerIcon="fa fa-plus"
            modalRef={refModal}
          >
            <AddForward notifyChange={notifyChange} />
          </ModalForm>

          <CardTitle tag="h4">Forwarding</CardTitle>
        </CardHeader>
        <CardBody>
          <Table responsive>
            <thead className="text-primary">
              <tr>
                <th>Protocol</th>
                <th width="15%" className="text-right">
                  Source
                </th>
                <th width="5%"></th>
                <th width="35%">Destination</th>

                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr>
                  <td>{row.Protocol}</td>
                  <td className="text-right">
                    {row.SrcIP}:{row.SrcPort}
                  </td>
                  <td className="text-center">
                    <i className="fa fa-long-arrow-right" />
                  </td>
                  <td>
                    {row.deviceDst ? (
                      <>
                        {row.deviceDst.Name}:{row.DstPort}
                      </>
                    ) : (
                      <>
                        {row.DstIP}:{row.DstPort}
                      </>
                    )}
                  </td>
                  <td className="text-center">
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
        </CardBody>
      </Card>
    </>
  )
}

export default ForwardList
