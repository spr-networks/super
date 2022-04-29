import React from 'react'
import ReactWizard from 'react-bootstrap-wizard'

import { Row, Col } from 'reactstrap'

// wizard steps
import Step1 from './Edit/AddDevice'
import Step2 from './Edit/WifiConnect'

const steps = [
  {
    stepName: 'WiFi Configuration',
    stepIcon: 'nc-icon nc-settings',
    component: Step1
  },
  {
    stepName: 'Connect Device',
    stepIcon: 'nc-icon nc-tap-01',
    component: Step2
  }
]

function Wizard() {
  return (
    <>
      <div className="content">
        <Row>
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
        </Row>
      </div>
    </>
  )
}

export default Wizard
