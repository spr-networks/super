// Keep state written by native text inputs as a string, including when a
// clearing event arrives without a text value.
export const normalizeTextInput = (value) =>
  typeof value === 'string' ? value : ''
