import i18n from 'i18n'
import React from 'react'
import Promise from 'bluebird'
import { AutoSizer } from 'react-virtualized'
import { MenuItem, FlatButton } from 'material-ui'
import Device from '../login/Device'
import ScrollBar from '../common/ScrollBar'
import { LIButton } from '../common/Buttons'
import ConfirmDialog from '../common/ConfirmDialog'
import { CloseIcon, RefreshIcon } from '../common/Svg'
import CircularLoading from '../common/CircularLoading'

class ChangeDevice extends React.Component {
  /**
   * @param {object} props
   * @param  {function} props.back - close dialog.
   * @param  {object} props.cloud - cloud api.
   * @param  {function} props.cloud.req - cloud requests.
   * @param  {object} props.selectedDevice - current logged device.
   *
   */
  constructor (props) {
    super(props)

    this.state = {
      loading: true,
      list: [],
      failed: false,
      error: null
    }

    this.reqList = () => {
      this.setState({
        loading: true,
        error: null,
        failed: false,
        loggingDevice: null
      })

      this.props.cloud.req('stationList', null, (err, res) => {
        console.log(err, res)
        if (err) {
          this.setState({ list: [], loading: false, error: err })
        } else {
          const list = [...res.ownStations, ...res.sharedStations]
          this.setState({ list, loading: false })
        }
      })
    }
  }

  async remoteLoginAsync (device, forceCloud) {
    const { account } = this.props
    const args = { deviceSN: device.sn }
    const { token, cookie } = this.props.cloud
    const [tokenRes, users, space, isLAN] = await Promise.all([
      this.props.cloud.reqAsync('LANToken', args),
      this.props.cloud.reqAsync('localUsers', args),
      this.props.cloud.reqAsync('space', args),
      this.props.cloud.testLANAsync(device.LANIP),
      Promise.delay(2000)
    ])

    const LANToken = tokenRes.token
    const user = Array.isArray(users) && users.find(u => u.winasUserId === account.winasUserId)

    if (!LANToken || !user) throw Error('get LANToken or user error')
    Object.assign(user, { cookie })
    const currentToken = (isLAN && !forceCloud) ? LANToken : token
    return ({ dev: device, user, token: currentToken, space, isCloud: forceCloud || !isLAN })
  }

  /**
   *  select device to login
   * @param {object} cdev device info from cloud
   * @param {bool} forceCloud force connecting via cloud
   */
  selectDevice (cdev, forceCloud) {
    console.log(cdev, this.props.cloud)
    this.setState({ loggingDevice: cdev, list: [cdev], failed: false })
    this.remoteLoginAsync(cdev, forceCloud)
      .then(({ dev, user, token, space, isCloud }) => {
        /* onSuccess: auto login */
        Object.assign(dev, {
          token: { isFulfilled: () => true, ctx: user, data: { token } },
          mdev: { deviceSN: dev.sn, address: dev.LANIP },
          space,
          // add fake listeners, TODO: remove this
          on: () => {},
          removeAllListeners: () => {}
        })
        this.props.deviceLogin({
          dev,
          user,
          selectedDevice: dev,
          isCloud
        })
        this.props.cloud.req('setLastSN', { sn: dev.sn })
      })
      .catch((error) => {
        console.error('this.getLANToken', error)
        this.setState({ loggingDevice: null, failed: true })
      })
  }

  renderRow ({ style, key, device }) {
    const isCurrent = this.props.selectedDevice && this.props.selectedDevice.mdev.deviceSN === device.sn
    const isLoading = !!this.state.loggingDevice
    return (
      <div style={style} key={key}>
        <div style={{ position: 'relative' }}>
          <MenuItem onClick={() => this.selectDevice(device)} disabled={isCurrent || isLoading} >
            <Device {...this.props} cdev={device} slDevice={this.slDevice} type={'CHANGEDEVICE'} />
          </MenuItem>
          <div style={{ position: 'absolute', right: isLoading ? 32 : 16, top: isLoading ? 32 : 22 }}>
            {/* retry connecting to device */}
            {
              isLoading
                ? <CircularLoading />
                : isCurrent
                  ? (
                    <FlatButton
                      primary
                      onClick={() => this.selectDevice(this.props.selectedDevice)}
                    >
                      {i18n.__('Retry to Connect')}
                    </FlatButton>
                  ) : ''
            }
          </div>
        </div>
      </div>
    )
  }

  renderList (list) {
    const rowCount = list.length
    const rowHeight = 80
    return (
      <div style={{ width: 450, height: 240 }}>
        <AutoSizer>
          {({ height, width }) => (
            <ScrollBar
              allHeight={rowHeight * rowCount}
              height={height}
              width={width}
              rowHeight={rowHeight}
              rowRenderer={({ style, key, index }) => this.renderRow({ style, key, device: list[index] })}
              rowCount={rowCount}
              overscanRowCount={3}
              style={{ outline: 'none' }}
            />
          )}
        </AutoSizer>
      </div>
    )
  }

  componentDidMount () {
    this.reqList()
  }

  renderFailed (error) {
    const isUnauthorized = error && error.status === 401
    return (
      <div style={{ width: '100%', height: 200 }} className="flexCenter" >
        {i18n.__('Error in Base Text')}
        {/* show dialog when token expired */}
        <ConfirmDialog
          open={isUnauthorized}
          onConfirm={() => this.props.logout()}
          title={i18n.__('Token Expired')}
          text={i18n.__('Token Expired Text')}
        />
      </div>
    )
  }

  render () {
    return (
      <div style={{ width: 450, height: 390, zIndex: 100, position: 'relative', backgroundColor: 'white' }} >
        <div style={{ height: 64, display: 'flex', alignItems: 'center' }}>
          {/* close */}
          {
            !this.state.loggingDevice &&
            <LIButton tooltip={i18n.__('Close')} style={{ marginLeft: 12 }} onClick={() => this.props.back(this.state.dev)}>
              <CloseIcon />
            </LIButton>
          }
          <div style={{ flex: 1 }} />
          {/* refresh */}
          {
            !this.state.loggingDevice &&
            <LIButton tooltip={i18n.__('Refresh')} style={{ marginRight: 12 }} onClick={() => this.reqList()}>
              <RefreshIcon />
            </LIButton>
          }
        </div>

        <div style={{ fontSize: 28, display: 'flex', alignItems: 'center', paddingLeft: 80, marginBottom: 36 }} >
          { this.state.loggingDevice ? i18n.__('Connecting to Device') : this.state.failed ? i18n.__('ErrorText: Connect Failed')
            : i18n.__('Change Device Title') }
        </div>

        {
          this.state.loading
            ? (
              <div style={{ height: 128 }} className="flexCenter">
                <CircularLoading />
              </div>
            ) : this.state.error
              ? this.renderFailed(this.state.error)
              : this.renderList(this.state.list)
        }
      </div>
    )
  }
}

export default ChangeDevice
