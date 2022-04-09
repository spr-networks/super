import React from 'react'
import { NavLink } from 'react-router-dom'
import { Nav, Collapse } from 'reactstrap'

function Sidebar(props) {
  const [openAvatar, setOpenAvatar] = React.useState(false)
  const [collapseStates, setCollapseStates] = React.useState({})
  const sidebar = React.useRef()
  // this creates the intial state of this component based on the collapse routes
  // that it gets through props.routes
  const getCollapseStates = (routes) => {
    let initialState = {}
    routes.map((prop, key) => {
      if (prop.collapse) {
        initialState = {
          [prop.state]: getCollapseInitialState(prop.views),
          ...getCollapseStates(prop.views),
          ...initialState
        }
      }
      return null
    })
    return initialState
  }
  // this verifies if any of the collapses should be default opened on a rerender of this component
  // for example, on the refresh of the page,
  // while on the src/views/forms/RegularForms.js - route /admin/regular-forms
  const getCollapseInitialState = (routes) => {
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].collapse && getCollapseInitialState(routes[i].views)) {
        return true
      } else if (window.location.pathname.indexOf(routes[i].path) !== -1) {
        return true
      }
    }
    return false
  }
  // this function creates the links and collapses that appear in the sidebar (left menu)
  const createLinks = (routes) => {
    return routes.map((prop, key) => {
      if (prop.redirect) {
        return null
      }
      if (prop.collapse) {
        var st = {}
        st[prop['state']] = !collapseStates[prop.state]
        return (
          <li
            className={getCollapseInitialState(prop.views) ? 'active' : ''}
            key={key}
          >
            <a
              href="#pablo"
              data-toggle="collapse"
              aria-expanded={collapseStates[prop.state]}
              onClick={(e) => {
                e.preventDefault()
                setCollapseStates(st)
              }}
            >
              {prop.icon !== undefined ? (
                <>
                  <i className={prop.icon} />
                  <p>
                    {prop.name}
                    <b className="caret" />
                  </p>
                </>
              ) : (
                <>
                  <span className="sidebar-mini-icon">{prop.mini}</span>
                  <span className="sidebar-normal">
                    {prop.name}
                    <b className="caret" />
                  </span>
                </>
              )}
            </a>
            <Collapse isOpen={collapseStates[prop.state]}>
              <ul className="nav">{createLinks(prop.views)}</ul>
            </Collapse>
          </li>
        )
      }
      return (
        <li className={activeRoute(prop.layout + prop.path)} key={key}>
          <NavLink to={prop.layout + prop.path} activeClassName="">
            {prop.icon !== undefined ? (
              <>
                <span className="sidebar-mini-icon">
                  <i className={prop.icon} />
                </span>
                <span className="sidebar-normal">{prop.name}</span>
              </>
            ) : (
              <>
                <span className="sidebar-mini-icon">{prop.mini}</span>
                <span className="sidebar-normal">{prop.name}</span>
              </>
            )}
          </NavLink>
        </li>
      )
    })
  }
  // verifies if routeName is the one active (in browser input)
  const activeRoute = (routeName) => {
    return props.location.pathname.indexOf(routeName) > -1 ? 'active' : ''
  }
  React.useEffect(() => {
    setCollapseStates(getCollapseStates(props.routes))
  }, [])

  return (
    <div
      className="sidebar"
      data-color={props.bgColor}
      data-active-color={props.activeColor}
    >
      <div className="logo">
        <a href="#nowhere" className="simple-text">
          SPR
        </a>
      </div>

      <div className="sidebar-wrapper" ref={sidebar}>
        <Nav>{createLinks(props.routes)}</Nav>
      </div>
    </div>
  )
}

export default Sidebar
