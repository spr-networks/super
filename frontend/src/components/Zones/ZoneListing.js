import { getZones } from "components/Helpers/Api.js";
import { Component } from "react";
import ZoneDevice from "components/Zones/ZoneDevice.js"
import React, { useContext } from 'react'
import ReactBSAlert from "react-bootstrap-sweetalert";

// reactstrap components
import {
  Button,
  ButtonGroup,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Label,
  FormGroup,
  Input,
  Table,
  Row,
  Col,
  UncontrolledTooltip,
} from "reactstrap";

export default class ZoneListing extends Component {


  render() {

    function translateName(zoneName) {
      if (zoneName === "dns") {
        return "DNS"
      } else if (zoneName === "lan") {
        return "LAN"
      } else if (zoneName == "wan") {
        return "Internet (wan)"
      }
      return zoneName
    }

    const zone = this.props.zone;
    const zoneRows = []

    if (zone.Clients.length > 0) {
      for (const v of zone.Clients) {

          const generatedID = Math.random().toString(36).substr(2, 9);
          //if the device was in the vmap, mark it as active
          v.ifname = "--"
          if (zone.vmap) {
            for (const entry of zone.vmap) {
              if (entry.ifname && entry.ether_addr == v.Mac) {
                v.ifname = entry.ifname
                v.IP = entry.ipv4_addr || ((zone.ipMap && zone.ipMap[entry.ether_addr]) ? zone.ipMap[entry.ether_addr].IP : "--")
              }
            }
          }
          zoneRows.push( <ZoneDevice key={generatedID} device={v} />)
      }
    }

    return (
      <>
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <CardTitle tag="h4">{translateName(zone.Name)}</CardTitle>
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
                  <tbody>
                    {zoneRows}
                  </tbody>
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
