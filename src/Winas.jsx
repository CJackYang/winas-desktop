import i18n from 'i18n'
import React from 'react'
import { ipcRenderer } from 'electron'
import { Snackbar } from 'material-ui'
import getMuiTheme from 'material-ui/styles/getMuiTheme'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'

import Login from './login/Login'
import Account from './control/Account'
import Navigation from './nav/Navigation'
import CloudApis from './common/CloudApis'
import Clipboard from './control/clipboard'

const defaultTheme = getMuiTheme({
  fontFamily: 'Roboto, Noto Sans SC, Microsoft YaHei, PingFang SC, sans-serif',
  color: 'rgba(0,0,0,.76)',
  fontSize: 14,
  overlay: { backgroundColor: 'rgba(0,0,0,.19)' },
  ripple: { color: 'rgba(0,0,0,.38)' },
  menuItem: { hoverColor: 'rgba(0,0,0,.05)' },
  palette: { primary1Color: '#009688', accent1Color: '#ff4081' }
})

console.log('defaultTheme', defaultTheme)

class Winas extends React.Component {
  constructor () {
    super()

    this.state = {
      ipcRenderer,
      snackBar: '',
      theme: defaultTheme,
      view: 'login',
      jump: null,
      account: null,
      cloud: new CloudApis(),
      forceUpdate: false,
      clipboard: new Clipboard(),
      logout: this.logout.bind(this),
      wisnucLogin: this.wisnucLogin.bind(this),
      setPalette: this.setPalette.bind(this),
      deviceLogin: this.deviceLogin.bind(this),
      deviceLogout: this.deviceLogout.bind(this),
      openSnackBar: this.openSnackBar.bind(this),
      jumpToLANLogin: this.jumpToLANLogin.bind(this),
      jumpToBindDevice: this.jumpToBindDevice.bind(this),
      clearForceUpdate: this.clearForceUpdate.bind(this)
    }
  }

  setPalette (primary1Color, accent1Color) {
    this.setState({
      theme: getMuiTheme({
        fontFamily: 'Roboto, Noto Sans SC, Microsoft YaHei, PingFang SC, sans-serif',
        color: 'rgba(0,0,0,.76)',
        fontSize: 14,
        overlay: { backgroundColor: 'rgba(0,0,0,.05)' },
        ripple: { color: 'rgba(0,0,0,.38)' },
        menuItem: { hoverColor: 'rgba(0,0,0,.05)' },
        palette: { primary1Color, accent1Color }
      })
    })
  }

  clearForceUpdate () {
    this.setState({ forceUpdate: false })
  }

  wisnucLogin (user) {
    this.setState({ account: user })
    /* save cloud login data */
    if (user && user.cloud) setTimeout(() => ipcRenderer.send('SETCONFIG', { cloud: user.cloud }), 450)
  }

  deviceLogin ({ dev, user, selectedDevice, isCloud }) {
    console.log(dev, user, selectedDevice, isCloud)
    if (this.state.selectedDevice) {
      ipcRenderer.send('LOGOUT')
      this.setState({ view: '', selectedDevice: null, jump: null }, () => this.deviceLogin({ dev, user, selectedDevice, isCloud }))
    } else {
      ipcRenderer.send('LOGIN', { device: dev, user, isCloud })
      this.selectedDevice = selectedDevice
      this.selectedDevice.on('updated', (prev, next) => this.setState({ selectedDevice: next }))
      this.setState({ view: 'device', selectedDevice: dev, jump: null, isCloud })
    }
  }

  deviceLogout () {
    ipcRenderer.send('LOGOUT')
    if (this.selectedDevice) {
      this.selectedDevice.removeAllListeners('updated')
      this.selectedDevice = null
    }
    this.setState({
      view: 'login',
      selectedDevice: null,
      jump: { status: 'changeDevice' }
      // TODO: handle list in changeDevice
      // jump: { status: 'changeDevice', list: this.state.list }
    })
  }

  logout () {
    ipcRenderer.send('LOGOUT')
    if (this.selectedDevice) {
      this.selectedDevice.removeAllListeners('updated')
      this.selectedDevice = null
    }
    this.setState({ account: null, view: 'login', cloud: new CloudApis(), jump: null, selectedDevice: null })
  }

  jumpToBindDevice () {
    this.setState({ view: 'login', selectedDevice: null, jump: { status: 'deviceSelect', type: 'LANTOBIND' } })
  }

  jumpToLANLogin (dev) {
    this.setState({
      view: 'login',
      selectedDevice: null,
      jump: { selectedDevice: dev, status: 'LANLogin' },
      account: { lan: true, name: i18n.__('Account Offline') }
    })
  }

  openSnackBar (message) {
    this.setState({ snackBar: message })
  }

  renderSnackBar () {
    return (
      <Snackbar
        bodyStyle={{
          marginBottom: 20,
          height: 40,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent'
        }}
        contentStyle={{
          padding: '0 30px',
          borderRadius: 4,
          fontSize: 12,
          color: '#FFF',
          backgroundColor: 'rgba(0,0,0,.8)',
          boxShadow: '0px 4px 8px 0 rgba(23,99,207,.1)'
        }}
        open={!!this.state.snackBar}
        message={this.state.snackBar}
        autoHideDuration={4000}
        onRequestClose={() => this.setState({ snackBar: '' })}
      />
    )
  }

  render () {
    const view = this.state.view === 'login' ? <Login {...this.state} />
      : this.state.view === 'device' ? <Navigation {...this.state} /> : <div />

    const nodrag = { position: 'absolute', top: 0, WebkitAppRegion: 'no-drag' }
    const isSmall = this.state.view === 'login'

    return (
      <MuiThemeProvider muiTheme={this.state.theme}>
        <div
          className="flexCenter"
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'transparent' }}
        >
          {/* login or device */}
          <div
            style={{
              position: 'relative',
              width: isSmall ? 450 : '100%',
              height: isSmall ? 500 : '100%',
              overflow: 'hidden',
              backgroundColor: '#FFF'
            }}
          >
            { view }
            {/* No WebkitAppRegion */}
            <div style={Object.assign({ left: 0, height: 5, width: '100%' }, nodrag)} />
            <div style={Object.assign({ left: 0, height: 110, width: 5 }, nodrag)} />
            <div style={Object.assign({ right: 0, height: 110, width: 5 }, nodrag)} />

            {/* Account */}
            {
              this.state.account && this.state.view === 'device' &&
                <div style={{ position: 'absolute', top: 2, right: 100, height: 34, WebkitAppRegion: 'no-drag' }}>
                  <Account
                    cloud={this.state.cloud}
                    account={this.state.account}
                    logout={() => this.logout()}
                    device={this.state.selectedDevice}
                    openSnackBar={msg => this.openSnackBar(msg)}
                    wisnucLogin={user => this.wisnucLogin(user)}
                  />
                </div>
            }

          </div>

          {/* snackBar */}
          { this.renderSnackBar() }

          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 100001,
              overflow: 'hidden',
              pointerEvents: 'none',
              boxSizing: 'border-box',
              border: '1px solid #eeeeee'
            }}
          />
        </div>
      </MuiThemeProvider>
    )
  }
}

export default Winas
