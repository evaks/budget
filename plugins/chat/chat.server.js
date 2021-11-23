goog.provide('aurora.Chat');
goog.provide('aurora.ChatInterface');

goog.require('aurora.chat.shared');
goog.require('aurora.db.Authenticator');
goog.require('recoil.structs.MultiKeyMap');

/**
 * @interface
 */
aurora.ChatInterface = function() {};


/**
 * @param {Object} offerer the security context of the user making the offer
 * @param {Object} offeree the security context of the user getting the offer
 * @param {function(boolean)} callback called with true if allowed
 */
aurora.ChatInterface.prototype.allowOffer = function(offerer, offeree, callback) {};

/**
 * @constructor
 * @param {!aurora.db.Authenticator} authenticator
 * @param {!aurora.ChatInterface} security
 */
aurora.Chat = function(authenticator, security) {
    let log = aurora.log.createModule('CHAT');

    let availUsers = new recoil.structs.MultiKeyMap(['clientid', 'userid']);
    let calling = new recoil.structs.MultiKeyMap(['from', 'to']);
    let inCall = new recoil.structs.MultiKeyMap(['from', 'to']);

    let me = this;

    let to = function(x) {return x.to;};
    let from = function(x) {return x.from;};

    this.channel_ = authenticator.getChannel(aurora.chat.shared.PLUGIN_ID, aurora.chat.shared.DATA, function(e, secContext) {
        let data = {};
        try {
            data = e.data || {};
            let command = data['command'];


            if (command == 'offer') {
                let found = [];
                availUsers.get(['userid'], {userid: BigInt(data.who)}).forEach(function(entry) {
                    if (entry.clientid != e.clientId) {
                        found.push(entry);
                    }
                });

                if (found.length) {
                    security.allowOffer(secContext, found[0].context, function(allow, name) {
                        if (!allow) {
                            data['error'] = 'User not logged in';
                            me.channel_.send(data, e.clientId);
                        }
                        else {
                            data['requestClientId'] = e.clientId;
                            data['who'] = secContext.userid;
                            data['user'] = name;
                            found.forEach(function(f) {
                                let callData = {from: e.clientId, to: f.clientid};
                                let active = calling.add(callData);
                                me.channel_.send(data, f.clientid);
                            });
                        }
                    });
                }
                else {
                    data['error'] = 'User not logged in';
                    me.channel_.send(data, e.clientId);
                }
            }
            else if (command == 'answered') {
                let callData = {to: e.clientId, from: data.who};
                let active = calling.get(['from', 'to'], callData);
                if (active.length > 0) {
                    calling.removeIntersection(['to', 'from'], callData);
                    inCall.add(callData);
                    me.channel_.send(data, data.who);
                }
                else {
                    data['error'] = 'no longer calling';
                    me.channel_.send(data, e.clientId);
                }
            }
            else if (command == 'iceCandidate') {

                let peers = inCall.get(['from'], {from: e.clientId}).map(x => x.to)
                    .concat(inCall.get(['to'], {to: e.clientId}).map(x => x.from));

                if (peers.length === 0) {
                    peers = calling.get(['from'], {from: e.clientId}).map(to)
                        .concat(calling.get(['to'], {to: e.clientId}).map(from));
                }
                data.who = e.clientId;

                peers.forEach(function(cid) {
                    me.channel_.send(data, e.clientId);
                    me.channel_.send(data, cid);
                });


            }
            else if (command == 'reject') {
                let found = calling.get(['from', 'to'], {from: data.client, to: e.clientId}).length > 0;
                console.log('rejecting', found, data.client);

                if (found) {
                    calling.removeIntersection(['from'], {from: data.client});
                    me.channel_.send({command: 'reject'}, data.clientId);
                }
            }
            else if (command == 'hangup') {
                let clients = calling.removeIntersection(['from'], {from: e.clientId}).map(to);
                clients = clients.concat(inCall.removeIntersection(['from'], {from: e.clientId}).map(to));
                clients = clients.concat(inCall.removeIntersection(['to'], {to: e.clientId}).map(from));
                clients.forEach(function(c) {
                    me.channel_.send({command: 'reject'}, c);
                });
            }



        } catch (e) {
            log.error(e);
            data['error'] = e;
            me.channel_.send(data, e.clientId);
        }

    }, function(token, clientid) {
        let stopCalling = calling.removeIntersection(['from'], {from: clientid}).map(x => x.to);
        stopCalling = stopCalling.concat(
            calling.removeIntersection(['to'], {to: clientid}).map(x => x.fom));
        stopCalling = stopCalling.concat(
            inCall.removeIntersection(['from'], {from: clientid}).map(x => x.to));
        stopCalling = stopCalling.concat(
            inCall.removeIntersection(['to'], {to: clientid}).map(x => x.from));

        stopCalling.forEach(function(sendTo) {
            me.disconnect(clientid, sendTo);
        });
        availUsers.removeIntersection(['clientid'], {clientid});
    });

    this.channel_.onAuthRegister(function(connection, token, context) {
        if (context.userid !== null) {
            availUsers.add({userid: BigInt(context.userid), clientid: connection.id, context});
        }
    });
};

/**
 * sends a message that the call has ended
 * @param {string} client the client that ended the call
 * @param {string} sendTo the client to send the info to
 *
 */
aurora.Chat.prototype.disconnect = function(client, sendTo) {
    this.channel_.send({command: 'disconnect', clientId: client}, sendTo);

};
