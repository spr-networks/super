import React, { Component } from 'react'
import ZoneDevice from 'components/Zones/ZoneDevice'
import { zoneDescriptions } from 'api/Zone'

import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  Table,
  Row,
  Col
} from 'reactstrap'

export default class ZoneListing extends Component {
  render() {
    function translateName(zoneName) {
      if (zoneName === 'dns') {
        return 'DNS'
      } else if (zoneName === 'lan') {
        return 'LAN'
      } else if (zoneName == 'wan') {
        return 'Internet (wan)'
      }
      return zoneName
    }

    const zone = this.props.zone
    const devices = this.props.devices

    const zoneRows = []
    if (zone.Members && zone.Members.length > 0) {
      for (const v of zone.Members) {
        const generatedID = Math.random().toString(36).substr(2, 9)
        //if the device was in the vmap, mark it as active
        v.ifname = ''
        if (zone.vmap) {
          for (const entry of zone.vmap) {
            if (entry.ifname && entry.ether_addr == v.MAC) {
              v.ifname = entry.ifname
              v.IP =
                entry.ipv4_addr ||
                (zone.ipMap && zone.ipMap[entry.ether_addr]
                  ? zone.ipMap[entry.ether_addr].IP
                  : '--')
            }
          }
        }
        zoneRows.push(<ZoneDevice key={generatedID} device={v} />)
      }
    }

    return (
      <>
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <CardTitle tag="h4">{translateName(zone.Name)}</CardTitle>
                <CardSubtitle className="text-muted">
                  {zoneDescriptions[zone.Name] || ''}
                </CardSubtitle>
              </CardHeader>
              <CardBody>
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Device Name</th>
                      <th>MAC Address</th>
                      <th>IP Address</th>
                      <th>Active Interface</th>
                    </tr>
                  </thead>
                  <tbody>{zoneRows}</tbody>
                </Table>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </>
    )
  }
  /*
  <code>
     Raw NFMAP: {JSON.stringify(zone.vmap)}
  </code>
  */
}
