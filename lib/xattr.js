const os = require('os')
const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('original-fs')) // eslint-disable-line

const xattr = Promise.promisifyAll(os.platform() === 'win32' ? require('fs-ads') : require('fs-xattr')) // eslint-disable-line

const HASH = 'user.winas.hash'
const BACKUP = 'user.winas.backup'

const readXattrAsync = async (target) => {
  try {
    const attr = JSON.parse(await xattr.getAsync(target, HASH))
    const stats = await fs.lstatAsync(target)
    const htime = stats.mtime.getTime()
    if (attr && attr.htime && attr.htime === htime && attr.size === stats.size) {
      return attr
    }
  } catch (e) {
    console.error(target, 'readXattrAsync error: ', e.code || e)
  }
  return null
}

const readXattr = (target, callback) => {
  readXattrAsync(target).then(attr => callback(null, attr)).catch(error => callback(error))
}

const setXattrAsync = async (target, attr) => {
  let newAttr = attr
  try {
    const stats = await fs.lstatAsync(target)
    const htime = Math.round(stats.mtime.getTime() / 1000) * 1000
    const size = stats.size
    newAttr = Object.assign({}, attr, { htime, size })
    await xattr.setAsync(target, HASH, JSON.stringify(newAttr))
    await fs.utimesAsync(target, stats.atime, new Date(htime))
  } catch (e) {
    console.error(target, 'setXattrAsync error: ', e.code || e)
    newAttr = attr
  }
  return newAttr
}

const setXattr = (target, attr, callback) => {
  setXattrAsync(target, attr).then(na => callback(null, na)).catch(error => callback(error))
}

// target: target entry path
// dirUUID: backup directory uuid
const setBackupFlagAsync = async (target, dirUUID) => {
  try {
    const stats = await fs.lstatAsync(target)
    const mtime = Math.round(stats.mtime.getTime() / 1000) * 1000
    const birthtime = stats.birthtime.getTime()
    const newAttr = { mtime, birthtime, dirUUID, target }
    await xattr.setAsync(target, BACKUP, JSON.stringify(newAttr))
    await fs.utimesAsync(target, stats.atime, new Date(mtime))
  } catch (e) {
    console.error(target, 'setBackupFlagAsync error: ', e.code || e)
  }
}

const setBackupFlag = (target, dirUUID, callback) => {
  setBackupFlagAsync(target, dirUUID).then(na => callback(null, na)).catch(error => callback(error))
}

// target: target entry path
// dirUUID: backup directory uuid
const checkBackupFlagAsync = async (target, dirUUID) => {
  try {
    const attr = JSON.parse(await xattr.getAsync(target, BACKUP))
    const stats = await fs.lstatAsync(target)
    const mtime = stats.mtime.getTime()
    if (attr && attr.mtime === mtime && attr.dirUUID === dirUUID && attr.target === target) {
      return true
    }
  } catch (e) {
    console.error(target, 'checkBackupFlagAsync error: ', e.code || e)
  }
  return false
}

const checkBackupFlag = (target, dirUUID, callback) => {
  checkBackupFlagAsync(target, dirUUID).then(value => callback(null, value)).catch(error => callback(error))
}

const clearXattrAsync = async (target) => {
  try {
    const stats = await fs.lstatAsync(target)
    const mtime = Math.round(stats.mtime.getTime() / 1000) * 1000
    await xattr.setAsync(target, BACKUP, JSON.stringify({}))
    await xattr.setAsync(target, HASH, JSON.stringify({}))
    await fs.utimesAsync(target, stats.atime, new Date(mtime))
  } catch (e) {
    console.error(target, 'clearXattrAsync error: ', e.code || e)
  }
}

const clearXattr = (target, callback) => {
  clearXattrAsync(target).then(value => callback(null, value)).catch(error => callback(error))
}

module.exports = {
  readXattrAsync,
  readXattr,
  setXattrAsync,
  setXattr,
  setBackupFlag,
  setBackupFlagAsync,
  checkBackupFlagAsync,
  checkBackupFlag,
  clearXattr,
  clearXattrAsync
}
