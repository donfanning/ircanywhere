NetworkManager = (function() {
	"use strict";

	var Manager = {

		flags: {
			connected: 'connected',
			disconnected: 'disconnected',
			connecting: 'connecting',
			closed: 'closed',
			failed: 'failed'
		},

		init: function() {
			this.reconnectClients();
			// reconnect our clients here

			Meteor.publish('networks', function() {
				return Networks.find({'internal.userId': this.userId});
			});
			// handle our meteor publish collections here
		},

		reconnectClients: function() {
			var networks = Networks.find({}).fetch();
			// get the networks (we just get all here so we can do more specific tests on whether to connect them)

			for (var netId in networks) {
				var network = networks[netId],
					me = Meteor.users.find(network.internal.userId).fetch(),
					reconnect = false;

				if (network.internal.status !== this.flags.disconnected)
					reconnect = true;
				// check whether we should reconnect or not

				if (reconnect)
					this.connectNetwork(me, network);
				// ok we've got the go ahead now.
			}
			// now, we need to loop through the networks and do our work on
			// starting them up individually
		},

		addNetwork: function(user, network) {
			var userCount = Meteor.users.find({}).count(),
				userName = Meteor.config.clientSettings.userNamePrefix + userCount;

			network.name = network.server;
			network.nick = user.profile.nickname + '-';
			network.userName = userName;
			network.autoRejoin = (network.autoRejoin === undefined) ? false : network.autoRejoin;
			network.autoConnect = (network.autoConnect === undefined) ? true : network.autoConnect;
			network.retryCount = (network.retryCount === undefined) ? 10 : network.retryCount;
			network.retryDelay = (network.retryDelay === undefined) ? 1000 : network.retryDelay;
			network.secure = (network.secure === undefined) ? false : network.secure;
			network.password = (network.password === undefined || network.password === '') ? null : network.password;
			network.channels = (network.channels === undefined) ? [] : network.channels;
			// because some settings can be omitted, we're going to set them to
			// the hard-coded defaults if they are, ok. We don't need to worry about
			// validating them before hand either because app.js takes care of that.
			// 
			// XXX - this looks a bit messy, tidied up at some point? it would be nice
			//		 if simple-schema could automatically cast these, maybe it can with cast: {}

			network.internal = {
				nodeId: Meteor.nodeId,
				userId: user._id,
				status: this.flags.closed,
				channels: {},
				url: network.server + ':' + ((network.secure) ? '+' : '') + network.port
			}
			// this stores internal information about the network, it will be available to
			// the client but they wont be able to edit it, it also wont be able to be enforced
			// by the config settings or network settings, it's overwritten every time.

			network._id = Networks.insert(network);
			// insert the network. Just doing this will propogate the change directly
			// down the pipe to our client @ this.userId, also by calling insert without
			// a callback meteor automatically sets up a fiber, blocking the code in users.js

			return network;
		},

		connectNetwork: function(user, network) {
			for (var channel in network.channels) {
				var split = channel.split(' '),
					chan = split[0],
					pass = (split[1] !== undefined) ? split[1] : '';
				// split the channel name up

				network.internal.channels[chan] = pass;
			}
			// move into network.internal.channels
			// we do this because we manually join our channels instead of sending
			// them into node-irc immediately, because it's crappy and doesn't support passwords

			delete network.internal;
			network.hostname = Meteor.config.reverseDns;
			network.channels = [];
			network.debug = false;
			network.floodProtection = false;
			network.selfSigned = true;
			network.certExpired = true;
			network.stripColours = false;
			network.channelPrefxies = '&#';
			// set some node-irc default settings, channel prefixes is assumed here
			// but will be confirmed when we get the capabilities back later on

			Meteor.ircFactory.create(user, network);
			// tell the factory to create a network
		},

		changeStatus: function(networkId, status) {
			if (this.flags[status] === undefined)
				return console.log('warn: the status', status, 'passed into changeStatus for', networkId, 'is invalid.');
			// status is invalid

			Networks.update(networkId, {$set: {'internal.status': status}});
		}
	};

	return Manager;
}());
// create our factory object

Meteor.networkManager = Object.create(NetworkManager);
Meteor.networkManager.init();
// assign it to Meteor namespace so its accessible and rememberable