import React, { useContext, useState } from 'react'

import { pluginAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'

import {
  Button,
  Col,
  Label,
  Form,
  FormGroup,
  FormText,
  Input,
  Row
} from 'reactstrap'

const AddPlugin = (props) => {
  const contextType = useContext(APIErrorContext)

  const [Name, setName] = useState('')
  const [URI, setURI] = useState('')
  const [UnixPath, setUnixPath] = useState('')

  const handleChange = (e) => {
    let name = e.target.name,
      value = e.target.value

    if (name == 'Name') {
      setName(value)
    }
    if (name == 'URI') {
      setURI(value)
    }
    if (name == 'UnixPath') {
      setUnixPath(value)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // TODO validate
    let plugin = { Name, URI, UnixPath }
    pluginAPI
      .add(plugin)
      .then((res) => {
        if (props.notifyChange) {
          props.notifyChange('plugin')
        }
      })
      .catch((err) => contextType.reportError(`API Error: ${err}`))
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Row>
        <Label for="Name" md={2}>
          Name
        </Label>
        <Col md={10}>
          <FormGroup>
            <Input
              type="text"
              id="Name"
              placeholder="Plugin name"
              name="Name"
              value={Name}
              onChange={handleChange}
              autoFocus
            />
            <FormText tag="span">
              Use a unique name to identify your plugin
            </FormText>
          </FormGroup>
        </Col>
      </Row>
      <Row>
        <Label for="URI" md={2}>
          URI
        </Label>
        <Col md={10}>
          <FormGroup>
            <Input
              type="text"
              id="URI"
              placeholder="Plugin URI"
              name="URI"
              value={URI}
              onChange={handleChange}
              autoFocus
            />
            <FormText tag="span">
              Plugin will be @ "http://spr/plugins/{URI || 'URI-here'}/"
            </FormText>
          </FormGroup>
        </Col>
      </Row>
      <Row>
        <Label for="UnixPath" md={2}>
          Unix Path
        </Label>
        <Col md={10}>
          <FormGroup>
            <Input
              type="text"
              id="UnixPath"
              placeholder="Plugin pathname for unix socket"
              name="UnixPath"
              value={UnixPath}
              onChange={handleChange}
              autoFocus
            />
            <FormText tag="span">
              Use a unique name to identify your plugin
            </FormText>
          </FormGroup>
        </Col>
      </Row>
      <Row>
        <Col sm={{ offset: 2, size: 10 }}>
          <Button
            className="btn-round"
            color="primary"
            size="md"
            type="submit"
            onClick={handleSubmit}
          >
            Save
          </Button>
        </Col>
      </Row>
    </Form>
  )
}

export default AddPlugin
