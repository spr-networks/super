import React, { Component } from 'react'
import PropTypes from 'prop-types'
import GroupDevice from 'components/Groups/GroupDevice'
import { groupDescriptions } from 'api/Group'

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

class GroupListing extends Component {
  render() {
    function translateName(name) {
      if (name === 'dns') {
        return 'DNS'
      } else if (name === 'lan') {
        return 'LAN'
      } else if (name == 'wan') {
        return 'Internet (wan)'
      }
      return name
    }

    const group = this.props.group
    //const devices = this.props.devices

    const rows = []
    if (group.Members && group.Members.length > 0) {
      for (const dev of group.Members) {
        //if the device was in the vmap, mark it as active
        dev.ifname = ''

        if (group.vmap) {
          for (const entry of group.vmap) {
            // NOTE not all maps have ether_addr so also match on ip
            if (entry.ifname && entry.ether_addr == dev.MAC) {
              dev.ifname = entry.ifname

              if (dev.IP) {
                continue
              }

              if (entry.ipv4_addr) {
                dev.IP = entry.ipv4_addr
              } else if (group.ipMap && group.ipMap[dev.MAC]) {
                dev.IP = group.ipMap[dev.MAC].IP
              }
            } else if (
              entry.ifname &&
              entry.ipv4_addr &&
              entry.ipv4_addr == dev.RecentIP
            ) {
              dev.ifname = entry.ifname

              if (dev.IP) {
                continue
              }

              dev.IP = entry.ipv4_addr
            }
          }
        }

        rows.push(<GroupDevice key={dev.Name} device={dev} />)
      }
    }

    return (
      <>
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <CardTitle tag="h4">{translateName(group.Name)}</CardTitle>
                <CardSubtitle className="text-muted">
                  {groupDescriptions[group.Name] || ''}
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
                  <tbody>{rows}</tbody>
                </Table>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </>
    )
  }
}

GroupListing.propTypes = {
  group: PropTypes.object
}

export default GroupListing
