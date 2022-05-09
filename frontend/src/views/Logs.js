import { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { View } from 'native-base'

import LogList from 'components/Logs/LogList'

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
    </View>
  )
}

export default Logs
