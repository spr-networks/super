//TODO fetch clients
import Select from "react-select"

export default (props) => {
  let devices = props.devices
  let options = []
  
  if (props.devices) {
    options = Object.values(devices)
    .filter(d => d.RecentIP.length)
    .map(d => { return {label: d.Name||d.RecentIP, value: d.RecentIP}})
  } else {
    options = props.options
  }
  
  let isMulti = props.isMulti || false
  let defaultValue = props.defaultValue || []

  return (
    <Select
      isMulti={isMulti}
      options={options}
      value={defaultValue}
      onChange={props.onChange}
    />)
}