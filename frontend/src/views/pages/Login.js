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
import { useState } from "react";
import { authHeader, saveLogin, testLogin } from "components/Helpers/Api.js";
import NotificationAlert from "react-notification-alert";
import { Redirect } from "react-router-dom";

// reactstrap components
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Label,
  FormGroup,
  Form,
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  Container,
  Col,
  Row,
} from "reactstrap";

function Login() {


  React.useEffect(() => {
    document.body.classList.toggle("login-page");
    return function cleanup() {
      document.body.classList.toggle("login-page");
    };
  });

  let formRef= React.createRef();


  const notificationAlert = React.useRef();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedin] = useState(false);


  const notifyWrongLogin = () => {
    var options = {};
    options = {
      place: "tc",
      message: (
        <div>
          <div>
            Failed to sign in
          </div>
        </div>
      ),
      type: "danger",
      icon: "now-ui-icons ui-1_bell-53",
      autoDismiss: 7,
    };
    notificationAlert.current.notificationAlert(options);

  }

  const handleLogin = (e) => {
    e.preventDefault();

    testLogin(username, password, function(success){
      if (success) {
        saveLogin(username, password)
        setLoggedin(true)
      } else {
        //alert that the password was wrong
        notifyWrongLogin();
      }
    })

  };

  if (loggedIn) {
    return <Redirect to='/admin/home' />
  }

  return (
    <div className="login-page">
    <NotificationAlert ref={notificationAlert} />
      <Container>
        <Row>
          <Col className="ml-auto mr-auto" lg="4" md="6">
            <Form ref={formRef} action="" className="form" method="">
              <Card className="card-login">
                <CardHeader>
                  <CardHeader>
                    <h3 className="header text-center">Login</h3>
                  </CardHeader>
                </CardHeader>
                <CardBody>
                  <InputGroup>
                    <InputGroupAddon addonType="prepend">
                      <InputGroupText>
                        <i className="nc-icon nc-single-02" />
                      </InputGroupText>
                    </InputGroupAddon>
                    <Input placeholder="Username..." type="text" value={username} onChange={(e) => setUsername(e.target.value)}/>
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon addonType="prepend">
                      <InputGroupText>
                        <i className="nc-icon nc-key-25" />
                      </InputGroupText>
                    </InputGroupAddon>
                    <Input
                      placeholder="Password"
                      type="password"
                      autoComplete="off"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                    />
                  </InputGroup>
                  {
                  /*
                  <br />
                  <FormGroup>
                    <FormGroup check>
                      <Label check>
                        <Input defaultChecked defaultValue="" type="checkbox" />
                        <span className="form-check-sign" />
                        Subscribe to newsletter
                      </Label>
                    </FormGroup>
                  </FormGroup>
                  */
                  }
                </CardBody>
                <CardFooter>
                  <Button
                    block
                    className="btn-round mb-3"
                    color="warning"
                    href="#pablo"
                    onClick={handleLogin}
                  >
                    Login
                  </Button>
                </CardFooter>
              </Card>
            </Form>
          </Col>
        </Row>
      </Container>
      <div
        className="full-page-background"
        style={{
          backgroundImage: `url(${
            require("assets/img/bg/bg.jpg").default
          })`,
        }}
      />
    </div>
  );
}

export default Login;
