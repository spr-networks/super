import React, { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { View } from 'native-base'

import LogListDb from 'components/Logs/LogListDb'

const Events = (props) => {
  return (
    <View>
      <LogListDb />
    </View>
  )
}

export default Events
