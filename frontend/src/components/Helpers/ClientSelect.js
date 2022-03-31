import { useState } from "react"
import Select from "react-select"

export default (props) => {
  const [selected, setSelected] = useState(null)
  let devices = props.devices
  let options = props.options
  /*Object.values(devices)
  .filter(d => d.RecentIP.length)
  .map(d => { return {label: d.Name||d.RecentIP, value: d.RecentIP}})*/

  let isMulti = props.isMulti || false
  let defaultValue = props.defaultValue || []

  return (
    <Select
      isMulti={isMulti} 
      isSearchable={true} 
      options={options}
      value={defaultValue}
      onChange={props.onChange}
    />)
}