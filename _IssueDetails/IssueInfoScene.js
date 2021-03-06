'use strict';

// REACT PARTS
var Display = require('react-native-device-display');
var React = require("react-native");
var Reflux = require("reflux");
var TimerMixin = require('react-timer-mixin');

// COMPONENTS
var ActionButtons = require("../Comps/ActionButtons");
var LineSeparator = require("../Comps/LineSeparator");
var NextStatuses = require("./NextStatuses");
var Pending = require("../Comps/Pending");
var IssueImages = require("../Comps/IssueImages");
var Site = require("../Comps/Site");
var StatusEntry = require("../Comps/StatusEntry");

// ACTIONS && STORES
var MapActions = require("../Actions/MapActions");
var IssueActions = require("../Actions/IssueActions");
var UserActions = require("../Actions/UserActions");

// MIXINS
var LocationMixin = require("../Mixins/Location");
var IssueMixin = require("../Mixins/Issue");
var SiteMixin = require("../Mixins/Site");
var ViewMixin = require("../Mixins/View");

// Utilities
var _ = require("lodash");
var Moment = require("moment");

var {
	AlertIOS,
	MapView,
	Modal,
	PropTypes,
	ScrollView,
	StyleSheet,
	SwitchIOS,
	Text,
	TextInput,
	TouchableHighlight,
	View
} = React;

var styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	main: {
		flex: 1,
	},
});

