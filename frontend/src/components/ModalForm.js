import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, IconButton, Modal } from 'native-base'
//import { Button, Modal } from 'reactstrap'

const ModalForm = (props) => {
  const [show, setShow] = useState(false)

  const closeModal = () => setShow(false)
  const toggleModal = () => setShow(!show)

  // this allows us to close the modal using a ref to the modal
  useEffect(() => {
    if (props.modalRef) {
      props.modalRef.current = toggleModal
    }

    return () => {
      if (props.modalRef) {
        props.modalRef.current = null
      }
    }
  })

  let triggerClass = `btn-round ${props.triggerClass}`
  //className={triggerClass}
  return (
    <>
      {props.triggerText ? (
        <Button
          size="md"
          variant="outline"
          colorScheme="primary"
          color="dark.400"
          rounded="full"
          leftIcon={
            props.triggerIcon ? <i className={props.triggerIcon} /> : null
          }
          onPress={toggleModal}
        >
          {props.triggerText || 'Open Modal'}
        </Button>
      ) : null}

      {/* **TODO** fix the icon here ----
      <Icon as={Feather} name="plus" size="sm" color="warmGray.50" />
              <IconButton
          borderRadius="sm"
          variant="solid"
          icon={<i className={props.triggerIcon} />}
          onPress={toggleModal}
        />
 */}

      {show ? (
        <Modal isOpen={show} onClose={toggleModal} _fade={{}}>
          <Modal.Content maxWidth="440px">
            <Modal.CloseButton />
            <Modal.Header>{props.title || 'Title'}</Modal.Header>
            <Modal.Body>{props.children}</Modal.Body>
            <Modal.Footer />
          </Modal.Content>
        </Modal>
      ) : null}
    </>
  )
}

export default ModalForm
