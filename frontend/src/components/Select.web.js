import React from 'react'

import { Select as NBSelect } from 'native-base'


const Select = (props) => {
  const isSafari = () =>
    /Safari/.test(navigator.userAgent) &&
    /Apple Computer/.test(navigator.vendor);


  return (
    <NBSelect {...props} selection={isSafari() ? 1 : null}/>
  );
};

Select.Item = NBSelect.Item
export default Select
export { Select }
