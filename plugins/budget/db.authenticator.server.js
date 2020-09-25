goog.provide('aurora.db.Authenticator');


goog.require('aurora.auth.Auth');
goog.require('aurora.db.access');
goog.require('aurora.db.schema.tables.base.user');

/**
 * @constructor
 * @implements {aurora.auth.Authenticator}
 * @param {!aurora.db.Reader} reader
 * @param {boolean} allowAnon if true will auto login anyone without password the user will be blank with no permissions
 */
aurora.db.Authenticator = function(reader, allowAnon) {
    this.reader_ = reader;
    this.allowAnon_ = allowAnon;
};

/**
 * @param {string} token
 * @param {Object} cred
 * @param {Object} data
 * @param {function(?)} cb
 */
aurora.db.Authenticator.prototype.validate = function(token, cred, data, cb) {
    let reader = this.reader_;
    let userT = aurora.db.schema.tables.base.user;
    let groupT = aurora.db.schema.tables.base.group;
    let permT = aurora.db.schema.tables.base.permission;
    if (cred.anon) {
        data.permissions = {};
        data.ip = cred.srcAddr;
        data.user = cred.username;
        data.userid = null;
        cb(null);
        return;
    }
    reader.readObjectByKey({}, userT, [{col: userT.cols.username, value: cred.username}], null, function(err, user) {
        // hide errors
        console.log('todo lock user out, if too many login attempts', err);
        if (err || !user) {
            cb({message: 'Invalid User/Password'});
        }
        else {
            console.log('******************** checking passwords');
            aurora.db.Pool.checkPassword(cred.password, user.password, function(valid) {
                if (!valid) {
                    cb({message: 'Invalid User/Password'});
                }
                else {
                    let query = new recoil.db.Query();
                    let groups = user.groups.map(function(group) { return group.groupid; });
                    reader.readObjects({}, groupT, query.isIn(
                        query.field(groupT.cols.id.getName()), groups), null, function(err, groups) {
                            let permissions = {};
                            data.permissions = permissions;
                            data.ip = cred.srcAddr;
                            data.user = cred.username;
                            data.remember = cred.remember;
                            data.userid = user.id;
                            if (groups) {
                                let permMap = {};
                                groups.forEach(function(group) {
                                    (group.permission || []).forEach(function(perm) {
                                        permMap[perm.permissionid] = perm.permissionid;
                                    });
                                });
                                let permList = [];
                                for (let k in permMap) {
                                    permList.push(permMap[k]);
                                }
                                reader.readObjects({}, permT, query.isIn(permT.cols.id.getName(), permList), null, function(err, perms) {
                                    perms.forEach(function(p) {
                                        permissions[p.name] = true;
                                    });
                                    cb(null);
                                });


                            }
                            else {
                                cb(null);

                            }
                        });
                }
            });
        }
    });
};

/**
 * @param {aurora.http.RequestState} state
 * @param {function(?{response:function(?, aurora.http.RequestState, function(?))})} callback
 */
aurora.db.Authenticator.prototype.getCredentials = function(state, callback) {
    var auth = state.request.headers && state.request.headers['authorization'];
    var makeResponse = function(username, password, remember, anon) {
        var request = state.request;
        var srcAddr = request.headers['x-forwarded-for'] || request.connection.remoteAddress;

        if (srcAddr && srcAddr.indexOf('::ffff:') === 0 && srcAddr.indexOf('.') !== -1) {
            srcAddr = srcAddr.substring(7);
        }
        return {
            remember: remember,
            username: username,
            anon: anon,
            password: password,
            srcAddr: srcAddr,
            srcPort: request.socket.address().port,
            protocol: request.secure ? 'https' : 'http',
            response: function(message, state, d, doneCallback) {
                if (d) {
                    let ok = username && !message;
                    state.responseHeaders.set('Set-Cookie', [
                        'username=' + encodeURIComponent(ok ? username : '') + '; Path=/; SameSite=Strict;',
                        'permissions=' + encodeURIComponent(JSON.stringify(d.permissions || {})) + '; Path=/; SameSite=Strict;']);
                }

                if (!anon) {
                    state.responseHeaders.set('Content-Type', 'application/json');
                    var res = {'status': true};
                    if (message) {
                        res = {'message': message.message};
                    }
                    state.response.writeHead(200, state.responseHeaders.toClient());
                    state.response.end(JSON.stringify(res), 'utf8');
                    doneCallback(false);
                }
                else {
                    // just continue as normal even though we have done a login
                    doneCallback(undefined);
                }

            }
        };
    };

    if (aurora.http.getPost(state.request, function(data) {
        callback(makeResponse(data['username'], data['password'], !!data['remember'], false));
    })) {
        return;
    }

    if (this.allowAnon_) {
        // just continue as if we don't login we should have just set the cookies
        callback(makeResponse(null, '', false, true));
        return;
    }
    // this is not the authenticator you are looking for
    callback(null);
};

