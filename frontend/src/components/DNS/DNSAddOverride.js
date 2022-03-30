import React, { useContext } from 'react'
import { updateDNSOverride } from "components/Helpers/Api"
import { APIErrorContext } from 'layouts/Admin'
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
  FormText,
  Input,
  Row
} from "reactstrap";

export default class DNSAddOverride extends React.Component {
  static contextType = APIErrorContext;
  state = { Type: '', Domain: '', ResultIP: '0.0.0.0', ClientIP: '*', Expiration: 0, check: {} };

  constructor(props) {
    super(props)

    this.state.Type = props.type
    this.state.check = {
      Domain: '',
      ResultIP: '',
      ClientIP: '',
    }

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    let name = event.target.name
    let value = event.target.value

    let check = {Domain: '', ResultIP: '', ClientIP: ''}

    if (name == 'Domain' && !value.length) {
      check.Domain = 'has-danger'
    }

    if (name.match(/^(Result|Client)IP$/) && value != '*' && !value.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
      check[name] = 'has-danger'
    }

    this.setState({check})

    this.setState({[name]: value})
  }

  isValid() {
    return (Object.values(this.state.check).filter(v => v.length).length == 0)
  }

  handleSubmit(event) {
    event.preventDefault()

    if (!this.isValid()) {
      return
    }

    let override = {
      Type:     this.state.Type,
      Domain:   this.state.Domain,
      ResultIP: this.state.ResultIP,
      ClientIP: this.state.ClientIP,
      Expiration: this.state.Expiration
    }

    if (!override.Domain.endsWith('.')) {
      override.Domain += '.'
    }

    updateDNSOverride(override)
      .then(res => {
        this.props.notifyChange('override')
      })
      .catch(error => {
        this.context.reportError("API Failure: " + error.message)
      })
  }

  render() {
    return (
			<Form onSubmit={this.handleSubmit}>
				<Row>
					<Label for="Domain" sm={2}>Domain</Label>
					<Col sm={10}>
						<FormGroup className={this.state.check.Domain}>
							<Input type="text" id="Domain" placeholder="" name="Domain" value={this.state.Domain} onChange={this.handleChange} autoFocus={true} />
              {this.state.check.Domain == 'has-danger' ? (
                <Label className="error">Specify a domain name</Label>
              ) : null}
						</FormGroup>
					</Col>
				</Row>

				<Row>
					<Label for="ResultIP" sm={2}>Result IP</Label>
					<Col sm={10}>
						<FormGroup className={this.state.check.ResultIP}>
							<Input type="text" id="ResultIP" placeholder="0.0.0.0" name="ResultIP" value={this.state.ResultIP} onChange={this.handleChange} />
              {this.state.check.ResultIP == 'has-danger' ? (
                <Label className="error">Please enter a valid IP or *</Label>
              ) : (
                <FormText tag="span">IP address to return for domain name lookup</FormText>
              )}
						</FormGroup>
					</Col>
				</Row>

				<Row>
					<Label for="ClientIP" sm={2}>Client IP</Label>
					<Col sm={10}>
						<FormGroup className={this.state.check.ClientIP}>
							<Input type="text" id="ClientIP" placeholder="*" name="ClientIP" value={this.state.ClientIP} onChange={this.handleChange} />
              {this.state.check.ClientIP == 'has-danger' ? (
                <Label className="error">Please enter a valid IP or *</Label>
              ) : (
                <FormText tag="span">* for all clients</FormText>
              )}
						</FormGroup>
					</Col>
				</Row>


				<Row>
					<Label for="Expiration" sm={2}>Expiration</Label>
					<Col sm={10}>
						<FormGroup>
							<Input type="number" id="Expiration" placeholder="Expiration" name="Expiration" value={this.state.Expiration} onChange={this.handleChange} />
              <FormText tag="span">If non zero has unix time for when the entry should disappear</FormText>
						</FormGroup>
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
