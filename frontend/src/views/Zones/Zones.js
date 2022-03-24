import React, { useContext } from 'react'
import { Component } from "react";
import ZoneListing from "components/Zones/ZoneListing.js"
import { getZones, getDevices, getNFVerdictMap } from "components/Helpers/Api.js";
import {APIErrorContext} from 'layouts/Admin.js';

// reactstrap components
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Label,
  FormGroup,
  Input,
  Table,
  Row,
  Col,
  UncontrolledTooltip,
} from "reactstrap";


export default class Zones extends Component {


    state = { zones : {}, zoneRows: [] };

    static contextType = APIErrorContext;

    async componentDidMount() {

      const setState = (v) => {
        this.setState(v)
      }


      async function refreshZones() {
        const d = await getZones().catch(error => {
          this.context.reportError("API Failure: " + error.message)
        })

        const devices = await getDevices().catch(error => {
          this.context.reportError("API Failure: " + error.message)
        })

        let members = {}

        for (const zone of d) {
          members[zone.Name] = []
        }

        for (let identity in devices) {
          let device = devices[identity]
          for (const entry of device.Zones) {
            members[entry].push(device)
          }
        }

        for (let zone of d) {
          zone.Members = members[zone.Name]
        }


        let divs = []
        if (d) {
          for (const v of d) {
              const vmap = await getNFVerdictMap(v.Name).catch(error => {
                if (error.message == 404) {
                  //no clients in map yet
                } else {
                  this.context.reportError("API Failure for: " + v.Name + " " + error.message)
                }
              })
              const generatedID = Math.random().toString(36).substr(2, 9);
              v.vmap = vmap
              divs.push( <ZoneListing key={generatedID} zone={v} devices={devices} notifyChange={notifyChange} /> )
           };
           setState({ zones: d, zoneRows: divs })
        }
      }

      const notifyChange = () => {
        refreshZones()
      }

      refreshZones = refreshZones.bind(this)
      refreshZones()
    }

    render() {

      return (
        <>
          <div className="content">
            { this.state.zoneRows }
          </div>
        </>
      );

    }
}
