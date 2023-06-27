import React from 'react'

import { Select as NBSelect } from 'native-base';

export const Select = (...props) => {

  const isSafari = () => /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor);

  /*
  selectedValue={countryWifi}
  onValueChange={(value) => setCountryWifi(value)}
  accessibilityLabel={`Choose Country Code`}
*/
  return (
    <NBSelect
      {...props}
      selection={isSafari() ? 1 : null}
    />
  );
};

export default Select;
