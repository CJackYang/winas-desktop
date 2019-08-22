const { powerSaveBlocker } = require('electron')

// The power save blocker id returned by powerSaveBlocker.start
let id = 1
let transfering = false
let backuping = false

// type: trans' or 'backup'
const startPowerSaveBlocker = (type) => {
  if (type === 'trans') {
    transfering = true
  } else if (type === 'backup') {
    backuping = true
  }

  if (!powerSaveBlocker.isStarted(id)) {
    id = powerSaveBlocker.start('prevent-app-suspension')
  }
}

const stopPowerSaveBlocker = (type) => {
  if (type === 'trans') {
    transfering = false
  } else if (type === 'backup') {
    backuping = false
  }

  // check if backuping or transfering
  if (backuping || transfering) return

  if (powerSaveBlocker.isStarted(id)) {
    powerSaveBlocker.stop(id)
  }
}

module.exports = { startPowerSaveBlocker, stopPowerSaveBlocker }
