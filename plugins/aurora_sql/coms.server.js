goog.provide('aurora.db.Coms');

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
    this.contexts_ = {};
};

/**
 * @param {string} clientid
 * @param {!aurora.db.access.SecurityContext} context
 */
aurora.db.Notify.prototype.updateClientContext = function(clientid, context) {
    this.contexts_[clientid] = context;
};

/**
 * @param {string} clientid
 * @param {Object} key
 * @param {aurora.db.schema.TableType} table
 * @param {recoil.db.Query} query
 * @return {!aurora.db.Notify.ObjectMap}
 */
aurora.db.Notify.prototype.addQuery = function(clientid, key, table, query) {



    let entry = {query: {key: key, query: query}, client: clientid};
    this.map_.add(entry);
    let objectMap = new aurora.db.Notify.ObjectMap(table, this.map_, entry);
    this.map_.add(entry);
    return objectMap;

};

/**
 * @param {string} clientid
 * @param {?} key
 */
aurora.db.Notify.prototype.removeQuery = function(clientid, key) {
    let entry = {query: {key: key}, client: clientid};
    this.map_.removeIntersection(['query', 'client'], entry);
};

/**
 * @param {string} clientid
 */
aurora.db.Notify.prototype.removeClient = function(clientid) {
    this.map_.removeIntersection(['client'], {client: clientid});
    delete this.contexts_[clientid];
};


/**
 * @param {recoil.db.ChangeSet.Path} path
 * @param {function(!aurora.db.access.SecurityContext, string, !recoil.db.ChangeSet.Path, !recoil.db.ChangeSet.Path, ?, recoil.db.Query)} callback
 */
