import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const useAsyncStorage = (key, initialValue) => {
  const [hasLoad, setHasLoad] = useState(false)
  const [data, setData] = useState(initialValue)

  const set = async (newData) => {
    setData(newData)
    return newData === null
      ? AsyncStorage.removeItem(key)
      : AsyncStorage.setItem(key, JSON.stringify(newData))
  }

  useEffect(() => {
    setHasLoad(false)
  }, [key])

  useEffect(() => {
    if (!hasLoad) {
      AsyncStorage.getItem(key).then((res) => {
        if (res === null) {
          AsyncStorage.setItem(key, JSON.stringify(data))
          setData(data)
        } else {
          setData(JSON.parse(res))
        }
        setHasLoad(true)
      })
    }
  }, [key, hasLoad, data])

  return [data, set]
}

export default useAsyncStorage
