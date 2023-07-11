import { useState } from 'react'

export default (input) => {
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)

  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    setTouchEnd(0)
    setTouchStart(e.nativeEvent.touches[0].pageX)
  }

  const onTouchMove = (e) => setTouchEnd(e.nativeEvent.touches[0].pageX)

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance
    if (isLeftSwipe && input.onSwipedLeft) {
      input.onSwipedLeft()
    }
    if (isRightSwipe && input.onSwipedRight) {
      input.onSwipedRight()
    }
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd
  }
}

/*useSwipe.propTypes = {
  onSwipedLeft: PropTypes.func,
  onSwipedRight: PropTypes.func
}*/
