
const isMacOS = process.platform === 'darwin'
const isIgnoreFile = (fileName) => {
  // .DS_Store
  if (isMacOS && fileName === '.DS_Store') {
    return true
  }
  // tmp file of img
  if (isMacOS && fileName.startsWith('._')) {
    return true
  }
  // tmp file of MS Office
  if (fileName.startsWith('~$')) {
    return true
  }
  return false
}

module.exports = { isIgnoreFile }
