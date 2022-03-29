import React from "react";
import { Input } from "reactstrap";
import { updateDNSOverride } from "components/Helpers/Api.js"

export default class DNSOverride extends React.Component {
  constructor(props) {
    super(props)
    //this.state = {Domain: '', ResultIP: '', ClientIP: '', Type: '', Expiration: 0}
    this.state = {...props.item}

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  handleChange(event) {
    let name = event.target.name
    let value = event.target.value
    console.log('change', name, value)
    this.setState({[name]: value})
  }

  /*handleSubmit(event) {
    alert('le submit')
    event.preventDefault()
  }*/

  render() {
    return (
      <>
      {/*<tr>
        <td><Input type="text" placeholder="Domain" name="Domain" value={this.state.Domain} onChange={this.handleChange} /></td>
        <td><Input type="text" placeholder="ResultIP" name="ResultIP" value={this.state.ResultIP} onChange={this.handleChange} /></td>
        <td><Input type="text" placeholder="ClientIP" name="ClientIP" value={this.state.ClientIP} onChange={this.handleChange} /></td>
        <td><Input type="number" placeholder="Domain" name="Expiration" value={this.state.Expiration} onChange={this.handleChange} /></td>
      </tr>*/}
      <tr>
        <td>{this.state.Domain}</td>
        <td>{this.state.ResultIP}</td>
        <td>{this.state.ClientIP}</td>
        <td>{this.state.Expiration}</td>
      </tr>
      </>
    )
  }
}
