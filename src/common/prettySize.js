import i18n from 'i18n'

const prettySize = (size) => {
  const s = parseFloat(size, 10)
  if (!s || s < 0) return `0 ${i18n.__('Bytes')}`
  if (s === 1) return `1 ${i18n.__('Bytes')}`
  if (s < 1024) return `${s} ${i18n.__('Bytes')}`
  else if (s < (1024 * 1024)) return `${(s / 1024).toFixed(2)} KB`
  else if (s < (1024 * 1024 * 1024)) return `${(s / 1024 / 1024).toFixed(2)} MB`
  return `${(s / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default prettySize
