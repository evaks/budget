goog.provide('aurora.db.Coms');

goog.require('aurora.db.Authenticator');
goog.require('aurora.db.Serializer');
goog.require('aurora.db.shared');
goog.require('aurora.db.sql.ChangeWriter');
goog.require('aurora.log');

goog.require('recoil.db.Query');


/**
 * @constructor
 * @param {!aurora.db.Authenticator} authenticator
 */
aurora.db.Coms = function(authenticator) {
    let me = this;
    this.log_ = aurora.log.createModule('DBCOMS');
    this.async_ = require('async');
    /**
     * @type {aurora.db.Reader}
     */
    let reader = null;
    let secName = aurora.db.schema.tables.sec.permissions.info.name;
    let serializer = new aurora.db.Serializer();

    aurora.startup.doOnceStarted(function() {
        reader = new aurora.db.sql.Reader(aurora.db.Pool.getDefault());
        me.writer_ = new aurora.db.sql.ChangeWriter(aurora.db.schema, reader);
    });

    /**
     * @private
     * @type {!aurora.websocket.Channel}
     */
    this.channel_ = authenticator.getChannel(aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA, function(e, secContext) {
        let action = e && e.data && e.data['command'];
        let token = e.token;
        try {
            let context = {'@userid': secContext.userid};

            if (action === 'get') {
                me.doGet_(reader, e, secContext);
            }
            else if (action === 'set') {
                me.doChanges_(reader, e, secContext);
            }
            else {
            // todo check permission filters
                me.log_.error('got unknown command', action);
            }
        }
        catch (e) {
            me.log_.error('Error processing request', e);
        }

    }, function(token) {
        // what to do if we deregister
    });


};

/**
 * @private
 * @param {aurora.db.Reader} reader
 * @param {!aurora.websocket.ChannelMessage} e
 * @param {!aurora.db.access.SecurityContext} secContext
 */
aurora.db.Coms.prototype.doChanges_ = function(reader, e, secContext) {
    let transId = e.data['id'];
    let schema = new aurora.db.Schema();
    let changes = recoil.db.ChangeSet.Change.deserializeList(e.data['list'], schema, new aurora.db.Coms.ValSerializer());
    let me = this;
    this.writer_.applyChanges(changes, secContext, function(result) {
        console.log('setting got result', result);
        me.channel_.send({'command': 'set', 'id': e.data['id'], 'results': result}, e.clientId);

    });
};
/**
 * calls callback for each field in object
 * @param {?aurora.db.schema.TableType} tbl
 * @param {?} obj
 * @param {function(!aurora.db.schema.TableType, ?,?, string, ?):(boolean|undefined)} callback (parentTable, parent, value, colName, colMeta)
 */
aurora.db.Coms.traverseObject_ = function(tbl, obj, callback) {
    if (!obj || !tbl) {
        return;
    }
    let doSub = {};
    for (let col in tbl.meta) {
        doSub[col] = callback(tbl, obj, obj[col], col, tbl.meta[col]);
    }

    for (let col in tbl.meta) {
        let meta = tbl.meta[col];
        if (doSub[col] !== false) {
            if (meta.list) {
                obj[col].forEach(function(v) {
                    aurora.db.Coms.traverseObject_(aurora.db.schema.getTable(meta.key), v, callback);
                });
            }
            else if (meta.object) {
                aurora.db.Coms.traverseObject_(aurora.db.schema.getTable(meta.key), obj[col], callback);
            }
        }
    }
};

/**
 * @private
 * @param {aurora.db.Reader} reader
 * @param {!aurora.websocket.ChannelMessage} e
 * @param {!aurora.db.access.SecurityContext} secContext
 */
