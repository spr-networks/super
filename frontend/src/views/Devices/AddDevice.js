import React from "react";
// react plugin used to create a form with multiple steps
import ReactWizard from "react-bootstrap-wizard";

// reactstrap components
import { Col } from "reactstrap";

// wizard steps
import Step1 from "./Edit/AddDevice.js";
import Step2 from "./Edit/WifiConnect.js";

const steps = [
  {
    stepName: "WiFi Configuration",
    stepIcon: "nc-icon nc-settings",
    component: Step1,
  },
  {
    stepName: "Connect Device",
    stepIcon: "nc-icon nc-tap-01",
    component: Step2,
  },
];


function Wizard() {

  return (
    <>
      <div className="content">
        <Col className="mr-auto ml-auto" md="10">
          <ReactWizard
            steps={steps}
            navSteps
            validate
            title="Add Device"
            description="Set up a new device on the network"
            headerTextCenter
            finishButtonClasses="btn-wd"
            nextButtonClasses="btn-wd"
            previousButtonClasses="btn-wd"
          />
        </Col>
      </div>
    </>
  );
}

export default Wizard;
