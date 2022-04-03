import React from 'react'
import './Switch.css'

export default class Switch extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isChecked: props.value || false,
    };
    
    this.handleChange = this.handleChange.bind(this);
  }

  handleChange(e) {
    let isChecked = !this.state.isChecked
    this.setState({ isChecked })
    this.props.onChange(e, isChecked)
  }

  render () {
    return (
      <label className="switch">
        <input type="checkbox" checked={this.state.isChecked} onChange={this.handleChange} />
        <div className="slider"></div>
      </label>
    );
  }
}