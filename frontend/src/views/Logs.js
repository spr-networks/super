import React, { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { View } from 'native-base'

import LogList from 'components/Logs/LogList'
import LogListDb from 'components/Logs/LogListDb'

const Logs = (props) => {
  const [containers, setContainers] = useState([])
  const params = useParams()

  useEffect(() => {
    let { containers } = params
    if (containers && containers != ':containers') {
      setContainers(containers.split(','))
    }
  }, [])

  return (
    <View>
      <LogList containers={containers} />
      {/*<LogListDb />*/}
    </View>
  )
}

export default Logs
