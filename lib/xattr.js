const os = require('os')
const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('original-fs')) // eslint-disable-line

const xattr = Promise.promisifyAll(os.platform() === 'win32' ? require('fs-ads') : require('fs-xattr')) // eslint-disable-line

const HASH = 'user.winas.hash'
const BACKUP = 'user.winas.backup'

const readXattrAsync = async (target) => {
  let attr
  try {
    attr = JSON.parse(await xattr.getAsync(target, HASH))
  } catch (e) {
    /* may throw xattr ENOENT or JSON SyntaxError */
    if (e && !['ENOENT', 'ENODATA'].includes(e.code)) console.error('readXattrAsync error: ', e.code || e)
  }
  const stats = await fs.lstatAsync(target)
  const htime = stats.mtime.getTime()
  if (attr && attr.htime && attr.htime === htime && attr.size === stats.size) return attr
  return null
}

const readXattr = (target, callback) => {
  readXattrAsync(target).then(attr => callback(null, attr)).catch(error => callback(error))
}

const setXattrAsync = async (target, attr) => {
  const stats = await fs.lstatAsync(target)
  const htime = Math.round(stats.mtime.getTime() / 1000) * 1000
  const size = stats.size
  const newAttr = Object.assign({}, attr, { htime, size })
  try {
    await xattr.setAsync(target, HASH, JSON.stringify(newAttr))
    await fs.utimesAsync(target, stats.atime, new Date(htime))
  } catch (e) {
    console.error(target, 'setXattrAsync error: ', e.code || e)
  }
  return newAttr
}

const setXattr = (target, attr, callback) => {
  setXattrAsync(target, attr).then(na => callback(null, na)).catch(error => callback(error))
}

// target: target entry path
// dirUUID: backup directory uuid
const setBackupFlagAsync = async (target, dirUUID) => {
  const stats = await fs.lstatAsync(target)
  const mtime = Math.round(stats.mtime.getTime() / 1000) * 1000
  const birthtime = stats.birthtime.getTime()
  const newAttr = { mtime, birthtime, dirUUID, target }
  console.log('newAttr', newAttr)
  try {
    await xattr.setAsync(target, BACKUP, JSON.stringify(newAttr))
    await fs.utimesAsync(target, stats.atime, new Date(mtime))
  } catch (e) {
    console.error(target, 'setXattrAsync error: ', e.code || e)
  }
  return newAttr
}

const setBackupFlag = (target, dirUUID, callback) => {
  setBackupFlagAsync(target, dirUUID).then(na => callback(null, na)).catch(error => callback(error))
}

// target: target entry path
// dirUUID: backup directory uuid
const checkBackupFlagAsync = async (target, dirUUID) => {
  let attr
  try {
    attr = JSON.parse(await xattr.getAsync(target, BACKUP))
  } catch (e) {
    /* may throw xattr ENOENT or JSON SyntaxError */
    if (e && !['ENOENT', 'ENODATA'].includes(e.code)) console.error('readXattrAsync error: ', e.code || e)
  }
  let stats
  try {
    stats = await fs.lstatAsync(target)
  } catch (error) {
    return false
  }

  const mtime = stats.mtime.getTime()
  const birthtime = stats.birthtime.getTime()
  console.log('checkBackupFlagAsync', attr, stats, mtime, birthtime)
  if (attr && attr.mtime === mtime && attr.birthtime === birthtime &&
     attr.dirUUID === dirUUID && attr.target === target) {
    return true
  }

  return false
}

const checkBackupFlag = (target, dirUUID, callback) => {
  checkBackupFlagAsync(target, dirUUID).then(value => callback(null, value)).catch(error => callback(error))
}

module.exports = {
  readXattrAsync,
  readXattr,
  setXattrAsync,
  setXattr,
  setBackupFlag,
  setBackupFlagAsync,
  checkBackupFlagAsync,
  checkBackupFlag
}
