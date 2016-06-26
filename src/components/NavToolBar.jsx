import React, { Component, PropTypes } from 'react';
import _ from 'lodash';
import moment from 'moment-timezone';
import { observer } from "mobx-react";
import { connect } from 'mobx-connect';
import { browserHistory } from 'react-router';
import ReactGridLayout from 'react-grid-layout';
import * as Colors from 'material-ui/styles/colors';
import FlatButton from 'material-ui/FlatButton';
import NavArrowBack from 'material-ui/svg-icons/navigation/arrow-back';
import Toolbar from 'material-ui/Toolbar/Toolbar';
import ToolbarGroup from 'material-ui/Toolbar/ToolbarGroup';
import ToolbarSeparator from 'material-ui/Toolbar/ToolbarSeparator';
import ToolbarTitle from 'material-ui/Toolbar/ToolbarTitle';

@connect
class NavToolBar extends Component {

  constructor(props, context) {
    super(props, context);

  }

 
  componentWillMount() {
  
  }

  goBack() {
     browserHistory.push(this.props.goBackTo);
  }

  render() {
    return(
      <Toolbar
        style={{flexWrap: "wrap"}}>
        <ToolbarGroup firstChild={true}>
          <FlatButton
            label={this.props.navLabel}
            onClick={((...args)=>this.goBack())}
            icon={<NavArrowBack style={{marginLeft: "2px"}} />}
            style={{marginLeft: "2px"}}
          />
        </ToolbarGroup>
        {this.props.children}
      </Toolbar>
    );
  }
}
export default NavToolBar;