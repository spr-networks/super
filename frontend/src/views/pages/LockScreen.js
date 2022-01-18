/*!

=========================================================
* Paper Dashboard PRO React - v1.3.0
=========================================================

* Product Page: https://www.creative-tim.com/product/paper-dashboard-pro-react
* Copyright 2021 Creative Tim (https://www.creative-tim.com)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React from "react";

// reactstrap components
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  FormGroup,
  Input,
  Container,
  Col,
} from "reactstrap";

function LockScreen() {
  React.useEffect(() => {
    document.body.classList.toggle("lock-page");
    return function cleanup() {
      document.body.classList.toggle("lock-page");
    };
  });
  return (
    <div className="lock-page">
      <Container>
        <Col className="ml-auto mr-auto" lg="4" md="6">
          <Card className="card-lock text-center">
            <CardHeader>
              <img
                alt="..."
                src={require("assets/img/faces/joe-gardner-2.jpg").default}
              />
            </CardHeader>
            <CardBody>
              <CardTitle tag="h4">Joe Gardner</CardTitle>
              <FormGroup>
                <Input
                  placeholder="Enter Password.."
                  type="password"
                  autoComplete="off"
                />
              </FormGroup>
            </CardBody>
            <CardFooter>
              <Button
                className="btn-round"
                color="default"
                href="#pablo"
                onClick={(e) => e.preventDefault()}
                outline
              >
                Unlock
              </Button>
            </CardFooter>
          </Card>
        </Col>
      </Container>
      <div
        className="full-page-background"
        style={{
          backgroundImage: `url(${
            require("assets/img/bg/bruno-abatti.jpg").default
          })`,
        }}
      />
    </div>
  );
}

export default LockScreen;
