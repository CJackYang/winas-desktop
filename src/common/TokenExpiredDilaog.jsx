import i18n from 'i18n'
import React from 'react'
import { ipcRenderer } from 'electron'

import Dialog from '../common/PureDialog'
import FlatButton from '../common/FlatButton'
import CircularLoading from '../common/CircularLoading'

class TokenExpiredDialog extends React.PureComponent {
  /**
   * @param {object} props
   * @param {bool} props.open
   * @param {function} props.onConfirm
   * @param {function} props.onClose
   */
  constructor (props) {
    super(props)
    this.state = { loading: true, closed: false }
    this.handleCheck = () => this.setState({ check: !this.state.check })
    this.onFire = () => {
      this.setState({ fired: true }, () => this.props.onConfirm(this.state.check))
    }
    this.refresh = async () => {
      if (!window.config || !window.config.global) return
      console.log(this.props)
      const refreshToken = window.config.global.cloud && window.config.global.cloud.refreshToken
      const clientId = window.config.machineId
      this.props.cloud.req(
        'refreshToken',
        { refreshToken, clientId },
        (err, res, cookie) => {
          if (err) {
            console.error(err)
            this.setState({
              loading: false,
              expired: true
            })
          } else {
            const { account, isCloud, wisnucLogin } = this.props
            account.cloud.refreshToken = res.refreshToken
            account.cloud.token = res.token
            wisnucLogin(account)
            if (isCloud) {
              ipcRenderer.send('RefreshToken', { newToken: res.token, newCookie: cookie })
            }
            this.setState({ closed: true }, () => this.props.onClose())
          }
        }
      )
    }
  }

  componentDidMount () {
    this.refresh().catch(console.error)
  }

  componentWillReceiveProps (nextProps) {
    if (nextProps.open && !this.props.open) this.setState({ loading: true, closed: false })
  }

  render () {
    const { open } = this.props
    const title = i18n.__('Token Expired')
    const content = i18n.__('Token Expired Text')
    return (
      <Dialog open={open} modal >
        {
          (open && !this.state.closed) && this.state.expired ? (
            <div style={{ width: 320 }} >
              <div style={{ height: 60, display: 'flex', alignItems: 'center', paddingLeft: 20, fontSize: 20 }}>
                { title }
              </div>
              <div style={{ height: 20 }} />
              <div
                style={{
                  width: 280,
                  padding: '0 20px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'rgba(0,0,0,.54)'
                }}
              >
                { content }
              </div>
              <div style={{ height: 20 }} />
              <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <FlatButton
                  primary
                  onClick={this.onFire}
                  disabled={this.state.fired}
                  label={i18n.__('Confirm')}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 16,
                color: 'rgba(0,0,0,.54)'
              }}
              className="flexCenter"
            >
              <div>
                <div className="flexCenter" style={{ padding: 16 }}>
                  <CircularLoading />
                </div>
                { i18n.__('Refreshing Token Text') }
              </div>
            </div>
          )
        }
      </Dialog>
    )
  }
}

export default TokenExpiredDialog
