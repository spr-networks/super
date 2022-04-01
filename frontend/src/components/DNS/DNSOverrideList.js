import React from 'react'
import ModalForm from 'components/ModalForm'
import DNSAddOverride from 'components/DNS/DNSAddOverride'
import { APIErrorContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'

import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
} from 'reactstrap'

const DNSOverrideList = (props) => {
  const context = React.useContext(APIErrorContext)

  const deleteListItem = async (item) => {
    blockAPI.deleteOverride(item)
      .then(res => {
        props.notifyChange('config')
      })
      .catch(error => {
        context.reportError("API Failure: " + error.message)
      })
  }

	let modalRef = React.useRef(null) //React.createRef()

	const notifyChange = async () => {
		await props.notifyChange('config')
		// close modal when added
		//modalRef.current()
	}

	let overrideType = props.title.includes('Permit') ? 'permit' : 'block'
	let list = props.list

	return (
		<Card>
			<CardHeader>

				<ModalForm
					key="mf1"
					title="Add DNS Override"
					triggerText="add"
					triggerClass="pull-right"
					triggerIcon="fa fa-plus"
					modalRef={modalRef}
				>
					<DNSAddOverride type={overrideType} notifyChange={notifyChange} />
				</ModalForm>

				<CardTitle tag="h4">{props.title || "DNS Override"}</CardTitle>
				<p className="text-muted">Overrides allow you to set rules for DNS queries</p>
			</CardHeader>
			<CardBody>
				<Table responsive>
					<thead className="text-primary">
						<tr>
							<th width="25%">Domain</th>
							<th>Result IP</th>
							<th>Client IP</th>
							<th className="text-center">Expiration</th>
							<th className="text-center">Actions</th>
						</tr>
					</thead>
					<tbody>
						{
							list.map(item => (
								<tr key={item.Domain}>
									<td>{item.Domain}</td>
									<td>{item.ResultIP}</td>
									<td>{item.ClientIP}</td>
									<td className="text-center">{item.Expiration}</td>
									<td className="text-center">
										<Button
											className="btn-icon"
											color="danger"
											size="sm"
											type="button"
											onClick={(e) => deleteListItem(item)}>
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
	)
}

export default DNSOverrideList
