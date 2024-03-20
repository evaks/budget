goog.provide('aurora.db.Coms');

goog.require('aurora.SystemSettings');
goog.require('aurora.db.Authenticator');
goog.require('aurora.db.Serializer');
goog.require('aurora.db.shared');
goog.require('aurora.db.sql.ChangeWriter');
goog.require('aurora.log');

goog.require('recoil.db.Query');
goog.require('recoil.structs.MultiKeyMap');

/**
 * @constructor
 */
aurora.db.Notify = function() {
    this.map_ = new recoil.structs.MultiKeyMap([{col: 'query', compare: recoil.util.object.compareKey},'path', 'client']);
    this.addMap_ = new goog.structs.AvlTree(recoil.util.object.compareKey);
    this.contexts_ = {};
    this.log_ = aurora.log.createModule('DBNOTIFY');
};

/**
 * @param {string} clientid
 * @param {!aurora.db.access.SecurityContext} context
 */
aurora.db.Notify.prototype.updateClientContext = function(clientid, context) {
    this.contexts_[clientid] = context;
};

/**
 * @typedef {{client:string,query:{key:?,query:?}, secFilter:recoil.db.Query, secContext: !aurora.db.access.SecurityContext, readContext: Object}}
 */
aurora.db.Notify.EntryType;
/**
 * @param {!aurora.db.Notify.EntryType} entry
 * @return {?Array<Object<string,?>>}
 */
aurora.db.Notify.prototype.makeLookup_ = function(entry) {
    let findQuery = entry.secFilter ? new recoil.db.Query().and(entry.secFilter, entry.query.query) : entry.query.query;
    let scope = new aurora.db.Schema().makeLookupScope(entry.path, entry.readContext, {});
    let lookups = findQuery.makeLookup(scope);
    if (lookups && lookups.length == 0) {
        lookups = [{}];
    }
    if (!lookups) {
        return lookups;
    }
    return lookups.map(function(v) {
        let res = {};
        for (let k in v) {
            res[k] = aurora.db.Notify.fixInt(v[k]);
        }
        return res;
    });
};

/**
 * @param {string} clientid
 * @param {Object} key
 * @param {aurora.db.schema.TableType} table
 * @param {!recoil.db.Query} query
 * @param {recoil.db.Query} secFilter
 * @param {!aurora.db.access.SecurityContext} secContext the security context of client
 * @param {Object} readContext
 * @return {!aurora.db.Notify.ObjectMap}
 */
aurora.db.Notify.prototype.addQuery = function(clientid, key, table, query, secFilter, secContext, readContext) {


    let path = recoil.db.ChangeSet.Path.fromString(key.name);

    let entry = {query: {key: key, query: query}, client: clientid, path: path, secContext, readContext, secFilter};
    this.map_.add(entry);
    let objectMap = new aurora.db.Notify.ObjectMap(table, this.map_, entry);
    this.map_.add(entry);


    let lookups = this.makeLookup_(entry);
    if (lookups) {
        let addEntry = this.addMap_.safeFind({key: path.unsetKeys(), columns: new goog.structs.AvlTree(recoil.util.object.compareKey)});
        lookups.forEach(function(lookup) {
            if (lookup) {
                let key = Object.keys(lookup).sort();
                let lookups = addEntry.columns.safeFind({key: key, lookups: new goog.structs.AvlTree(recoil.util.object.compareKey)});
                lookups.lookups.safeFind({key: lookup, entries: []}).entries.push(entry);
            }
        });

    }

    return objectMap;

};

/**
 * @param {string} clientid
 * @param {?} key
 */
aurora.db.Notify.prototype.removeQuery = function(clientid, key) {
    let entry = {query: {key: key}, client: clientid};
    this.removeNotifies_(['query', 'client'], entry);

};

/**
 * @private
 * @param {!Array<string>} keys
 * @param {Object} object
 */
aurora.db.Notify.prototype.removeNotifies_ = function(keys, object) {
    var me = this;
    this.map_.get(keys, object).forEach(function(entry) {
        let doRemove = false;
        let tableAdds = me.addMap_.findFirst({key: entry.path});
        if (tableAdds) {
            let lookups = me.makeLookup_(/** @type {!aurora.db.Notify.EntryType} */ (entry)) || [];
            lookups.forEach(function(lookup) {

                let key = Object.keys(lookup).sort();
                let colSetEntries = tableAdds.columns.findFirst({key: key});

                if (colSetEntries) {
                    var entries = colSetEntries.lookups.findFirst({key: lookup});
                    if (entries) {

                        for (let i = entries.entries.length; i >= 0; i--) {
                            if (recoil.util.isEqual(entries.entries[i], entry)) {
                                entries.entries.splice(i, 1);
                            }
                        }
                        if (entries.entries.length === 0) {
                            colSetEntries.lookups.remove({key: lookup});
                            if (colSetEntries.lookups.getCount() === 0) {
                                tableAdds.columns.remove({key: key});
                            }
                        }

                    }
                }
            });
            if (tableAdds.columns.getCount() === 0) {
                me.addMap_.remove({key: entry.path});
            }

        }


    });
    this.map_.removeIntersection(keys, object);

    let colCount = 0;
    let lookupCount = 0;
    let entriesCount = 0;
    /*
    this.log_.error('this is ineffient comment out');
    me.addMap_.inOrderTraverse(function (e1) {
        colCount += e1.columns.getCount();
        e1.columns.inOrderTraverse(function (e2) {
            lookupCount += e2.lookups.getCount();
            e2.lookups.inOrderTraverse(function (e3) {
                entriesCount += e3.entries.length;
            });
        });
    });

    console.log("addMap", me.addMap_.getCount());
    console.log("colCount", colCount);
    console.log("lookupCount", lookupCount);
    console.log("entriesCount", entriesCount);
    */

};
/**
 * @param {string} clientid
 */
aurora.db.Notify.prototype.removeClient = function(clientid) {

    this.removeNotifies_(['client'], {client: clientid});
    delete this.contexts_[clientid];
};


/**
 * @param {recoil.db.ChangeSet.Path} path
 */
aurora.db.Notify.prototype.removePath = function(path) {
    this.removeNotifies_(['path'], {path: aurora.db.Notify.fixPath(path)});
};

/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {recoil.db.ChangeSet.Path}
 */
