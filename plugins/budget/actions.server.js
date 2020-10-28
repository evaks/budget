goog.provide('budget.actions');

/**
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {!Array} inputs
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.register = function(context, reader, inputs, callback) {
    let userT = aurora.db.schema.tables.base.user;
    let groupT = aurora.db.schema.tables.base.group;
    let failCb = function(err) {callback(err, []);};
    if (inputs instanceof Array) {
        console.log('making inputs', inputs);
        let object = {};

        for (let i = 0; i < inputs.length; i++) {
            let input = inputs[i];
            for (let k in input) {
                object[k] = input[k];
            }
        }
        // don't allow specification of primary key
        delete object[userT.cols.active.getName()];
        object[userT.cols.active.getName()] = true;
        object[userT.cols.lastinvalidtime.getName()] = null;
        object[userT.cols.lockcount.getName()] = 0;
        object[userT.cols.mentorid.getName()] = null;
        let query = new recoil.db.Query();
        let username = object[userT.cols.username.getName()];
        let password = object[userT.cols.password.getName()];
        console.log('made inputs', object);

        if (!username || username.trim().length === 0) {
            callback('Invalid username', []);
            return;
        }
        aurora.db.Pool.hashPasswordPromise(password).then(function(pword) {
            console.log('password encoded', pword);
            object[userT.cols.password.getName()] = pword;
            return new Promise(function(resolve, reject) {
                reader.readObjects(
                    {}, groupT, query.eq(groupT.cols.name, query.val('client')), null,
                    function(err, groups) {
                        if (err) {
                            reject(err);
                        }
                        else if (groups.length !== 1) {
                            reject('Unable to find group');
                        }
                        else {
                            resolve(groups[0].id);
                        }
                    });
            });
        }, failCb)
            .then(function(groupId) {
                object[userT.cols.groups.getName()] = [{'groupid': groupId}];
                reader.transaction(function(reader, callback) {
                    console.log('transaction started');
                    reader.readObjects({}, userT, query.eq(userT.cols.username, query.val(username)), null, function(err, result) {
                        console.log('username read', result);
                        if (err) {
                            callback(err);
                        }
                        else if (result.length > 0) {
                            callback('Username already exists');
                        }
                        else {
                            reader.insert({}, userT, object, function(err) {
                                console.log('error', err);
                                callback(err ? 'Unable to create user' : null);
                            });
                        }


                    });

                }, function(err) {
                    callback(err, []);
                });
        }, failCb);
    }
    else {
        callback('Invalid Parameters Passed', []);
    }
};
