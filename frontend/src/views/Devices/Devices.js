import React from "react";
import DeviceListing from "components/Devices/DeviceListing.js"

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


function Devices() {

  return (
    <>
      <div className="content">
        <DeviceListing />
      </div>
    </>
  );
}

export default Devices;
