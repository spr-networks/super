import React from 'react'

// reactstrap components
import { Collapse, NavbarBrand, Navbar, Nav, Container } from 'reactstrap'

function AuthNavbar(props) {
  const [collapseOpen, setCollapseOpen] = React.useState(false)
  const [color, setColor] = React.useState('navbar-transparent')
  // this function opens and closes the collapse on small devices
  // it also adds navbar-transparent class to the navbar when closed
  // ad bg-white when opened
  const toggleCollapse = () => {
    if (!collapseOpen) {
      setColor('bg-white')
    } else {
      setColor('navbar-transparent')
    }
    setCollapseOpen(!collapseOpen)
  }
  return (
    <Navbar
      className="navbar-absolute fixed-top navbar-transparent"
      expand="lg"
    >
      <Container>
        <div className="navbar-wrapper">
          <NavbarBrand href="#spr" onClick={(e) => e.preventDefault()}>
            SPR
          </NavbarBrand>
        </div>
        <button
          aria-controls="navigation-index"
          aria-expanded={false}
          aria-label="Toggle navigation"
          className="navbar-toggler"
          data-toggle="collapse"
          type="button"
          onClick={toggleCollapse}
        >
          <span className="navbar-toggler-bar navbar-kebab" />
          <span className="navbar-toggler-bar navbar-kebab" />
          <span className="navbar-toggler-bar navbar-kebab" />
        </button>
        <Collapse isOpen={collapseOpen} className="justify-content-end" navbar>
          <Nav navbar></Nav>
        </Collapse>
      </Container>
    </Navbar>
  )
}

export default AuthNavbar
