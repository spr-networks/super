import { useState } from 'react'

export default ({ onSwipedLeft, onSwipedRight, onSwipedUp, onSwipedDown }) => {
  const [touchStartX, setTouchStartX] = useState(0)
  const [touchStartY, setTouchStartY] = useState(0)
  const [touchEndX, setTouchEndX] = useState(0)
  const [touchEndY, setTouchEndY] = useState(0)

  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    setTouchEndX(0)
    setTouchEndY(0)
    setTouchStartX(e.nativeEvent.touches[0].pageX)
    setTouchStartY(e.nativeEvent.touches[0].pageY)
  }

  const onTouchMove = (e) => {
    setTouchEndX(e.nativeEvent.touches[0].pageX)
    setTouchEndY(e.nativeEvent.touches[0].pageY)
  }

  const onTouchEnd = () => {
    if (!touchStartX || !touchEndX || !touchStartY || !touchEndY) return
    const distanceX = touchStartX - touchEndX
    const distanceY = touchStartY - touchEndY
    const isLeftSwipe = distanceX > minSwipeDistance
    const isRightSwipe = distanceX < -minSwipeDistance
    const isUpSwipe = distanceY > minSwipeDistance
    const isDownSwipe = distanceY < -minSwipeDistance

    if (isLeftSwipe && !isUpSwipe && !isDownSwipe && onSwipedLeft) {
      onSwipedLeft()
    }

    if (isRightSwipe && !isUpSwipe && !isDownSwipe && onSwipedRight) {
      onSwipedRight()
    }

    if (isUpSwipe && !isLeftSwipe && !isRightSwipe && onSwipedUp) {
      onSwipedUp()
    }

    if (isDownSwipe && !isLeftSwipe && !isRightSwipe && onSwipedDown) {
      onSwipedDown()
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
