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
  let type = props.type || 'none'
  let title = props.title || `BlockList: ${type}`

  let refModal = useRef(null)

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('block')
    }

    if (type.toLowerCase() == 'src') {
      firewallAPI.deleteBlockSrc(item).then(done)
    } else {
      firewallAPI.deleteBlockDst(item).then(done)
    }
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
            title={`Add IP ${type} Block`}
            triggerText="add"
            triggerClass="pull-right"
            triggerIcon="fa fa-plus"
            modalRef={refModal}
          >
            <AddBlock type={type} notifyChange={notifyChange} />
          </ModalForm>

          <CardTitle tag="h4">{title}</CardTitle>
        </CardHeader>
        <CardBody>
          <Table>
            <thead className="text-primary">
              <tr>
                <th>Protocol</th>
                <th>IP</th>
                <th>Port</th>
                <th width="5%" className="text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr>
                  <td>{row.Protocol}</td>
                  <td>{row.IP}</td>
                  <td>{row.Port}</td>
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

BlockList.propTypes = {
  type: PropTypes.string.isRequired,
  notifyChange: PropTypes.func.isRequired
}

export default BlockList
