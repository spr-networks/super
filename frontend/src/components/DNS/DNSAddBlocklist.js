import React, { useContext } from 'react'
import { updateDNSBlocklist } from "components/Helpers/Api.js"
//import Switch from "react-bootstrap-switch";

// reactstrap components
import {
  Button,
  Col,
  Card,
  CardFooter,
  CardHeader,
  CardBody,
  CardTitle,
  Label,
  Form,
  FormGroup,
  Input,
  Row
} from "reactstrap";

export default class DNSAddBlocklist extends React.Component {
  state = { URI: 'https://', Enabled: true };
  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
    this.handleSwitchChange = this.handleSwitchChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    this.setState({URI: event.target.value})
  }

  handleSwitchChange(el, Enabled) {
    this.setState({Enabled})
  }

  handleSubmit(event) {
    let blocklist = {URI: this.state.URI, Enabled: this.state.Enabled}
    updateDNSBlocklist(blocklist)

    this.props.notifyChange('blocklists')

    event.preventDefault()
  }

  render() {
    let formRef = React.createRef()

    return (
			<Form onSubmit={this.handleSubmit}>
				<Row>
					<Label for="URI" sm={2}>URI</Label>
					<Col sm={10}>
						<FormGroup>
							<Input type="text" id="URI" placeholder="https://..." name="URI" value={this.state.URI} onChange={this.handleChange} />
						</FormGroup>
					</Col>
				</Row>

				<Row>
					<Label for="Enabled" sm={2}>Enabled</Label>
					<Col sm={10}>
						<FormGroup check>
							<Label check className="mb-2">
								<Input type="checkbox" checked={this.state.Enabled} onChange={(e) => this.handleSwitchChange(this, !this.state.Enabled)} />
								<span className="form-check-sign" />
							</Label>
						</FormGroup>
						{/*<Switch
							onColor="info"
							offColor="info"
							value={this.state.Enabled}
							onChange={this.handleSwitchChange}
							name="Enabled"
						/>*/}
					</Col>
				</Row>

				<Row>
					<Col sm={{offset: 2, size: 10}}>
						<Button
							className="btn-round"
							color="primary"
							size="md"
							type="submit"
							onClick={this.handleSubmit}
						>
						Save
						</Button>
					</Col>
				</Row>
			</Form>
    )
  }
}
