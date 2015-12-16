'use strict'

var Reflux = require("reflux");
var Storage = require('react-native-store');

// STORES && ACTIONS
var HostActions = require("../Actions/HostActions");
var HostStore = require("./HostStore");
var LookupActions = require("../Actions/LookupActions");
var ProfileActions = require("../Actions/ProfileActions");
var IssueActions = require("../Actions/IssueActions");
var SiteActions = require("../Actions/SiteActions");
var UserActions = require("../Actions/UserActions");

// UTILITIES
var _ = require("lodash");

var ProfileStore = Reflux.createStore({
	_currentSiteRight: null,
	_currentUser: null,
	_db: null,
	_dbRefs: [],
	_storageKey: "auth",
	listenables: [ProfileActions],

	init: function() {
		this.listenTo(HostStore, this._updateDb, this._updateDb);
	},

	getInitialState: function() {
		return {
			currentSiteRight: this._currentSiteRight,
			currentUser: this._currentUser
		}
	},

	onChangePwd: function(email, oldPwd, newPwd) {
		this._db.changePassword({
		  email: email,
		  oldPassword: oldPwd,
		  newPassword: newPwd
		}, function(error) {
		  if (error) {
		    switch (error.code) {
		      case "INVALID_PASSWORD":
		        console.log("Wrong password, buddy");
		        break;
		      case "INVALID_USER":
		        console.log("Apparently you don't exist");
		        break;
		      default:
		        console.log("Error changing password:", error);
		    }
		  } else {
		    console.log("User password changed successfully!");
		  }
		});
	},

	onGetLocalAuth: function() {
		Storage.model(this._db.app).then((model) => {
			let filter = { where: { "key": this._storageKey} };
      
      model.find(filter).then((authRow) => {
				if ( !_.isEmpty(authRow) ) {
	      	let results = authRow[0].data;
	      	
	      	if (!results)
	      		ProfileActions.getLocalAuth.failed();	
			  	else {
			  		let authData = JSON.parse(results);
			  		ProfileActions.getLocalAuth.completed(authData);
			  	}
			  }

			  ProfileActions.getLocalAuth.failed();
			});
		}).catch((err) => {
			console.log("A table for your app does not exist: ", this._db.app);
			ProfileActions.getLocalAuth.failed();
		});
	},

	onRemoveIssueId: function(userId) {
		let userStateRef = this._db.child(userId).child("state").child("issueId");

		userStateRef.set("", (err) => {
			if (err)
				ProfileActions.removeIssueId.failed(err);
			else {
				ProfileActions.removeIssueId.completed();
			}
		});
	},

	onSetCurrentUser: function(authData) {
				let uid = authData.uid
			, userRef = this._db.orderByChild("uid").equalTo(uid);
		
		this._dbRefs.push(userRef);

		Storage.model(this._db.app).then((model) => {
			let filter = { where : { key : this._storageKey } };
			
			model.find(filter).then((authRow) => {
				let authObj = {
		      "data": JSON.stringify(authData),
		      "key": this._storageKey,
		    }

			  model[_.isEmpty(authRow) ? "add" : "update"](authObj);
			});
		});

		userRef.once("value", (result) => {
			let users = _.toArray(result.val())
				 , user = (users.length > 0) ? _.first(users) : null;
			this._setProfile(user);

			ProfileActions.setCurrentUser.completed();
			userRef.on("child_changed", (result) => {
				let user = result.val();
				this._setProfile(user);
			}, (err) => {
				console.log(err);
				return err;
			});
		}, (err) => {
			console.log(err);
			return err;
		});
		
		// return userRef;
	},

	onSetFilter: function(states) {
		let params = "settings/filters/statuses/states";
		this._currentUser.settings.filters.statuses.states = states;
		this.trigger({
			currentUser: this._currentUser,
			currentSiteRight: this._currentSiteRight
		});

		let dbRef = this._db.child(this._currentUser.iid).child(params);
		
		dbRef.update(states, (err) => {
			if (err)
				ProfileActions.setFilter.failed();
			else
				ProfileActions.setFilter.completed();
		});
	},

	onSetIssueId: function(issueId, userId) {
		let userStateRef = this._db.child(userId).child("state").child("issueId");

		userStateRef.set(issueId, (err) => {
			if (err)
				ProfileActions.setIssueId.failed(err);
			else
				ProfileActions.setIssueId.completed();
		});
	},

	onSetChosenSiteRight: function(siteRight) {
		let userId = this._currentUser.iid;
		let userRef = this._db.child(userId);

		userRef.child("settings").child("chosen").update({"siteId": siteRight.siteId}, (err) => {
			if (err)
				ProfileActions.setChosenSiteRight.failed(err);
			else
				ProfileActions.setChosenSiteRight.completed();
		});
	},

	onLogoutUser: function() {
		this._db.unauth();

		Storage.model(this._db.app).then((model) => {
      let filter = { where : { key: this._storageKey} }
	    model.find(filter).then((authRow) => {
	    	if ( !_.isEmpty(authRow) )
			 		model.update({"data": null, "key": this._storageKey});

			 	ProfileActions.logoutUser.completed();
				this.trigger({currentUser: this._currentUser = null});
				this._endAllListeners();
			});
		});
	},

	_endAllListeners: function() {
		_.each(this._dbRefs, (dbRef) => {
			dbRef.off("child_changed");
			dbRef.off("child_added");
		});

		this._currentSiteRight = null;
		this._currentUser = null;
		
		LookupActions.endListeners();
		IssueActions.endListeners();
		SiteActions.endListeners();
		UserActions.endListeners();
	},

	_parseUid: function(iid) {
		return parseInt( iid.substr(iid.lastIndexOf(':') + 1) );
	},

	_getSiteRight: function(chosenSiteRef) {
		let allSiteRights = this._currentUser.siteRights;
		
		// find suitable sight right or a default site right
		let chosenSiteRight = _.isEmpty(chosenSiteRef) ? _.first(allSiteRights)
			: _.findWhere(allSiteRights, {"siteId": chosenSiteRef.id});

    if ( !_.isEmpty(chosenSiteRight) )
      ProfileActions.setChosenSiteRight(chosenSiteRight);

    return chosenSiteRight;
	},

	_setProfile: function(user) {
		// 1a. Check user's settings for preferred orgTypeId/SiteId combination
		let chosenSiteRef = _.property(["settings", "chosen", "siteId"], user);
		this._currentUser = user;
		this._currentSiteRight = this._getSiteRight(chosenSiteRef);
		this.trigger({
			currentUser: this._currentUser,
			currentSiteRight: this._currentSiteRight
		});
	},

	_updateDb: function(data) {
		this._db = data.db.child("users");
	}
})


module.exports = ProfileStore;