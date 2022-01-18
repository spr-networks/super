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
/*eslint-disable*/
import React from "react";
import { Container, Row } from "reactstrap";
// used for making the prop types of this component
import PropTypes from "prop-types";

function Footer(props) {
  return (
    <footer className={"footer" + (props.default ? " footer-default" : "")}>
      <Container fluid={props.fluid ? true : false}>
        <Row>
          <nav className="footer-nav">
            <ul>
              <li>
                <a href="https://www.supernetworks.org/">Supernetworks</a>
              </li>
              <li>
                <a href="https://www.supernetworks.org/pages/blog">Blog</a>
              </li>
              <li>
                <a href="https://www.supernetworks.org/pages/docs/intro" target="_blank">
                  Documentation
                </a>
              </li>
              <li>
                <a href="https://github.com/spr-networks/super" target="_blank">
                  Github
                </a>
              </li>
            </ul>
          </nav>
          <div className="credits ml-auto">
            <span className="copyright">
              &copy; {1900 + new Date().getYear()}, made with{" "}
              Paper Pro Dashboard React by Creative Tim
            </span>
          </div>
        </Row>
      </Container>
    </footer>
  );
}

Footer.propTypes = {
  default: PropTypes.bool,
  fluid: PropTypes.bool,
};

export default Footer;