aurora.db.Notify.prototype.forEachEffected = function(path, callback) {
    // to get the root path find the first path with a key
    let items = path.items();
    let rootItems = [];
    for (let i = 0; i < items.length; i++) {
        rootItems.push(items[i]);
        if (items[i].keys().length > 0) {
            break;
        }

    }
    let rootPath = new recoil.db.ChangeSet.Path(rootItems);
    let found = this.map_.get(['path'], {path: rootPath});
    let me = this;
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
        me.writer_ = new aurora.db.sql.ChangeWriter(aurora.db.schema, reader);
    });

    /**
     * @private
     * @type {!aurora.websocket.Channel}
     */
    this.channel_ = authenticator.getChannel(aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA, function(e, secContext) {
        let action = e && e.data && e.data['command'];
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
                            action.func(secContext, reader, inputs, responseHandler);
                        }
                        else {
                            if (Object.keys(inputs).length !== expectedInputs.length) {
                                response['error'] = 'Unexpected number of parameter expected ' + expectedInputs.length + ' got ' + inputs.length;
                                me.channel_.send(response, e.clientId);
                                return;
                            }
                            let checkType = function(expected, actual) {
                                if (expected == 'number' || expected === 'string') {
                                    return typeof(actual) === expected;
                                }
                                return true;
                            };
                            let args = [];

                            for (let i = 0; i < expectedInputs.length; i++) {
                                let expected = expectedInputs[i];
                                if (!inputs.hasOwnProperty(expected.name)) {
                                    response['error'] = 'Missing parameter ' + expected.name;
                                    me.channel_.send(response, e.clientId);
                                    return;
                                }
                                if (!checkType(expected.type, inputs[expected.name])) {
                                    response['error'] = 'Invalid type for parameter ' + expected.name;
                                    me.channel_.send(response, e.clientId);
                                    return;
                                }
                                args.push(inputs[expected.name]);
                            }
                            action.func.apply(null, [secContext, reader].concat(args).concat([responseHandler]));
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
 * @return {?}
 */
aurora.db.Coms.getSubObject_ = function(object, basePath, path) {
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
    return object;

};
/**
 * @private
 * @param {recoil.db.ChangeSet.Change} change
 */
aurora.db.Coms.prototype.notifyListeners_ = function(change) {
    let reader = this.reader_;
    if (!reader) {
        return;
    }
    let async = this.async_;
    let sendClients = {};

    let me = this;
    let readObjectQueue = async.queue(function(data, callback) {
        if (data.done) {

            for (let clientId in sendClients) {
                let info = sendClients[clientId];
                me.doGetHelper_(clientId, reader, info.context, info.key.name, info.key.query, info.key.options);
            }
            return;
        }

        let baseTable = aurora.db.schema.getTableByName(data.basePath);
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
        let pathItems = change.path().items();
        let onlyPath = new recoil.db.QueryOptions({columnFilters: {prefix: change.path().toStringArray()}});
        reader.readObjects(
            data.context, baseTable, query.and(query, query.eq(query.field(baseTable.info.pk), query.val(data.basePath.last().keys()[0]))),
            accessFilter,
            function(err, results) {
                if (!err) {
                    // check if path exists in the results to see if path exists in objects if so we need to the update

                    for (var i = 0; i < results.length; i++) {
                        let object = aurora.db.Coms.getSubObject_(results[i], recoil.db.ChangeSet.Path.fromString(baseTable.info.path), change.path());
                        if (object != null) {
                            let secureChange = change.filter(function(path) {
                                try {
                                    let meta = aurora.db.schema.getMetaByPath(path.pathAsString());
                                    if (meta.type === 'password') {
                                        return false;
                                    }
                                }
                                catch (e) {
                                    // if the path doesn't exist then it is a internally made up path like file attributes so
                                    // for now its ok check the parent
                                    return aurora.db.schema.hasAccess(data.context, path.parent(), 'r');
                                }

                                return aurora.db.schema.hasAccess(data.context, path, 'r');
                            });
                            if (secureChange) {
                                // it would be great just to send the change that the client was interested in but
                                // for now will just resend the query that the change effected its simpler and safer
                                // and will do for now, it deals with things like queries that filter limit options
                                sendClients[data.clientid] = {change: secureChange, key: data.key, context: data.context};
                            }

                            break;
                        }
                    }

                }

                callback();
            }, onlyPath);
    });

    // todo currently we add a top level item or update an item so it now matches this will not update
    // notify interested queries
    this.notifies_.forEachEffected(change.path(), function(context, clientid, basePath, path, key, query) {
        // if the client doesn't have access to read the field don't send
        if (!aurora.db.schema.hasAccess(context, change.path(), 'r')) {
            return;
        }
        readObjectQueue.push({context, clientid, basePath, path, key, query});

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
    this.writer_.applyChanges(changes, secContext, function(result) {
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
    this.doGetHelper_(e.clientId, reader, secContext, name, queryIn, optionsIn);
};

/**
 * @private
 * @param {string} clientId
 * @param {aurora.db.Reader} reader
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {string} name
 * @param {?} queryIn
 * @param {?} optionsIn
 */
aurora.db.Coms.prototype.doGetHelper_ = function(clientId, reader, secContext, name, queryIn, optionsIn) {
    let secName = aurora.db.schema.tables.sec.permissions.info.name;
    let me = this;
    let response = {'command': 'full', 'name': name, 'query': queryIn, 'options': optionsIn, 'value': null};
    let serializer = new aurora.db.Serializer;
    let context = {'@userid': secContext.userid};

    let start = new Date().getTime();
    if (name === secName) {
        // this is special every one can request what permissions they have
        me.channel_.send({'command': 'full', 'name': name, 'query': queryIn, 'options': optionsIn, 'value': secContext}, clientId);
        return;
    }
    if (!reader) {
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
                    me.log_.debug('error reading data', queryIn, optionsIn, err);
                    response['value-error'] = err;
                }
                else {
                    if (options && !options.isCount()) {
                        let notifyQuery = me.notifies_.addQuery(clientId, {name: name, query: queryIn, options: optionsIn}, secInfo.table, query);
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
            }, options);
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
    let fileObject = {created: new Date().getTime(), user: context.userid, name: part.filename, size: 0, parts: []};
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
 * @param {function(?,Array<Object>)} done first param error, last param inserted file ids
 */
aurora.db.Coms.prototype.doUpload_ = function (reader, context, request, response, done) {
    let log = this.log_;
    let me = this;
    const multiparty = require('multiparty');
    var form = new multiparty.Form();
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
            done(partError, insertedList);
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
        function(state, done) {
            let response = state.response;
            let request = state.request;
            let urlInfo = me.getUrlPathInfo(request.url.substring(DOWNLOAD_URL.length), true);
            if (state.request.method === 'GET' && me.reader_ && urlInfo && urlInfo.fileField) {
                let reader = me.reader_;
                // we know we are handing it here maybe or deal with it in the security check
                let doneCalled = false;

                me.authenticator_.getPermissions(state.token, request.socket, function (context) {
                    if (!aurora.db.schema.hasAccess(context, urlInfo.path, 'r')) {
                        // we don't exist the user has no access
                        done(undefined);
                        log.warn("File Download Access Denied for ", context.userid);
                        return;
                    }
                    reader.readObjectByKey(context, urlInfo.baseTable, urlInfo.keyValues, urlInfo.baseTable.info.accessFilter(context), function (err, object) {
                        let fileInfo = me.findElement(object, urlInfo.base, urlInfo.path);
                        console.log("about to do read", fileInfo);
                        if (err || !fileInfo) {
                            done(undefined);
                            return;
                        }
                        done(false);
                        
                        let fileT = aurora.db.schema.tables.base.file_storage;

                        let fileId = fileInfo[urlInfo.fileField];

                        let request = state.request;
                        let headers = state.responseHeaders;

                        console.log("name", fileInfo.name);
                        
                        headers.set('Content-Length', fileInfo.size);
                        headers.set('Content-Type', mime.getType(fileInfo.name));
                        headers.set('Accept-Ranges', 'bytes');
                        headers.set('Cache-Control', 'no-cache, must-revalidate');
                        headers.set('Content-Disposition', 'attachment; filename=' + JSON.stringify(fileInfo.name));
                        
                        headers.set('Last-Modified', new Date(fileInfo.created).toGMTString());
                        response.writeHead(200, headers.toClient());
                        
                        // now read the parts but we need to read it piecewize otherwize it may be too big
                        let query = new recoil.db.Query();
                        console.log("about to do read");
                        reader.readLevel(context, fileT.parts, query.eq(fileT.parts.info.parentKey, query.val(fileId)), null, function (part, cb) {
                            console.log("got part", part);
                            response.write(part.data);
                            cb();
                        }, function (err) {
                            if (err) {
                                me.log_.error('error reading file', err);

                            }
                            console.log("done");
                            response.end();
                        });
                        
                    });
                                            
                });
                return aurora.http.REQUEST_ASYNC;
            }
            //
            return undefined;
        });
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
        function(state, done) {
            let response = state.response;
            let request = state.request;
            let urlInfo = me.getUrlPathInfo(request.url.substring(UPLOAD_URL.length));
            if (state.request.method === 'POST' && me.reader_ && urlInfo && urlInfo.fileField) {
                let reader = me.reader_;
                // we know we are handing it here maybe or deal with it in the security check
                let doneCalled = false;

                me.authenticator_.getPermissions(state.token, request.socket, function (context) {
                    if (!aurora.db.schema.hasAccess(context, urlInfo.path, 'c')) {
                        // we don't exist the user has no access
                        doneCalled = true;
                        done(undefined);
                        log.warn("File Upload Access Denied for ", context.userid);
                        return;
                    }
                    let notifies = [];
                    // check we have create access on the column we are adding to
                    reader.transaction(function (reader, transDone) {
                        // check we can even see the row
                        reader.readObjectByKey(context, urlInfo.baseTable, urlInfo.keyValues, urlInfo.baseTable.info.accessFilter(context), function (err, object) {
                            // we know we are dealing with the request now
                            doneCalled = true;
                            let insertEl = me.findElement(object, urlInfo.base, urlInfo.path.parent());
                            if (err || !insertEl) {
                                done(undefined);
                                return;
                            }
                            done(false);
                            console.log("insert el", insertEl, urlInfo.path.toString(), urlInfo.table.info.parentKey.getName());
                                
                            let parentId = insertEl[urlInfo.parentTable.info.pk.getName()];
                            
                            me.doUpload_(reader, context, request, response, function (err, inserted) {
                                if (!err) {
                                    // insert the row in the referencing table so we can access the file
                                    let template = {};
                                    for (var k in urlInfo.table.meta) {
                                        let meta = urlInfo.table.meta;
                                        if (meta.defaultVal !== undefined) {
                                            template[k] = meta.defaultVal;
                                        }
                                    }
                                    template[urlInfo.table.info.parentKey.getName()] = parentId;
                                    
                                    async.eachSeries(inserted, function (insertedObj, callback) {
                                        let obj = Object.assign({}, insertedObj, template);
                                        obj[urlInfo.fileField] = insertedObj.id;
                                        reader.insert(context, urlInfo.table, obj, function (err, insertRes) {
                                            if (!err) {
                                                obj[urlInfo.table.info.pk.getName()] = insertRes.insertId + '';
                                                notifies.push(obj);
                                            }
                                            callback(err);
                                        });
                                    }, function (err) {
                                        transDone(err);
                                    });
                                }
                                else {
                                    transDone(err);
                                }
                                
                            });
                        });
                    }, function (err) {
                        if (!doneCalled) {
                            doneCalled = true;
                            done(false);
                        }
                        response.writeHead(err ? 422 : 200, {'content-type': 'text/plain'});
                        response.end('{}');
                        if (!err) {
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
                                me.notifyListeners_(new recoil.db.ChangeSet.Add(path, fields));
                            });
                        }
                    });
                });
                return aurora.http.REQUEST_ASYNC;
            }
            //
            return undefined;
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
            if (meta.type === 'id') {
                return new aurora.db.PrimaryKey(
                    val['db'] == undefined ? null : BigInt(val['db']),
                    val['mem'] == undefined ? null : BigInt(val['mem']));
            }
        }
    }
    return val;
};

