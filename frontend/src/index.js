// web app entrypoint
import React from 'react'
import { createRoot } from 'react-dom/client'
//import ReactDOM from 'react-dom'

import App from './App'

const AUTOFILL_SEL = [
  'input:not([type=password]):not([autocomplete])',
  'input:not([type=password])[autocomplete=on]',
  'textarea:not([autocomplete])',
  'textarea[autocomplete=on]'
].join(', ')
const stampAutocompleteOff = () => {
  document.querySelectorAll(AUTOFILL_SEL).forEach((el) => {
    el.setAttribute('autocomplete', 'off')
  })
}

new MutationObserver(stampAutocompleteOff).observe(document.documentElement, {
  childList: true,
  subtree: true
})

stampAutocompleteOff()

const container = document.getElementById('root')
const root = createRoot(container)
root.render(<App />)

//ReactDOM.render(<App />, document.getElementById('root'))
