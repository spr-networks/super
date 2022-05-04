import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Icon, Modal } from 'native-base'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
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

  return (
    <>
      {props.triggerText ? (
        <Button
          size="md"
          variant="outline"
          colorScheme="primary"
          color="dark.400"
          rounded="full"
          borderWidth={2}
          borderColor="cyan.200"
          leftIcon={
            props.triggerIcon ? (
              <Icon as={FontAwesomeIcon} icon={props.triggerIcon} />
            ) : null
          }
          onPress={toggleModal}
        >
          {props.triggerText || 'Open Modal'}
        </Button>
      ) : null}

      {show ? (
        <Modal isOpen={show} onClose={toggleModal} animationPreset="slide">
          <Modal.Content maxWidth="440px">
            <Modal.CloseButton />
            <Modal.Header>{props.title || 'Title'}</Modal.Header>
            <Modal.Body>{props.children}</Modal.Body>
            {/*<Modal.Footer />*/}
          </Modal.Content>
        </Modal>
      ) : null}
    </>
  )
}

export default ModalForm