aurora.db.Notify.fixPath = function(path) {

    if (path) {
        return new recoil.db.ChangeSet.Path(path.items().map(function(v) {
            let keys = v.keys();
            if (keys.length == 0) {
                return v;
            }

            return new recoil.db.ChangeSet.PathItem(v.name(), v.keyNames(), keys.map(function(v) {
                if (v instanceof aurora.db.PrimaryKey) {
                    return v.db;
                }
                return v;
            }));
        }));
    }
    return path;
};


/**
 * @param {!recoil.db.ChangeSet.Change} change
 * @return {!recoil.db.ChangeSet.Change}
 */

aurora.db.Notify.prototype.fixPrimaryKeys = function(change) {
    var itr = function(c) {
        let newPath = /** @type {!recoil.db.ChangeSet.Path} */ (aurora.db.Notify.fixPath(c.path()));
        if (c instanceof recoil.db.ChangeSet.Set) {
            var val = c.value();
            if (val instanceof aurora.db.PrimaryKey) {
                return new recoil.db.ChangeSet.Set(newPath, c.orig(), val.db);
            }
            return new recoil.db.ChangeSet.Set(newPath, c.orig(), val);
        }
        else if (c instanceof recoil.db.ChangeSet.Add) {
            return new recoil.db.ChangeSet.Add(newPath, c.dependants());
        }
        else if (c instanceof recoil.db.ChangeSet.Delete) {
            return new recoil.db.ChangeSet.Delete(newPath, c.orig());
        }

        return change;
    };
//    console.log("change", change.forEachChange(itr).dependants());
    return /** @type {!recoil.db.ChangeSet.Change}*/ (change.forEachChange(itr));
};
/**
 * @param {!recoil.db.ChangeSet.Add} add
 * @return {Object}
 */
aurora.db.Notify.prototype.addToObject = function(add) {
    add = /** @type {!recoil.db.ChangeSet.Add} */ (this.fixPrimaryKeys(add));
    let changeDb = new recoil.db.ChangeDb(new aurora.db.Schema());
    recoil.db.ChangeDbInterface.applyChanges(changeDb, new aurora.db.Schema(), [add]);
    let res = changeDb.get(add.path());
    return res;
/*    if (t) {
        res[t.info.pk.getName] = path.lastKeys()[0];
        add.dependants().forEach(function (change) {
            let path = change.path();

        });
    }*/
};

/**
 * @param {?} v
 * @return {?}
 */
aurora.db.Notify.fixInt = function(v) {
    if (typeof (v) === 'number' && Math.floor(v) === v) {
        return BigInt(v);
    }
    return v;
};

/**
 * @private
 * @param {?} obj
 * @param {!Array<string>} cols a list of string paths into object seperated by /
 * @return {!Object<string,?>} a map of values of the object that match the path
 */
aurora.db.Notify.makeColMap_ = function(obj, cols) {
    let res = {};

    function getCol(obj, parts, idx) {
        if (idx >= parts.length) {

            return aurora.db.Notify.fixInt(obj);
        }
        if (!obj) {
            return undefined;
        }

        return getCol(obj[parts[idx]], parts, idx + 1);
    }

    cols.forEach(function(col) {
        res[col] = getCol(obj, col.split('/'), 0);
    });
    return res;
};
/**
 * @param {!aurora.db.Reader} reader
 * @param {!recoil.db.ChangeSet.Add} add
 * @param {!recoil.db.ChangeSet.Path} rootPath
 * @param {function(!aurora.db.access.SecurityContext, string, !recoil.db.ChangeSet.Path, !recoil.db.ChangeSet.Path, ?, recoil.db.Query)} callback
 * @return {function(?)}
 */

aurora.db.Notify.prototype.notifyAddEntry_ = function(reader, add, rootPath, callback) {
    let me = this;
    let path = add.path();

    return function(entry) {
        // run through each query and
        let secContext = me.contexts_[entry.client];
        if (!aurora.db.schema.hasAccess(secContext, path, 'r')) {
            return;
        }

        if (secContext) {
            let readContext = aurora.db.Coms.makeReadContext(secContext);
            // the path is different here because an add looks at the main path

            let obj = me.addToObject(add);
            let baseTable = aurora.db.schema.getTableByName(add.path());
            if (!baseTable && baseTable.info.accessFilterFunc) {
                return;
            }
            let query = new recoil.db.Query();
            let accessFilter = baseTable.info.accessFilter(secContext);
            let scope = new aurora.db.Schema().makeQueryScope(rootPath, readContext, obj);
            let findQuery = query.and(accessFilter, entry.query.query);
            if (findQuery.mayMatch(scope)) {
                callback(secContext, entry.client, rootPath, path, entry.query.key, entry.query.query);
                let q = new recoil.db.Query();
                reader.readObjects(
                    readContext, baseTable, q.and(entry.query.query, q.eq(q.field(baseTable.info.pk), q.val(add.path().lastKeys()[0]))),
                    null, function(err, results) {
                        if (!err && results.length === 1) {
                            if (baseTable) {
                                let oMap = new aurora.db.Notify.ObjectMap(baseTable, me.map_, /** @type {?} */ (entry));
                                oMap.addObject(results[0]);
                            }
                        }
                    });
            }
        }



    };
};
/**
 * @param {!aurora.db.Reader} reader
 * @param {recoil.db.ChangeSet.Change} change
 * @param {function(!aurora.db.access.SecurityContext, string, !recoil.db.ChangeSet.Path, !recoil.db.ChangeSet.Path, ?, recoil.db.Query)} callback
 */