var IssueInfoScene = React.createClass({
	mixins: [Reflux.ListenerMixin, TimerMixin, IssueMixin, LocationMixin, SiteMixin, ViewMixin],
	propTypes: {
		currentUser: PropTypes.object,
		currentSiteRight: PropTypes.object,
		dims: PropTypes.object,
		lookups: PropTypes.object,
		nav: PropTypes.object,
		openMap: PropTypes.func,
		issue: PropTypes.object,
		site: PropTypes.object,
		themeColor: PropTypes.string,
		users: PropTypes.object
	},
	_setStatusNote: "",
	_styles: StyleSheet.create({
		main: {
			flexDirection: "column",
		},
		actionButtons: {
			alignItems: "center",
			bottom: 0,
			flexDirection: "row",
			height: ViewMixin.Dimensions.ACTION_BTN_HEIGHT,
			position: "absolute",
			width: Display.width
		},
	  mapSection: {
	  	borderWidth: 1.25,
	  	flex: 1
	  },
	  primaryInfo: {
			flex: 1,
			flexDirection: "column"
		},
		settingStatus: {
			height: Display.height,
      justifyContent: "center",
      width: Display.width
		},
		section: {
			flex: 1,
			flexDirection: "column",
			marginHorizontal: 2,
			marginVertical: 4
		},
			sectionTitle: {
				fontFamily: "System",
				fontSize: 32,
				fontWeight: "200"
			},
		site: {
			borderColor: "#A4A4A4",
			borderWidth: 0.5,
			flex: 1,
			flexDirection: "row",
			padding: 4
		}
	}),
	_timer: null,
	_workflowMessages: {
		"save": ["Waiting to Save", "Trying to Save...", "Site Information saved!", "Error: Couldn\'t save"]
	},

	getInitialState: function() {
		return {
			mapParams: null,
			issue: null,
			needsMet: false,
			showMap: false,
			workflowStages: [
      	{
          isActive: true,
          end: false,
          success: true
        }, {
          isActive: false,
          end: false,
          success: true
        }, {
          isActive: false,
          end: true,
          success: true
        }, {
          isActive: false,
          end: true,
          success: false
        }
      ]
		};
	},

	componentWillMount: function() {
		let state = _.cloneDeep(this.state);
		_.assign(state, this._refreshIssue(this.props));
		_.assign(state, this._refreshMap(this.props));
		this.setState(state);
	},

	componentDidMount: function() {
		// a temporary solution to resolve FPS issue w/ Map rendering (advised by Brent Vatne of Facebook)
		this._timer = this.setTimeout(() => {
      this.setState({ showMap: true });
    }, 400);
	},

	componentWillUpdate: function(newProps, newState) {
		let oldProps = this.props, oldState = this.state, updatedState = _.cloneDeep(newState);

		if ( !_.isEqual(newProps.issue.geoPoint, oldState.issue.geoPoint) )
			_.assign(updatedState, this._refreshMap(newProps));

		if ( !_.isEqual(newProps.currentUser, oldProps.currentUser) || !_.isEqual(newProps.currentSiteRight, oldProps.currentSiteRight) )
			_.assign(updatedState, this._refreshIssue(newProps));

		if ( !_.isEqual(newProps.issue, oldState.issue) )
			_.assign(updatedState, this._refreshIssue(newProps));

		if ( !_.isEqual(updatedState, newState) )
			this.setState(updatedState);
	},

	componentWillUnmount: function() {
		this.clearTimeout(this._timer);
	},

	// _moveInput: function(targetRef, offset) {
 //    let scrollResponder = this.refs.scrollView.getScrollResponder();
 //    let nodeHandle = React.findNodeHandle(targetRef);
 //    scrollResponder.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, offset);
 //  },

	_refreshMap: function(newProps) {
		let geoPoints = new Array(newProps.issue.geoPoint)
			, mapParams = this.getMapParams(geoPoints, newProps.dims);
		
		_.assign(mapParams, {
			"annotations": [{
				latitude: newProps.issue.geoPoint.lat,
				longitude: newProps.issue.geoPoint.long,
				hasLeftCallout: false,
			}]
		});
	
		/********************************************************************
			!!!!!!!! NEED TO SOURCE ChosenState FROM USER SETTINGS !!!!!!!!!
		********************************************************************/

		return {
			mapParams: mapParams,
			needsMet: true
		};
	},

	_refreshIssue: function(props) {
		return { issue: _.cloneDeep(props.issue) };
	},

	_setWorkflowStage: function(workflow, level) {
    this._currentWorkflow = workflow;
    let workflowStages = _.map(this.state.workflowStages, (stage) => {
      stage.isActive = false;
      return stage;
    });

    let dataChanged = this.state.dataChanged;
    
    workflowStages[level].isActive = true;
    if (workflowStages[level].end)
    	dataChanged = false;
    
    this.setState({ 
    	dataChanged: dataChanged,
    	workflowStages: workflowStages
    });
  },

	render: function() {
		let props = this.props, state = this.state
			, dims = props.dims
			, mapParams = state.mapParams
			, imgHost = props.lookups.hosts.img.provider
			, issue = state.issue
			, themeColor = props.themeColor
	  	, imgUris = _.pluck(issue.images, "uri")
	  	, MapSection = state.showMap && mapParams
		  	? <MapView
		  			annotations={mapParams.annotations}
		  			region={mapParams.region}
		  			rotateEnabled={false}
		  			scrollEnabled={false}
		  			style={{height: dims.width / this.AspectRatios["21x9"], width: dims.width}}
						zoomEnabled={false}>
					</MapView>
				: null;
		
		let statusEntryStyle = StyleSheet.create({
			main: {
				backgroundColor: themeColor,
				flexDirection: "row",
				alignItems: "center"
			},
			info: {
				flex: 1,
				flexDirection: "row",
				height: this.Dimensions.ACTION_BTN_HEIGHT,
				paddingHorizontal: 8
			},
			status: {
				alignSelf: "center",
				color: "#FFFFFF",
				fontSize: 26,
				fontFamily: "System",
				letterSpacing: 1
			}
		});

		let lastStatusEntry = _.last(issue.statusEntries);
		let viewHeight = Display.height - this.getInnerView() - this.Dimensions.ACTION_BTN_HEIGHT

		return (
			<View style={ [this._styles.main] }>				
		   	<ScrollView
		   		contentInset={{top: -(this.Dimensions.STATUS_BAR_HEIGHT)}}
		   		keyboardShouldPersistTaps={false}
		   		ref="scrollView"
	        scrollEventThrottle={200}
	        style={{height: viewHeight}}>
					<View style={this._styles.primaryInfo}>
						<IssueImages
			   			aspectRatio={16/10}
			   			imgHost={imgHost}
							uris={imgUris} />
						<LineSeparator vertMargin={4} height={0} />
						<TouchableHighlight
							underlayColor="#A4A4A4"
							onPress={() => props.openMap(themeColor)}>
							<View style={{borderColor: themeColor}}>
					  		{MapSection}
							</View>
						</TouchableHighlight>
						<LineSeparator vertMargin={4} height={0} />
						<Site
							info={props.site}
							imgHost={imgHost.url}
							showImg={true}
							showPhoneBtn={true}
							style={this._styles.site}
							themeColor={themeColor} />
					</View>
				</ScrollView>
				<LineSeparator color="#FFFFFF" height={0.5} horzMargin={0} vertMargin={0} />
				<StatusEntry
					currentUser={props.currentUser}
        	currentSiteRight={props.currentSiteRight}
					lookups={props.lookups}
					issue={issue}
					show={{status: true, update: true}}
					site={props.site}
					statusEntry={lastStatusEntry}
					styles={statusEntryStyle}
					themeColor={themeColor}
					user={props.users[lastStatusEntry.authorId]} />
			</View>
		);
		// return (<View><Text>testing</Text></View>)
	}
});

module.exports = IssueInfoScene;