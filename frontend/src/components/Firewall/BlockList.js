import { useRef } from 'react'
import PropTypes from 'prop-types'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddBlock from './AddBlock'

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

const BlockList = (props) => {
  let list = props.list || []
  let title = props.title || `BlockList:`

  let refModal = useRef(null)

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('block')
    }

    firewallAPI.deleteBlock(item).then(done)
  }

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('block')
  }

  return (
    <>
      <Card>
        <CardHeader>
          <ModalForm
            title={`Add IP Block`}
            triggerText="add"
            triggerClass="pull-right"
            triggerIcon="fa fa-plus"
            modalRef={refModal}
          >
            <AddBlock notifyChange={notifyChange} />
          </ModalForm>

          <CardTitle tag="h4">{title}</CardTitle>
        </CardHeader>
        <CardBody>
          {list.length ? (
            <Table>
              <thead className="text-primary">
                <tr>
                  <th>Protocol</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th width="5%" className="text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr>
                    <td>{row.Protocol}</td>
                    <td>{row.SrcIP}</td>
                    <td>{row.DstIP}</td>
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
          ) : (
            <p>There are no block rules configured yet</p>
          )}
        </CardBody>
      </Card>
    </>
  )
}

BlockList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}

export default BlockList