aurora.db.Coms.prototype.doGet_ = function(reader, e, secContext) {
    let secName = aurora.db.schema.tables.sec.permissions.info.name;
    let me = this;
    let name = e.data['name'];
    let queryIn = e.data['query'];
    let optionsIn = e.data['options'];
    let response = {'command': 'full', 'name': name, 'query': queryIn, 'options': optionsIn, 'value': null};
    let serializer = new aurora.db.Serializer;
    let context = {'@userid': secContext.userid};

    if (name === secName) {
        // this is special every one can request what permissions they have
        me.channel_.send({'command': 'full', 'name': name, 'query': queryIn, 'options': optionsIn, 'value': secContext}, e.clientId);
        return;
    }
    if (!reader) {
        return;
    }
    let secInfo = me.doSecurityCheck_(e, secContext, 'r', response);
    if (secInfo) {
        let query = recoil.db.Query.deserialize(queryIn, serializer);
        let options = recoil.db.QueryOptions.deserialize(optionsIn);
        reader.readObjects(
            context, secInfo.table, query,
            secInfo.accessFilter,
            function(err, data) {
                if (err) {
                    me.log_.debug('error reading data', queryIn, optionsIn, err);
                    response['value-error'] = err;
                }
                else {
                    if (options && !options.isCount()) {
                        data.forEach(function(dataItem) {
                            aurora.db.Coms.traverseObject_(secInfo.table, dataItem, function(tbl, parent, value, colName, colMeta) {
                                if (colMeta.type === 'password') {
                                    parent[colName] = null;
                                }
                                if (tbl.info.access && !tbl.info.access(secContext, 'r')) {
                                    delete parent[colName];
                                    return false;
                                }
                                if (colMeta.access && !colMeta.access(secContext, 'r')) {
                                    delete parent[colName];
                                    return false;
                                }
                                return true;
                            });
                        });
                    }
                    response['value'] = data;
                    me.log_.debug('read data', queryIn, optionsIn, data);
                }
                me.channel_.send(response, e.clientId);
            }, options);
    }

};

/**
 * @private
 * @param {!aurora.websocket.ChannelMessage} e
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {string} opType one of c - create, r -read, u - update, d - delete
 * @param {Object} response
 *
 * @return {?{table:!aurora.db.schema.TableType,accessFilter:!recoil.db.Query}}
 */
aurora.db.Coms.prototype.doSecurityCheck_ = function(e, secContext, opType, response) {
    let name = e.data['name'];
    let me = this;

    let tbl = aurora.db.schema.getTableByName(name);
    if (!tbl) {
        response['error-value'] = 'Unable to find object ' + name;
        me.channel_.send(response, e.clientId);
        return null;
    }
    let accessFunc = tbl.info.access;
    let accessFilterFunc = tbl.info.accessFilter;
    if (!accessFunc || !accessFilterFunc) {
        response['error-value'] = 'Access control not specified on ' + name;
        me.channel_.send(response, e.clientId);
        return null;
    }

    if (!tbl.info.access(secContext, opType)) {
        response['error-value'] = 'Access Denied';
        me.channel_.send(response, e.clientId);
        return null;
    }

    return {
        table: tbl,
        accessFilter: accessFilterFunc(secContext)
    };
};



/**
 * @constructor
 * @implements {recoil.db.ChangeSet.ValueSerializor}
 */
aurora.db.Coms.ValSerializer = function() {
};

/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {?} val
 * @return {?}
 */
aurora.db.Coms.ValSerializer.prototype.serialize = function(path, val) {
    return val;
};


/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {?} val
 * @return {?}
 */
aurora.db.Coms.ValSerializer.prototype.deserialize = function(path, val) {
    let tbl = aurora.db.schema.keyMap[path.parent().pathAsString()];
    if (tbl) {
        let meta = tbl.meta[path.last().name()];
        if (meta) {
            if (meta.type === 'id') {
                return new aurora.db.PrimaryKey(
                    val['db'] == undefined ? null : BigInt(val['db']),
                    val['mem'] == undefined ? null : BigInt(val['mem']));
            }
        }
    }
    return val;
};

