import React from 'react'

export class BreadCrumbItem extends React.PureComponent {
  constructor (props) {
    super(props)
    this.state = { hover: false, isDrop: false }
    this.onMouseMove = () => {
      if (this.state.hover) return

      /* not in '...' */
      if (this.props.text !== '...') this.props.onHoverHeader(this.props.node)
      this.setState({ hover: true, isDrop: this.props.isDrop(), dropable: !!this.props.dropable() })
    }

    this.onMouseLeave = () => {
      this.props.onHoverHeader(null)
      this.setState({ hover: false, isDrop: false, dropable: false })
    }
  }
  render () {
    const { text, onClick, last } = this.props

    return (
      <div
        style={{
          cursor: 'pointer',
          borderRadius: 4, // mimic a flat button
          height: 40,
          paddingLeft: 2,
          paddingRight: 2,
          fontSize: 18,
          color: this.state.hover ? '#000000' : last ? 'rgba(0,0,0,.76)' : 'rgba(0,0,0,.54)',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: this.state.hover ? 'rgba(207,216,220,.26)' : 'transparent'
        }}
        onClick={onClick}
        onMouseMove={this.onMouseMove}
        onMouseLeave={this.onMouseLeave}
      >
        <div style={{ maxWidth: 144, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} >
          { text }
        </div>
      </div>
    )
  }
}

export class BreadCrumbSeparator extends React.PureComponent {
  render () {
    return (
      <div
        style={{
          height: 24,
          width: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(0,0,0,.54)'
        }}
      >
        { '>' }
      </div>
    )
  }
}