aurora.db.Notify.prototype.forEachEffected = function(reader, change, callback) {
    // to get the root path find the first path with a key
    // fix up the id types in path
    let items = aurora.db.Notify.fixPath(change.path()).items();

    let rootItems = [];
    for (let i = 0; i < items.length; i++) {
        rootItems.push(items[i]);
        if (items[i].keys().length > 0) {
            break;
        }

    }

    let rootPath = new recoil.db.ChangeSet.Path(rootItems);
    let todoAddQueries = new goog.structs.AvlTree(recoil.util.object.compareKey);
    let me = this;

    if (change instanceof recoil.db.ChangeSet.Add && change.path().size() == rootPath.size()) {
        // only base items adds need to be added to the pathmap and may cause queries to update
        // todo construct the table query scope
        // todo this is ineffecient since it has to run through each client that is registered to the root scope
        let add = /** @type {!recoil.db.ChangeSet.Add} */ (change);
        let entry = this.addMap_.findFirst({key: rootPath.unsetKeys()});
        if (entry) {
            let columnSets = entry.columns;
            let obj = me.addToObject(add);
            columnSets.inOrderTraverse(function(colEntry) {

                let colMap = aurora.db.Notify.makeColMap_(obj, colEntry.key);
                let lookups = colEntry.lookups.findFirst({key: colMap});
                if (lookups) {
                    lookups.entries.forEach(me.notifyAddEntry_(reader, add, rootPath, callback));
                }
            });

        }
        return;

    }



    let found = this.map_.get(['path'], {path: rootPath});

    let isDelete = change instanceof recoil.db.ChangeSet.Delete;

    found.forEach(function(entry) {

        let context = me.contexts_[entry.client];
        if (context) {
            callback(context, entry.client, rootPath, entry.path, entry.query.key, entry.query.query);
        }
    });
};

/**
 * prints for debugging
 */
aurora.db.Notify.prototype.print = function() {
    this.map_.print();
};
/**
 * @constructor
 * @param {aurora.db.schema.TableType} table
 * @param {!recoil.structs.MultiKeyMap} map
 * @param {{client:string,query:{key:?,query:?}}} entry
 */
aurora.db.Notify.ObjectMap = function(table, map, entry) {
    this.basePath_ = recoil.db.ChangeSet.Path.fromString(table.info.path);
    this.table_ = table;
    this.map_ = map;
    this.entry_ = entry;
};


/**
 * @param {?} object
 */
aurora.db.Notify.ObjectMap.prototype.addObject = function(object) {
    let keys = this.table_.info.keys;
    if (keys) {

        let path = this.basePath_.setKeys(keys, keys.map(function(k) {return object[k];}));
        let pathEntry = goog.object.clone(this.entry_);
        pathEntry.path = path;
        let pathClients = this.map_.add(pathEntry);
    }


};

/**
 * @constructor
 * @param {!aurora.db.Authenticator} authenticator
 */
aurora.db.Coms = function(authenticator) {
    let me = this;
    aurora.db.Coms.instance = me;
    this.log_ = aurora.log.createModule('DBCOMS');
    this.async_ = require('async');
    this.authenticator_ = authenticator;
    /**
     * @type {aurora.db.Reader}
     */
    let reader = null;
    this.reader_ = null;
    let secName = aurora.db.schema.tables.sec.permissions.info.name;
    let serializer = new aurora.db.Serializer();
    // root path -> client
    this.notifies_ = new aurora.db.Notify();

    aurora.startup.doOnceStarted(function() {
        reader = new aurora.db.sql.Reader(aurora.db.Pool.getDefault());
        me.reader_ = reader;
        aurora.SystemSettings.instance.update(reader);
        me.writer_ = new aurora.db.sql.ChangeWriter(aurora.db.schema, reader);
    });

    /**
     * @private
     * @type {!aurora.websocket.Channel}
     */
    this.channel_ = authenticator.getChannel(aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA, function(e, secContext) {
        let action = e && e.data && e.data['command'];
        me.log_.info('recieve request', action, e.connection['remoteAddress']);
        let token = e.token;
        me.notifies_.updateClientContext(e.clientId, secContext);
        try {
            if (action === 'get') {
                me.doGet_(reader, e, secContext);
            }
            else if (action === 'set') {
                me.doChanges_(reader, e, secContext);
            }
            else if (action === 'action') {
                let path = e.data['path'];

                let action = aurora.db.schema.actionMap[path];
                if (action) {
                    let response = {'command': 'action', 'id': e.data['id']};
                    if (action.access) {
                        if (!action.access(secContext, 'r')) {
                            response['error'] = 'Access Denied';
                            me.log_.warn('Action Access Denied', path);
                            me.channel_.send(response, e.clientId);
                            return;
                        }
                        if (!reader) {
                            me.log_.warn('Reader not initialized', path);
                            return;
                        }

                        let inputs = e.data['inputs'];
                        let expectedInputs = action.inputs || [];
                        if (action.arrayParams && expectedInputs.length === 0) {
                            inputs = [];
                        }


                        let responseHandler = function(err, outputs) {
                            if (err) {
                                response['error'] = err;
                            }
                            else {
                                response['outputs'] = outputs;
                            }
                            me.channel_.send(response, e.clientId);
                        };

                        if (action.arrayParams) {
                            if (!(inputs instanceof Array)) {
                                response['error'] = 'Invalid Parameters';
                                me.channel_.send(response, e.clientId);
                                return;
                            }
                            action.func(this, secContext, reader, inputs, responseHandler);
                        }
                        else {
                            if (recoil.util.map.size(inputs) !== expectedInputs.length) {
                                response['error'] = 'Unexpected number of parameter expected ' + expectedInputs.length + ' got ' + recoil.util.map.size(inputs);
                                console.log('inputs', e.data, expectedInputs);
                                me.log_.warn(response['error']);
                                me.channel_.send(response, e.clientId);
                                return;
                            }
                            let convertType = function(expected, val) {
                                if (expected[0] === '?' && val == null) {
                                    return null;
                                }

                                try {
                                    if ((expected === 'bigint' || expected === '?bigint') && val != null) {
                                        return BigInt(val);
                                    }
                                }
                                catch (e) {
                                    return null;
                                }
                                return val;
                            };
                            let checkType = function(expected, actual) {
                                if (expected[0] === '?') {
                                    if (actual == null) {
                                        return true;
                                    }
                                    expected = expected.substring(1);
                                }
                                if (actual == null) {
                                    return false;
                                }

                                if (expected == 'number' || expected === 'string') {
                                    return typeof(actual) === expected;
                                }
                                return true;
                            };
                            let args = [];

                            console.log("parsing inputs");
                            for (let i = 0; i < expectedInputs.length; i++) {

                                try {
                                    let expected = expectedInputs[i];
                                    if (!inputs.hasOwnProperty(expected.name)) {
                                        response['error'] = 'Missing parameter ' + expected.name;
                                        me.log_.warn(response['error']);
                                        me.channel_.send(response, e.clientId);
                                        return;
                                    }
                                    let val = convertType(expected.type, inputs[expected.name]);

                                    if (!checkType(expected.type, val)) {
                                        response['error'] = 'Invalid type for parameter ' + expected.name;
                                        me.log_.warn(response['error']);
                                        me.channel_.send(response, e.clientId);
                                        return;
                                    }

                                    args.push(val);
                                }
                                catch (e) {
                                    me.log_.warn('Failed to deserialize param');
                                    response['error'] = 'Invalid type for parameter ' + e;
                                    me.channel_.send(response, e.clientId);
                                    return;
                                }

                            }
                            let allArgs = [me, secContext, reader].concat(args);
                            if (action.async) {

                                allArgs.push(e);
                                action.func.apply(e, allArgs)
                                    .then((outputs) => responseHandler(null, outputs))
                                    .catch((err) => responseHandler(aurora.db.Coms.fixError(err), []));
                                
                            }
                            else {
                                action.func.apply(e, allArgs.concat([responseHandler, e]));
                            }
                        }

                    }
                    else {
                        me.log_.error('No access rights specified on action', path);
                    }

                }
                else {
                    me.log_.error('Unknown action', path);
                }

            }
            else if (action === 'stop') {
                let name = e.data['name'];
                let queryIn = e.data['query'];
                let optionsIn = e.data['options'];

                var query = {name: name, query: queryIn, options: optionsIn};
                me.notifies_.removeQuery(e.clientId, query);
            }
            else {
            // todo check permission filters
                me.log_.error('got unknown command', action);
            }
        }
        catch (e) {
            me.log_.error('Error processing request', e);
        }

    }, function(token, clientid) {
        me.notifies_.removeClient(clientid);
    });
    this.setupUpload_();
    this.setupDownload_();

};

