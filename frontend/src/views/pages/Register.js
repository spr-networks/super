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
  Label,
  FormGroup,
  Form,
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  Container,
  Row,
  Col,
} from "reactstrap";

function Register() {
  React.useEffect(() => {
    document.body.classList.toggle("register-page");
    return function cleanup() {
      document.body.classList.toggle("register-page");
    };
  });
  return (
    <div className="register-page">
      <Container>
        <Row>
          <Col className="ml-auto" lg="5" md="5">
            <div className="info-area info-horizontal mt-5">
              <div className="icon icon-primary">
                <i className="nc-icon nc-tv-2" />
              </div>
              <div className="description">
                <h5 className="info-title">Marketing</h5>
                <p className="description">
                  We've created the marketing campaign of the website. It was a
                  very interesting collaboration.
                </p>
              </div>
            </div>
            <div className="info-area info-horizontal">
              <div className="icon icon-primary">
                <i className="nc-icon nc-html5" />
              </div>
              <div className="description">
                <h5 className="info-title">Fully Coded in HTML5</h5>
                <p className="description">
                  We've developed the website with HTML5 and CSS3. The client
                  has access to the code using GitHub.
                </p>
              </div>
            </div>
            <div className="info-area info-horizontal">
              <div className="icon icon-info">
                <i className="nc-icon nc-atom" />
              </div>
              <div className="description">
                <h5 className="info-title">Built Audience</h5>
                <p className="description">
                  There is also a Fully Customizable CMS Admin Dashboard for
                  this product.
                </p>
              </div>
            </div>
          </Col>
          <Col className="mr-auto" lg="4" md="6">
            <Card className="card-signup text-center">
              <CardHeader>
                <CardTitle tag="h4">Register</CardTitle>
                <div className="social">
                  <Button className="btn-icon btn-round" color="twitter">
                    <i className="fa fa-twitter" />
                  </Button>
                  <Button className="btn-icon btn-round" color="dribbble">
                    <i className="fa fa-dribbble" />
                  </Button>
                  <Button className="btn-icon btn-round" color="facebook">
                    <i className="fa fa-facebook-f" />
                  </Button>
                  <p className="card-description">or be classical</p>
                </div>
              </CardHeader>
              <CardBody>
                <Form action="" className="form" method="">
                  <InputGroup>
                    <InputGroupAddon addonType="prepend">
                      <InputGroupText>
                        <i className="nc-icon nc-single-02" />
                      </InputGroupText>
                    </InputGroupAddon>
                    <Input placeholder="First Name..." type="text" />
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon addonType="prepend">
                      <InputGroupText>
                        <i className="nc-icon nc-circle-10" />
                      </InputGroupText>
                    </InputGroupAddon>
                    <Input placeholder="Last Name..." type="text" />
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon addonType="prepend">
                      <InputGroupText>
                        <i className="nc-icon nc-email-85" />
                      </InputGroupText>
                    </InputGroupAddon>
                    <Input placeholder="Email..." type="email" />
                  </InputGroup>
                  <FormGroup check className="text-left">
                    <Label check>
                      <Input defaultChecked type="checkbox" />
                      <span className="form-check-sign" />I agree to the{" "}
                      <a href="#pablo" onClick={(e) => e.preventDefault()}>
                        terms and conditions
                      </a>
                      .
                    </Label>
                  </FormGroup>
                </Form>
              </CardBody>
              <CardFooter>
                <Button
                  className="btn-round"
                  color="info"
                  href="#pablo"
                  onClick={(e) => e.preventDefault()}
                >
                  Get Started
                </Button>
              </CardFooter>
            </Card>
          </Col>
        </Row>
      </Container>
      <div
        className="full-page-background"
        style={{
          backgroundImage: `url(${
            require("assets/img/bg/jan-sendereks.jpg").default
          })`,
        }}
      />
    </div>
  );
}

export default Register;
