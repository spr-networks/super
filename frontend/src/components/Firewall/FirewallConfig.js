import { useEffect } from 'react'
import { firewallAPI } from 'api'

import {
  Button,
  Label,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Row,
  Col
} from 'reactstrap'

const FirewallConfig = (props) => {
  let config = props.config || {}
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Config</CardTitle>
        </CardHeader>
        <CardBody>
          <pre>{JSON.stringify(config, null, '  ')}</pre>
        </CardBody>
      </Card>
    </>
  )
}

export default FirewallConfig