/**
 * @param {Object} object
 * @param {!recoil.db.ChangeSet.Path} basePath
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {boolean=} opt_validOnly returns true if the item is valid is null
 * @return {?}
 */
aurora.db.Coms.getSubObject_ = function(object, basePath, path, opt_validOnly) {
    let pathItems = path.items();
    let idx = basePath.size();
    let keysEqual = function(pItem, object) {
        let names = pItem.keyNames();
        let vals = pItem.keys();
        for (let i = 0; i < names.length; i++) {
            let name = names[i];
            if (!recoil.util.isEqual(object[name], vals[i])) {
                return false;
            }
        }
        return true;

    };
    if (idx > pathItems.length) {
        return null;
    }
    let getItemInList = function(item, object, path) {


        let tblT = aurora.db.schema.getTableByName(path);
        if (tblT) {
            if (!object) {
                return null;
            }
            let found = null;
            if (object instanceof Array) {
                for (var j = 0; j < object.length; j++) {
                    if (keysEqual(item, object[j])) {
                        found = object[j];
                        break;
                    }
                }
            }
            else if (object instanceof Object) {
                if (keysEqual(item, object)) {
                    found = object;
                }
            }
            if (!found) {
                return null;
            }
            return found;
        }
        return object;
    };
    // if the first element contains keys but the base path does traverse item to find the correct one
    if (basePath.last().keys().length === 0 && pathItems[idx - 1].keys().length > 0) {
        object = getItemInList(pathItems[idx - 1], object, basePath);
    }
    let curPath = basePath;
    for (var pathIndex = idx; object && pathIndex < pathItems.length; pathIndex++) {
        let item = pathItems[pathIndex];
        curPath = curPath.append(item);
        // for changes like sets we may not find a table
        if (item.keys().length > 0) {
            object = getItemInList(item, object[item.name()], curPath);
        }
        else {
            object = object[item.name()];
        }

    }
    if (opt_validOnly && pathIndex === pathItems.length) {
        return true;
    }

    return object;

};
/**
 * @param {!aurora.db.schema.TableType} baseTable
 * @param {?} object
 * @param {!recoil.db.ChangeSet.Change} change
 * @return {boolean}
 */
aurora.db.Coms.doesChangeApplyToObject_ = function(baseTable, object, change) {
    let obj = aurora.db.Coms.getSubObject_(object, recoil.db.ChangeSet.Path.fromString(baseTable.info.path), /** @type {!recoil.db.ChangeSet.Path}*/ (aurora.db.Notify.fixPath(change.path())), true);
    return obj != null;
};

/**
 * checks the security on the change so we can make sure its ok
 * @param {!goog.structs.AvlTree<{key: ?, context: Object, clientId:string, changes:!Array<!recoil.db.ChangeSet.Change>}>} sendClients this will add
 * @param {?} key the key used to work out the table
 * @param {!recoil.db.Query} query the query return results for the table
 * @param {string} clientId
 * @param {!aurora.db.access.SecurityContext} secContext the security context of client
 * @param {!aurora.db.schema.TableType} baseTable
 * @param {recoil.db.Query} accessFilter
 * @param {!Array<!recoil.db.ChangeSet.Path>} basePaths
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes the changes applicable for this query
 * @param {function()} callback called when done
 */
aurora.db.Coms.prototype.getSendableClients_ = function(sendClients, key, query, clientId, secContext, baseTable, accessFilter, basePaths, changes, callback) {

    let reader = this.reader_;
    if (!reader) {
        callback();
        return;
    }

    let newChanges = [];

    // deletes are just applicable they will not be in the database
    changes.forEach(function(change) {
        if (change instanceof recoil.db.ChangeSet.Delete) {
            sendClients.safeFind({clientId: clientId, key: key, context: secContext, changes: []}).changes.push(change);

        }
        else {
            newChanges.push(change);
        }
    });
    if (newChanges.length == 0) {
        callback();
        return;
    }
    changes = newChanges;
    let prefixLen = baseTable.info.path.split('/').length - 1;
    let columnFilters = changes.map(function(change) {
        let path = change.path().toStringArray();

        return {prefix: path.slice(prefixLen), result: true};
    });
    columnFilters.push({all: true, result: false});

    let onlyPath = new recoil.db.QueryOptions({columnFilters: columnFilters});
    let q = new recoil.db.Query();

    let basePathKeys = basePaths.map(function(basePath) {return q.val(basePath.last().keys()[0]);});
    let context = aurora.db.Coms.makeReadContext(secContext);

    //
    // we are not going to read deletes so

    reader.readObjects(
        context, baseTable, q.and(query, q.isIn(query.field(baseTable.info.pk), basePathKeys)),
        accessFilter,
        function(err, results) {
            if (!err) {
                // check if path exists in the results to see if path exists in objects if so we need to the update

                for (var i = 0; i < results.length; i++) {
                    for (let j = 0; j < changes.length; j++) {

                        let change = changes[j];

                        if (aurora.db.Coms.doesChangeApplyToObject_(baseTable, results[i], change)) {
                            let secureChange = change.filter(function(path) {
                                let tbl = aurora.db.schema.getTableByName(path);
                                if (tbl) {
                                    return aurora.db.schema.hasAccess(secContext, path, 'r');
                                }
                                try {

                                    let meta = aurora.db.schema.getMetaByPath(path.pathAsString());
                                    if (meta.type === 'password') {
                                        return false;
                                    }
                                }
                                catch (e) {
                                    // if the path doesn't exist then it is a internally made up path like file attributes so
                                    // for now its ok check the parent
                                    return aurora.db.schema.hasAccess(secContext, path.parent(), 'r');
                                }

                                return aurora.db.schema.hasAccess(secContext, path, 'r');
                            });
                            if (secureChange) {
                                // it would be great just to send the change that the client was interested in but
                                // for now will just resend the query that the change effected its simpler and safer
                                // and will do for now, it deals with things like queries that filter limit options
                                sendClients.safeFind({clientId: clientId, key: key, context: secContext, changes: []}).changes.push(secureChange);
                            }

                            break;
                        }
                    }
                }

            }

            callback();
        }, onlyPath);

};
/**
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes
 * @param {Object<string,boolean>} exclude a map of client ids not to send to
 * @param {function()=} opt_done
 */
