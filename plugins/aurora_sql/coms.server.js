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
    this.authenticator_ = authenticator;
    /**
     * @type {aurora.db.Reader}
     */
    let reader = null;
    this.reader_ = null;
    let secName = aurora.db.schema.tables.sec.permissions.info.name;
    let serializer = new aurora.db.Serializer();

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
    this.setupUpload_();

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
    let secName = aurora.db.schema.tables.sec.permissions.info.name;
    let me = this;
    let name = e.data['name'];
    let queryIn = e.data['query'];
    let optionsIn = e.data['options'];
    let response = {'command': 'full', 'name': name, 'query': queryIn, 'options': optionsIn, 'value': null};
    let serializer = new aurora.db.Serializer;
    let context = {'@userid': secContext.userid};
    let start = new Date().getTime();
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
                    me.log_.info('performance', queryIn, optionsIn, (new Date().getTime() - start) / 1000);
                    me.log_.debug('read data', queryIn, optionsIn, data, (new Date().getTime() - start) / 1000);
                }
                me.channel_.send(response, e.clientId);
            }, options);
    }

};

/**
 * @param {!aurora.db.Reader} reader
 * @param {!Object} context
 * @param {multiparty.Part} part
 * @param {function(?, ?number)} done
 */
aurora.db.Coms.prototype.insertFileIntoDb_ = function(reader, context, part, done) {

    let log = this.log_;
    let async = this.async_;
    console.log('gotFilename', part.filename);
    let fileT = aurora.db.schema.tables.base.file_storage;
    reader.insert(
        context, fileT, {created: new Date().getTime(), user: context.userid, name: part.filename, size: 0, parts: []}, function(err, insertRes) {
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
                        reader.updateOneLevel(
                            context, fileT, {size: size}, query.eq(query.val(insertRes.insertId), query.field(fileT.cols.id)),
                            function(err) {
                                partError = err;
                                done(err, insertRes.insertId);
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
                console.log('part end');
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
 * @return {?{path: !recoil.db.ChangeSet.Path,
              base:recoil.db.ChangeSet.Path,keyValues:!Array<{col:!recoil.structs.table.ColumnKey,value:?}>,
              baseTable:!aurora.db.schema.TableType, table:!aurora.db.schema.TableType, fileField:?string}}
 */
aurora.db.Coms.prototype.getUrlPathInfo = function(path) {
    let parts = path.split('/').map(function(p) {return decodeURIComponent(p);});
    // the last part the path is the keys and should be an array to check
    let keyParts = [];
    if (parts.length > 0 && parts[parts.length - 1][0] === '[') {
        // remove the keys part
        let last = parts.pop();
        try {
            keyParts = JSON.parse(last);
            if (!(keyParts instanceof Array)) {
                // invalid path keys must be an array
                return null;
            }
        }
        catch (e) {
            // invalid path
            return null;
        }
    }
    {
        let path = aurora.db.schema.getTablePath(parts.join('/'), keyParts);
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
 * @param {function(?,Array<number>)} done first param error, last param inserted file ids
 */
aurora.db.Coms.prototype.doUpload_ = function (reader, context, request, response, done) {
    let log = this.log_;
    let me = this;
    const multiparty = require('multiparty');
    var form = new multiparty.Form();
    var filename = undefined;
    let partError = null;
    let insertIds = [];
    let async = this.async_;
    let queue = async.queue(function(data, callback) {
        if (data.part) {
            console.log("doing part");
            me.insertFileIntoDb_(reader, context, data.part, function (err, insertId) {
                if (err) {
                    partError = partError || err;
                }
                else {
                    insertIds.push(insertId);
                }
                callback();
            });

        }
        else if (data.done) {
            console.log("part done", partError, insertIds);

            done(partError, insertIds);
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
 * sets up callback for uploads
 */
aurora.db.Coms.prototype.setupUpload_ = function () {
    let log = this.log_;
    let me = this;
    const UPLOAD_URL = '/system/upload';
    const UPLOAD_REGEXP = new RegExp('^' + UPLOAD_URL.replaceAll('/','\\/') + '\\/');
    let async = this.async_;
    console.log("upload regexp", '^' + UPLOAD_URL.replaceAll('/','\\/') + '\\/');
    aurora.http.addMidRequestCallback(
        UPLOAD_REGEXP,
        function(state, done) {
            let response = state.response;
            let request = state.request;
            let urlInfo = me.getUrlPathInfo(request.url.substring(UPLOAD_URL.length));
            if (state.request.method === 'POST' && me.reader_ && urlInfo && urlInfo.fileField) {
                let reader = me.reader_;
                console.log("got url", urlInfo.path.toString(), "base", urlInfo.base.toString(), "kvalues", urlInfo.keyValues);
                // we know we are handing it here maybe or deal with it in the security check
                let doneCalled = false;

                me.authenticator_.getPermissions(state.token, request.socket, function (context) {
                    console.log("got context", context);
                    if (!aurora.db.schema.hasAccess(context, urlInfo.path, 'c')) {
                        // we don't exist the user has no access
                        doneCalled = true;
                        done(undefined);
                        log.warn("File Upload Access Denied for ", context.userid);
                        return;
                    }
                    // check we have create access on the column we are adding to
                    reader.transaction(function (reader, transDone) {
                        // check we can even see the row
                        reader.readObjectByKey(context, urlInfo.baseTable, urlInfo.keyValues, urlInfo.baseTable.info.accessFilter(context), function (err, object) {
                            // we know we are dealing with the request now
                            doneCalled = true;
                            if (err) {
                                done(undefined);
                                return;
                            }
                            done(false);
                            let parentId = object.id;
                            
                            console.log("got base object", err, object.id);
                            me.doUpload_(reader, context, request, response, function (err, fileIds) {
                                console.log("upload finished", err, fileIds);
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
                                    
                                    async.eachSeries(fileIds, function (id, callback) {
                                        let obj = goog.object.clone(template);
                                        obj[urlInfo.fileField] = id;
                                        reader.insert(context, urlInfo.table, obj, function (err) {
                                            callback(err);
                                        });
                                    }, function (err) {
                                        console.log("top level done");
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
                        console.log("upload response");
                        response.writeHead(err ? 422 : 200, {'content-type': 'text/plain'});
                        response.end('{}');
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

