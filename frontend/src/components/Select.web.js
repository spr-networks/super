import React from 'react'

import { Select as NBSelect } from 'native-base'

/*
const Select = (...props) => {
  const isSafari = () =>
    /Safari/.test(navigator.userAgent) &&
    /Apple Computer/.test(navigator.vendor)

  //selectedValue={countryWifi}
  //onValueChange={(value) => setCountryWifi(value)}
  //accessibilityLabel={`Choose Country Code`}
  return <NBSelect {...props} selection={isSafari() ? 1 : null} />
}
*/

const Select = NBSelect
//Select.Item = NBSelect.Item

export default Select
export { Select }