aurora.db.Coms.prototype.notifyListeners = function(changes, exclude, opt_done) {
    let reader = this.reader_;
    let done = opt_done || function() {};
    if (!reader) {
        done();
        return;
    }
    let async = this.async_;
    let sendClients = new goog.structs.AvlTree(recoil.util.object.compare);

    let me = this;
    let readObjectQueue = async.queue(function(data, callback) {
        if (data.done) {
            let todo = sendClients.getCount();
            if (todo == 0) {
                if (opt_done) {
                    opt_done();
                }
            }
            else {
                sendClients.inOrderTraverse(function(info) {
                    me.doGetHelper_(info.clientId, null, reader, info.context, info.key.name, info.key.query, info.key.options, function() {
                        todo--;
                        if (todo === 0 && opt_done) {
                            opt_done();
                        }
                    });
                });

            }
            return;
        }
        let baseTable = aurora.db.schema.getTableByName(data.basePaths[0]);
        if (!baseTable && baseTable.info.accessFilterFunc) {
            return;
        }


        let accessFilter = baseTable.info.accessFilter(data.context);

        // we have to re-read for security reasons
        // we may need to add the path to the notifies
        let query = data.query;
        // todo we should really merge this with the other options since something like a limit would mean we shouldn't get
        // the value although the limit wouldn't work since we lookup by key anyway just send it or perhaps not they are just
        // global lookups so shouldn't really matter
        me.getSendableClients_(sendClients, data.key, data.query, data.clientId, data.context, baseTable, accessFilter, data.basePaths, data.changes, callback);

    });

    // todo currently we add a top level item or update an item so it now matches this will not update
    // notify interested queries

    // todo is a map of queries -> clients
    let todo = new goog.structs.AvlTree(recoil.util.object.compareKey);



    changes.forEach(function(change) {
        me.notifies_.forEachEffected(/** @type {!aurora.db.sql.Reader}*/ (reader), change, function(secContext, clientid, basePath, path, key, query) {
            // if the client doesn't have access to read the field don't send
            if (!aurora.db.schema.hasAccess(secContext, change.path(), 'r')) {
                return;
            }
            let clientMap = todo.safeFind({key: key, query: query, clients: {}}).clients;

            let clientInfo = recoil.util.map.safeGet(clientMap, clientid, {context: secContext, basePaths: [], changes: []});
            clientInfo.changes.push(change);
            clientInfo.basePaths.push(basePath);
            // key is the json object to used to send data back for the query

        });

        if (change instanceof recoil.db.ChangeSet.Delete) {
            me.notifies_.removePath(change.path());
        }
    });

    todo.inOrderTraverse(function(item) {
        for (let clientId in item.clients) {
            if (exclude[clientId]) {
                continue;
            }

            let clientInfo = item.clients[clientId];
            readObjectQueue.push({context: clientInfo.context, clientId: clientId, basePaths: clientInfo.basePaths, key: item.key, query: item.query, changes: clientInfo.changes});
        }
    });
    readObjectQueue.push({done: true});
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
    let settingPath = recoil.db.ChangeSet.Path.fromString(aurora.db.schema.tables.base.system_settings.info.path);
    this.writer_.applyChanges(changes, secContext, function(result) {
        me.channel_.send({'command': 'set', 'id': e.data['id'], 'results': result}, e.clientId);
        if (!result.error) {
            let myClient = {};
            myClient[e.clientId] = true;
            // update the id of the top level adds

            let notifyChanges = [];
            let systemSettingsChanged = false;

            for (let i = 0; i < changes.length; i++) {
                let change = changes[i];
                // adds need their ids updated
                if (change instanceof recoil.db.ChangeSet.Add) {
                    // set the paths for all hc
                    change = change.setPathKeys([result[i].id]);
                }
                if (settingPath.isAncestor(change.path())) {
                    systemSettingsChanged = true;
                }

                notifyChanges.push(change);
            }
            if (systemSettingsChanged) {
                aurora.SystemSettings.instance.update(reader, secContext ? secContext['@user'] : 'unknown');
            }

            me.notifyListeners(notifyChanges, myClient);

        }

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
            if (meta.isList) {
                obj[col].forEach(function(v) {
                    aurora.db.Coms.traverseObject_(aurora.db.schema.getTable(meta.key), v, callback);
                });
            }
            else if (meta.isObject) {
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
    let name = e.data['name'];
    let queryIn = e.data['query'];
    let optionsIn = e.data['options'];
    let id = e.data['id'];
    this.doGetHelper_(e.clientId, id, reader, secContext, name, queryIn, optionsIn);
};

/**
 * @private
 * @param {string} clientId
 * @param {?string} id
 * @param {aurora.db.Reader} reader
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {string} name
 * @param {?} queryIn
 * @param {?} optionsIn
 * @param {function()=} opt_done
 */
aurora.db.Coms.prototype.doGetHelper_ = function(clientId, id, reader, secContext, name, queryIn, optionsIn, opt_done) {
    let secName = aurora.db.schema.tables.sec.permissions.info.name;
    let me = this;
    let response = {'command': 'full', 'id': id, 'name': name, 'query': queryIn, 'options': optionsIn, 'value': null};
    let serializer = new aurora.db.Serializer;
    let context = aurora.db.Coms.makeReadContext(secContext);

    let start = new Date().getTime();
    if (name === secName) {
        // this is special every one can request what permissions they have
        me.channel_.send({'command': 'full', 'id': id, 'name': name, 'query': queryIn, 'options': optionsIn, 'value': secContext}, clientId);
        if (opt_done) {
            opt_done();
        }
        return;
    }
    if (!reader) {
        me.log_.error('error no reader');
        response['value-error'] = 'no reader';
        me.channel_.send(response, clientId);
        if (opt_done) {
            opt_done();
        }
        return;
    }
    let secInfo = me.doSecurityCheck_(clientId, name, secContext, 'r', response);
    if (secInfo) {
        let query = recoil.db.Query.deserialize(queryIn, serializer);
        let options = recoil.db.QueryOptions.deserialize(optionsIn);
        reader.readObjects(
            context, secInfo.table, query,
            secInfo.accessFilter,
            function(err, data) {
                if (err) {
                    me.log_.error('error reading data', queryIn, optionsIn, err);
                    response['value-error'] = err;
                }
                else {
                    if (options && !options.isCount()) {
                        let notifyQuery = me.notifies_.addQuery(clientId, {name: name, query: queryIn, options: optionsIn}, secInfo.table, query, secInfo.accessFilter, secContext, context);
                        data = data.filter(function(dataItem) {
                            let objContext = /** @type {!aurora.db.access.SecurityContext}*/ (goog.object.clone(secContext));
                            objContext.object = dataItem;
                            notifyQuery.addObject(dataItem);
                            if (secInfo.table.info.access && !secInfo.table.info.access(objContext, 'r')) {
                                return false;
                            }


                            aurora.db.Coms.traverseObject_(secInfo.table, dataItem, function(tbl, parent, value, colName, colMeta) {
                                if (colMeta.type === 'password') {
                                    parent[colName] = null;
                                }

                                if (tbl.info.access && !tbl.info.access(objContext, 'r')) {
                                    delete parent[colName];
                                    return false;
                                }
                                if (colMeta.access && !colMeta.access(objContext, 'r')) {
                                    delete parent[colName];
                                    return false;
                                }
                                return true;
                            });
                            return true;
                        });
                    }
                    response['value'] = data;
                    me.log_.info('performance', queryIn, optionsIn, (new Date().getTime() - start) / 1000);
                    me.log_.debug('read data', queryIn, optionsIn, data, (new Date().getTime() - start) / 1000);
                }
                me.channel_.send(response, clientId);
                if (opt_done) {
                    opt_done();
                }

            }, options);
    }
    else {
        me.log_.error('unable to get security context', response['error-value']);
        response['value-error'] =  'unable to get security context';
        me.channel_.send(response, clientId);

        if (opt_done) {
            opt_done();
        }
    }

};

/**
 * @param {!aurora.db.Reader} reader
 * @param {!Object} context
 * @param {multiparty.Part} part
 * @param {function(?, Object)} done
 */
aurora.db.Coms.prototype.insertFileIntoDb_ = function(reader, context, part, done) {

    let log = this.log_;
    let async = this.async_;
    let fileT = aurora.db.schema.tables.base.file_storage;
    let fileObject = {created: new Date().getTime(), user: context.userid , name: part.filename, size: 0, parts: []};
    reader.insert(
        context, fileT, fileObject, function(err, insertRes) {
            if (err) {
                log.error('Unable to insert file', part.filename);
                part.resume();

                done(err, null);
                return;
            }
            const MAX_BLOCK = 64000;
            let buffer = Buffer.alloc(MAX_BLOCK);
            let written = 0;
            let partError = null;
            let pos = 1;
            let size = 0;

            let partInsertQueue = async.queue(function(data, callback) {
                if (data.done) {
                    callback();
                    if (!partError) {
                        let query = new recoil.db.Query();
                        fileObject.size = size;
                        reader.updateOneLevel(
                            context, fileT, {size: size}, query.eq(query.val(insertRes.insertId), query.field(fileT.cols.id)),
                            function(err) {
                                partError = err;
                                if (!err) {
                                    fileObject.id = insertRes.insertId + '';
                                }
                                done(err, fileObject);
                            });

                        }
                    else {
                        done(partError, null);
                    }
                    return;
                }
                size += data.buffer.length;
                reader.insert(context, fileT.parts, {order: pos++, fileid: insertRes.insertId, data: data.buffer}, function(err) {
                    if (err) {
                        console.log('part error', err);
                    }
                    partError = partError || err;
                    callback();
                });
            }, 1);

            part.on('end', function() {
                if (written > 0) {
                    let toWrite = Buffer.alloc(written);
                    buffer.copy(toWrite, 0, 0, written);
                    partInsertQueue.push({buffer: toWrite});
                }
                partInsertQueue.push({done: true});
            });

            part.on('error', function(err) {});

            part.on('data', function(data) {
                if (!partError) {
                    let dataPos = 0;
                    while (dataPos < data.length) {
                        let endPos = Math.min(data.length, dataPos + MAX_BLOCK - written);
                        data.copy(buffer, written, dataPos, endPos);
                        written += endPos - dataPos;
                        if (written === MAX_BLOCK) {
                            partInsertQueue.push({buffer: buffer});
                            buffer = Buffer.alloc(MAX_BLOCK);
                            written = 0;
                        }
                        dataPos = endPos;
                    }

                }
                //console.log('part data', data);
            });
        }
    );

};

/**
 * converts a url path to a ChangeSet path, this will also validate the
 * path exists in the schema, if it doesn't returns null
 * @param {string} path
 * @param {boolean=} opt_item if true will assume the last value has a key
 * @return {?{path: !recoil.db.ChangeSet.Path,
              base:recoil.db.ChangeSet.Path,keyValues:!Array<{col:!recoil.structs.table.ColumnKey,value:?}>,
              baseTable:!aurora.db.schema.TableType, table:!aurora.db.schema.TableType, parentTable: !aurora.db.schema.TableType, fileField:?string}}
 */
aurora.db.Coms.prototype.getUrlPathInfo = function(path, opt_item) {
    let parts = path.split('/').map(function(p) {return decodeURIComponent(p);});
    // the last part the path is the keys and should be an array to check
    let keyParts = [];
    if (parts.length > 0 && parts[parts.length - 1][0] === '[') {
        // remove the keys part
        let last = parts.pop();
        try {
            last = last.substring(1, last.length - 1);
            keyParts = last.split(',').map(function(v) { return BigInt(v);});
        }
        catch (e) {
            // invalid path
            return null;
        }
    }
    {
        let path = aurora.db.schema.getTablePath(parts.join('/'), keyParts, opt_item);


        if (!path) {
            return null;
        }
        let base = aurora.db.schema.getBasePath(path);
        if (!base) {
            return null;
        }
        let keyValues = [];
        let tbl = aurora.db.schema.getTableByName(base);
        let keys = base.last();
        for (let i = 0; i < keys.keys().length; i++) {
            keyValues.push({col: tbl.meta[keys.keyNames()[i]].key, value: keys.keys()[i]});
        }
        let insertTable = aurora.db.schema.getTableByName(path);
        let parentTable = aurora.db.schema.getTableByName(path.parent());

        let fileField = null;

        for (let k in insertTable.meta) {
            if (insertTable.meta[k].type == 'file') {
                fileField = k;
            }
        }

        return {
            path: path,
            base: base,
            baseTable: /** @type {!aurora.db.schema.TableType} */ (tbl),
            parentTable: /** @type {!aurora.db.schema.TableType} */ (parentTable),
            table: /** @type {!aurora.db.schema.TableType} */ (insertTable),
            fileField: fileField,
            keyValues: keyValues
        };
    }

};

/**
 * @param {!aurora.db.Reader} reader
 * @param {!Object} context
 * @param {http.IncomingMessage} request,
 * @param {http.ServerResponse} response
 * @return {!Promise<!Array<Object>>}
 */
aurora.db.Coms.prototype.doUpload_ = async function (reader, context, request, response) {
    const multiparty = require('multiparty');
    let form = new multiparty.Form();
    let log = this.log_;
    let me = this;
    return new Promise((resolve, reject) => {
        var filename = undefined;
        let partError = null;
        let insertedList = [];
        let async = this.async_;
        let queue = async.queue(function(data, callback) {
            if (data.part) {
                me.insertFileIntoDb_(reader, context, data.part, function (err, inserted) {
                    if (err) {
                        partError = partError || err;
                    }
                    else {
                        insertedList.push(inserted);
                    }
                    callback();
                });
                
            }
            else if (data.done) {
                if (partError) {
                    reject(partError);
                }
                else {
                    resolve(insertedList);
                }
            }
        });
        form.on('part', function(part) {
            if (!part.filename) {
                // filename is not defined when this is a field and not a file
                // so ignore the field's content
                part.resume();
            } else {
                queue.push({part: part});
            }
            // handle a "part" error
        });
        form.on('error', function(err) {
            log.error('File upload error,', err);
            partError = partError || err;
            queue.push({done: true});
        });
        
        form.on('close', function () {
            queue.push({done: true});
        });
        form.parse(request);
    });
};

/**
 * follows the path down the object to find the element
 * @param {Object} object
 * @param {recoil.db.ChangeSet.Path} basePath
 * @param {recoil.db.ChangeSet.Path} path
 * @return {?}
 */

aurora.db.Coms.prototype.findElement = function (object, basePath, path) {
    if (!basePath || !path) {
        return null;
    }
    return aurora.db.Coms.getSubObject_(object, basePath, path);
};

/**
 * sets up callback for uploads
 */
aurora.db.Coms.prototype.setupDownload_ = function () {
    const mime = require('mime');
    let log = this.log_;
    let me = this;
    const DOWNLOAD_URL = '/system/download';
    const DOWNLOAD_REGEXP = new RegExp('^' + DOWNLOAD_URL.replaceAll('/','\\/') + '\\/');
    let async = this.async_;
    aurora.http.addMidRequestCallback(
        DOWNLOAD_REGEXP,
        async (state) => {
            let response = state.response;
            let request = state.request;
            let urlInfo = me.getUrlPathInfo(request.url.substring(DOWNLOAD_URL.length), true);
            if (state.request.method === 'GET' && me.reader_ && urlInfo && urlInfo.fileField) {
                let reader = me.reader_;
                // we know we are handing it here maybe or deal with it in the security check\
                let context = await me.authenticator_.getPermissionsAsync(state.token, request.socket);
                if (!aurora.db.schema.hasAccess(context, urlInfo.path, 'r')) {
                    // we don't exist the user has no access
                    log.warn("File Download Access Denied for ", context.userid);
                    return undefined;
                }
                let readContext = aurora.db.Coms.makeReadContext(context);
                let object;
                try {
                    object = await reader.readObjectByKeyAsync(readContext, urlInfo.baseTable, urlInfo.keyValues, urlInfo.baseTable.info.accessFilter(context));
                } catch (err) {
                    return undefined;
                }
                let fileInfo = me.findElement(object, urlInfo.base, urlInfo.path);
                if (!fileInfo) {
                    return undefined;
                }
                        
                let fileT = aurora.db.schema.tables.base.file_storage;
                
                let fileId = fileInfo[urlInfo.fileField];                
                let headers = state.responseHeaders;
                    
                    
                headers.set('Content-Length', fileInfo.size);
                headers.set('Content-Type', mime.getType(fileInfo.name));
                headers.set('Accept-Ranges', 'bytes');
                headers.set('Cache-Control', 'no-cache, must-revalidate');
                headers.set('Content-Disposition', 'attachment; filename=' + JSON.stringify(fileInfo.name));
                
                headers.set('Last-Modified', new Date(fileInfo.created).toGMTString());
                response.writeHead(200, headers.toClient());
                
                // now read the parts but we need to read it piecewize otherwize it may be too big
                let query = new recoil.db.Query();
                reader.readLevel(context, fileT.parts, query.eq(fileT.parts.info.parentKey, query.val(fileId)), null, function (part, cb) {
                    response.write(part.data);
                    cb();
                }, function (err) {
                    if (err) {
                        me.log_.error('error reading file', err);
                        
                    }
                    response.end();
                });
                return false;
            }
            //
            return undefined;
        });
};
/**
 * @param {!Object} context
 * @return {!Object}
 */
aurora.db.Coms.makeReadContext = function (context) {
    return {'@userid': context.userid};
};

/**
 * sets up callback for uploads
 */
aurora.db.Coms.prototype.setupUpload_ = function () {
    let log = this.log_;
    let me = this;
    const UPLOAD_URL = '/system/upload';
    const UPLOAD_REGEXP = new RegExp('^' + UPLOAD_URL.replaceAll('/','\\/') + '\\/');
    let async = this.async_;
    aurora.http.addMidRequestCallback(
        UPLOAD_REGEXP,
        async function(state) {
            let response = state.response;
            let request = state.request;
            let resolveCalled = false;
            
            let urlInfo = me.getUrlPathInfo(request.url.substring(UPLOAD_URL.length));
            if (state.request.method !== 'POST' || !me.reader_ || !urlInfo || !urlInfo.fileField) {
                return undefined;
            }
                
            // we know we are handing it here maybe or deal with it in the security check
            let context = await me.authenticator_.getPermissionsAsync(state.token, request.socket);
            if (!aurora.db.schema.hasAccess(context, urlInfo.path, 'c')) {
                // we don't exist the user has no access
                log.warn("File Upload Access Denied for ", context.userid);
                return undefined;
            }
            let parentTable = aurora.db.schema.getTableByName(urlInfo.path.parent());
            let readContext = aurora.db.Coms.makeReadContext(context);
            
            const linkFileParts = async (reader, inserted, notifies, parentId) => {
                let template = {};
                let orderFields = {};
                for (var k in urlInfo.table.meta) {
                    let meta = urlInfo.table.meta;
                    if (meta.defaultVal !== undefined) {
                        template[k] = meta.defaultVal;
                    }
                    
                    
                }
                    
                if (parentId != null) {
                    template[urlInfo.table.info.parentKey.getName()] = parentId;
                }
                template['user'] = context.userid;
                for (let i = 0; i < inserted.length; i++) {
                    let insertedObj = inserted[i];
                    let obj = Object.assign({}, insertedObj, template);
                    obj[urlInfo.fileField] = insertedObj.id;
                    if (parentId == null) {
                        await reader.setMaxOrderAsync(readContext, urlInfo.table, obj);
                    }
                    let insertRes = await reader.insertAsync(readContext, urlInfo.table, obj);
                    obj[urlInfo.table.info.pk.getName()] = insertRes.insertId + '';
                    notifies.push(obj);
                }
            };
                    
                    // deal with inserting into table that we are a child of
            const childInsertHandler = async (reader, object, notifies) => {
                // we know we are dealing with the request now
                let insertEl = me.findElement(object, urlInfo.base, urlInfo.path.parent());
                if (!insertEl) {
                    return undefined;
                }
                let parentId = insertEl[urlInfo.parentTable.info.pk.getName()];
                let inserted = await me.doUpload_(reader, context, request, response);
                await linkFileParts(reader, inserted, notifies, parentId);
                return false;
            };
            
                let notifies = [];
            // check we have create access on the column we are adding to
            let res;
            try {
                res = await me.reader_.transactionAsyc(async (reader) => {
                    // check we can even see the row
                    if (parentTable) {
                        let obj = await reader.readObjectByKeyAsync(readContext, urlInfo.baseTable, urlInfo.keyValues, urlInfo.baseTable.info.accessFilter(context));
                        return await childInsertHandler(reader, obj, notifies);
                    }
                    else {
                        // this is a root table
                        let inserted = await me.doUpload_(reader, context, request, response);
                        await linkFileParts(reader, inserted, notifies, null);
                        return false;

                    }
                    
                });
                if (res === false) {
                    response.writeHead(200, {'content-type': 'text/plain'});
                    response.end('{}');
                    
                    notifies.forEach(function (obj) {
                        let table = urlInfo.table;
                        let path = urlInfo.path.setKeys([table.info.pk.getName()], [BigInt(obj[table.info.pk.getName()])]);
                        let fields = [];
                        //urlInfo.table.
                        for (let name in obj) {
                            if (name !==  table.info.pk.getName() && name != 'parts') {
                                fields.push(new recoil.db.ChangeSet.Set(path.appendName(name), null, obj[name]));
                            }
                        }
                        me.notifyListeners([new recoil.db.ChangeSet.Add(path, fields)], {});
                    });                    
                }
                return res;
                
            } catch (err) {
                log.error('Unable to upload file', err);
                response.writeHead(404, {'content-type': 'text/plain'});
                response.end('{}');
                return false;
            }

        });

};
/**
 * @private
 * @param {string} clientId
 * @param {string} name
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {string} opType one of c - create, r -read, u - update, d - delete
 * @param {Object} response
 *
 * @return {?{table:!aurora.db.schema.TableType,accessFilter:!recoil.db.Query}}
 */
aurora.db.Coms.prototype.doSecurityCheck_ = function(clientId, name, secContext, opType, response) {
    let me = this;

    let tbl = aurora.db.schema.getTableByName(name);
    if (!tbl) {
        response['error-value'] = 'Unable to find object ' + name;
        me.channel_.send(response, clientId);
        return null;
    }
    let accessFunc = tbl.info.access;
    let accessFilterFunc = tbl.info.accessFilter;
    if (!accessFunc || !accessFilterFunc) {
        response['error-value'] = 'Access control not specified on ' + name;
        me.channel_.send(response, clientId);
        return null;
    }

    if (!tbl.info.access(secContext, opType)) {
        response['error-value'] = 'Access Denied';
        me.channel_.send(response, clientId);
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
            if (meta.type === 'id' || meta.type === 'ref') {
                if (val) {
                    return new aurora.db.PrimaryKey(
                        val['db'] == undefined ? null : BigInt(val['db']),
                        val['mem'] == undefined ? null : BigInt(val['mem']));
                }
                else if (meta.type === 'ref') {
                    return null;
                }
                else {
                    return new aurora.db.PrimaryKey(null, null);
                }
            }
        }
    }
    return val;
};

/**
 * @param {?} err
 * @return {?}
 */
aurora.db.Coms.fixError = function (err) {
    if (err && err.response) {
        return err.response;
    }
    else if (err && err.message) {
        return err.message;
    }
    return err;
};
/**
 * @type {aurora.db.Coms} 
 */
aurora.db.Coms.instance = null;