/**
 * @param {string} token
 */

aurora.db.Authenticator.prototype.unregister = function(token) {

};


/**
 * like aurora.websocket.Server.getChannel however will also add permissions to the channel
 * so the can be checked
 * @param {string} pluginName The name of the plugin that creates the channel.
 * @param {number} channelId The id of the channel. This is managed by the plugin.
 * @param {function(!aurora.websocket.ChannelMessage,!aurora.db.access.SecurityContext)} messageCallback
 * @param {function(string,string)=} opt_clientCloseCallback passes the token and client id closed
 * @return {!aurora.websocket.Channel}
 */
aurora.db.Authenticator.prototype.getChannel = function(pluginName, channelId, messageCallback, opt_clientCloseCallback) {
    let reader = this.reader_;
    let cachedSessionsExpiry = new goog.structs.AvlTree(function(x, y) {
        let res = y.expire - x.expire;
        if (res) {
            return res;
        }
        return (y.token + '').localeCompare(x.token + '');
    });
    let cachedSessions = {};
    let cacheTimer = null;

    let updateExpire = function() {
        if (cacheTimer) {
            clearTimeout(cacheTimer);
            cacheTimer = null;
        }

        cachedSessionsExpiry.inOrderTraverse(function(e) {
            let now = process.hrtime()[0] * 1000;
            cacheTimer = setTimeout(function() {
                let toRemove = [];
                let now = process.hrtime()[0] * 1000;
                cachedSessionsExpiry.inOrderTraverse(function() {
                    if (now > e.expire) {
                        toRemove.push(e);
                    }
                });
                toRemove.forEach(function(e) {
                    delete cachedSessions[e.token];
                    cachedSessionsExpiry.remove(e);
                });
                updateExpire();
            }, Math.max(1, e.expire - now));
            return true;
        });

    };


    let cacheAndContinue = function(token, message, context, messageCallback) {

        let now = process.hrtime()[0] * 1000;
        let cached = {expire: now + 60000, context: context, token: token};
        cachedSessions[token] = cached;
        cachedSessionsExpiry.add(cached);
        updateExpire();
        messageCallback(message, cached.context);
    };

    let channel = aurora.websocket.getChannel(pluginName, channelId, function(message) {
        let token = message.token;
        let now = process.hrtime()[0] * 1000;

        let cached = cachedSessions[token];

        if (cached && cached.expiry < now) {
            messageCallback(message, cached.context);
        }
        else {
            aurora.auth.instance.getSessionData(token, function(data) {
                let userT = aurora.db.schema.tables.base.user;
                let groupT = aurora.db.schema.tables.base.group;
                let permT = aurora.db.schema.tables.base.permission;
                if (data.userid == null) {
                    cacheAndContinue(token, message, {userid: null, permissions: {}}, messageCallback);
                    return;
                }

                let query = new recoil.db.Query();
                reader.selectReference(userT, [userT.groups.cols.groupid, groupT.permission.cols.permissionid], query.eq(userT.cols.id, query.val(data.userid)), {distinct: true}, function(err, permRows) {
                    let permission = {};
                    if (err) {
                        cacheAndContinue(token, message, {userid: data.userid, permissions: {}}, messageCallback);
                        return;
                    }
                    permRows.forEach(function(row) {
                        permission[row.name] = true;
                    });
                    cacheAndContinue(token, message, {userid: data.userid, permissions: permission}, messageCallback);
                });
            });
        }


        // todo remove getting permissions at login we need to do it every read at least cache it and do it no less than once per minute

        //    reader.readObjectByKey(userT, [{col: userT.cols.username, value: cred.username}], null, function(err, user) {





    }, opt_clientCloseCallback);
    return channel;
};
