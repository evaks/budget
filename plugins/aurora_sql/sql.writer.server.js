/**
 * provide an iterface to write changes to database
 */

goog.provide('aurora.db.sql.ChangeWriter');

goog.require('aurora.db.ChangeWriter');
goog.require('aurora.db.Schema');
goog.require('aurora.db.sql.Reader');
goog.require('recoil.db.Query');
goog.require('recoil.util');

/**
 * @constructor
 * @implements {aurora.db.ChangeWriter}
 * @param {!aurora.db.SchemaType} schema
 * @param {!aurora.db.sql.Reader} reader
 */
aurora.db.sql.ChangeWriter = function(schema, reader) {
    this.schema_ = schema;
    this.reader_ = reader;
    this.async_ = require('async');
    this.log_ = aurora.log.createModule('SQLWRT');

};


/**
 * @typedef {{parent:(undefined|!recoil.db.ChangeSet.Path),path:!recoil.db.ChangeSet.Path,
 *           last:(undefined|!recoil.db.ChangeSet.PathItem),type:!recoil.db.ChangeSet.Change.Type}}
 */
aurora.db.sql.ChangeWriter.ChangeKey;

/**
 * @typedef {{error:?, id:(?|undefined), children:(!Array|undefined)}}
 */

aurora.db.sql.Result_;

/**
 * @typedef {{key:!aurora.db.sql.ChangeWriter.ChangeKey, value:recoil.db.ChangeSet.Change, results: !Array<!aurora.db.sql.Result_>,
 *    object:(undefined|Object), hasRefs:(undefined|!Array), needsRefs:(undefined|!Array)}}
 */
aurora.db.sql.ChangeWriter.ChangeKeyValue;

/**
 * checks that the add is valid, this means that
 * 1. it only contains sets and adds (no deletes)
 * 2. the adds path must equal the parent path of its dependants
 * 3. the db key must not be specified
 * 4. sets don't set ids
 * 5. path exists in schema
 * @private
 * @param {!aurora.db.SchemaType} schema
 * @param {!recoil.db.ChangeSet.Add} change
 * @return {boolean}
 */

aurora.db.sql.ChangeWriter.prototype.checkAdd_ = function(schema, change) {
    let deps = change.dependants();
    let basePath = change.path();
    let lastKeys = basePath.lastKeys();
    if (lastKeys.length !== 1) {
        return false;
    }
    if (lastKeys[0]['db'] != undefined) {
        return false;
    }
    let tblInfo = schema.getTableByName(basePath.pathAsString());

    if (!tblInfo) {
        return false;
    }
    // parent keys
    for (let i = 0; i < deps.length; i++) {
        let dep = deps[i];
        let path = dep.path();
        if (!recoil.util.isEqual(basePath, path.parent())) {
            return false;
        }

        if (dep instanceof recoil.db.ChangeSet.Add) {
            if (!this.checkAdd_(schema, dep)) {
                return false;
            }
        }
        else if (dep instanceof recoil.db.ChangeSet.Set) {
            let last = path.last().name();
            let meta = tblInfo.meta[last];
            if (!meta || meta.type === 'id') {
                return false;
            }
        }
    }
    return true;
};

/**
 * @private
 * @param {?string} base the path without the / prefix
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {boolean}
 */
aurora.db.sql.ChangeWriter.prototype.isBase_ = function(base, path) {
    return base.split('/').length == path.length();
};

/**
 * @private
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {?string} the path without the / prefix
 */
aurora.db.sql.ChangeWriter.prototype.getBasePath_ = function(path) {
    let schema = this.schema_;
    let items = path.items();
    let curBase = [];

    for (let i = 0; i < items.length; i++) {
        curBase.push(items[i].name());
        let curBasePath = curBase.join('/');
        if (schema.getTableByName('/' + curBasePath)) {
            return curBasePath;
        }
    }
    return null;
};

/**
 * @private
 * @param {?aurora.db.schema.TableType} table
 * @return {?string}
 */
aurora.db.sql.ChangeWriter.prototype.hasFile_ = function(table) {
    return aurora.db.sql.ChangeWriter.hasFile_(table);
};
/**
 * @private
 * @param {?aurora.db.schema.TableType} table
 * @return {?string}
 */
aurora.db.sql.ChangeWriter.hasFile_ = function(table) {
    if (table) {
        for (let k in table.meta) {
            if (table.meta[k].type === 'file') {
                return k;
            }
        }
    }
    return null;
};

/**
 * gets the meta of a path but also handles files
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {{meta: Object, fileField:?string}}
 */
aurora.db.sql.ChangeWriter.prototype.getFileMetaByPath = function(path) {
    return aurora.db.sql.ChangeWriter.getFileMetaByPath(this.schema_, path);
};
/**
 * gets the meta of a path but also handles files
 * @param {!aurora.db.SchemaType} schema
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {{meta: Object, fileField:?string}}
 */
aurora.db.sql.ChangeWriter.getFileMetaByPath = function(schema, path) {
    let field = null;
    let meta = null;
    try {
        meta = schema.getMetaByPath(path);
    }
    catch (e) {
        // this could be a filename
        if (path.last().name() === 'name') {
            let parentTable = schema.getTableByName(path.parent());
            console.log('getting file info');
            field = aurora.db.sql.ChangeWriter.hasFile_(parentTable);
            if (field) {
                meta = schema.getMetaByPath(path.parent().appendName(field));
            }
        }

    }
    return {meta: meta, fileField: field};
};

/**
 * @private
 * @param {!recoil.db.ChangeSet.Change} change
 * @param {!aurora.db.access.SecurityContext} inSecContext
 * @return {boolean}
 */
aurora.db.sql.ChangeWriter.prototype.hasPermission_ = function(change, inSecContext) {
    let path = change.path();
    let access = 'r';
    let secContext = /** @type {!aurora.db.access.SecurityContext}*/(goog.object.clone(inSecContext));

    secContext.change = change;

    if (change instanceof recoil.db.ChangeSet.Set) {
        access = 'u';
        let meta = null;
        let isFile = false;
        let fileMeta = this.getFileMetaByPath(path);
        meta = fileMeta.meta;
        isFile = fileMeta.fileField;
        if (!meta) {
            return false; // field doesn't exist so no access
        }
        if (meta.type === 'file' && !isFile) {
            return false;
        }

        let allowed = meta.access ? meta.access(secContext, access) : null;
        if (allowed != undefined) {
            return allowed;
        }
        path = path.parent();
    }
    else if (change instanceof recoil.db.ChangeSet.Add) {
        access = 'c';
    }
    else if (change instanceof recoil.db.ChangeSet.Delete) {
        access = 'd';
    }
    else {
        return false; // unsupported access is not allowed
    }

    let tbl = this.schema_.getTableByName(path);
    while (tbl && path.length() > 0) {
        let allowed = tbl.info.access ? tbl.info.access(secContext, access) : null;
        if (allowed != undefined) {
            return allowed;
        }
        path = path.parent();
        tbl = this.schema_.getTableByName(path);
    }
    return false; // no access specified at all  defaults to false
};

/**
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {function(!Array)} callback calles when done any results todo determine type
 */
aurora.db.sql.ChangeWriter.prototype.applyChanges = function(changes, secContext, callback) {
    let results = [];
    let me = this;
    let schema = this.schema_;
    let query = new recoil.db.Query();
    let context = {'@userid': secContext.userid};
    let bases = {};
    let reader = this.reader_;

    // bases are the root object paths of the changes we have been sending, for example if we are setting
    // /user/name /user is the base we need to read user, e.g we need to read user to make sure you are not changing
    // someone elses name if you don't have premission

    // get the base paths of each change we need this in order to determine security
    // we trust nothing from the client
    for (let changeIdx = 0; changeIdx < changes.length; changeIdx++) {

        results.push({error: null});
        // first we need to get the base object ids so we can do a security check
        let change = changes[changeIdx];
        let path = change.path();
        /**
         * @type {?string}
         */
        let curBasePath = me.getBasePath_(path);

        if (curBasePath === null) {
            results[changeIdx] = {error: 'Invalid Path ' + path.toString() + ' - no base path'};
            continue;
        }
        let baseParts = curBasePath.split('/');
        // found it, now we don't need to read items that are adds since they won't
        // exist in the database anyway however only adds that are base objects
        if (!me.hasPermission_(change, secContext)) {
            me.log_.warn('Field Access Denied', change.path().toString());
            results[changeIdx] = {error: 'Access Denied'};
            continue;
        }
        if (change instanceof recoil.db.ChangeSet.Add && baseParts.length === path.length()) {
            if (!me.checkAdd_(schema, /** @type {!recoil.db.ChangeSet.Add} */ (change))) {
                me.log_.warn('Invalid Add', path.toString());
                results[changeIdx] = {error: 'Invalid Add ' + path.toString()};
            }
        }
        else {
            let isAdd = change instanceof recoil.db.ChangeSet.Add;
            let isSet = change instanceof recoil.db.ChangeSet.Set;
            if (isAdd) {
                if (!me.checkAdd_(schema, /** @type {!recoil.db.ChangeSet.Add} */ (change))) {
                    // remember to check that the path exists upto this add
                    me.log_.warn('Invalid Add', path.toString());
                    results[changeIdx] = {error: 'Invalid Add ' + path.toString()};
                    continue;
                }
                if (!aurora.db.sql.ChangeWriter.validDbPath_(path.parent())) {
                    me.log_.warn('Invalid Path', path.toString(), 'invalid parent key types');
                    results[changeIdx] = {error: 'Invalid Path ' + path.toString() + ' - invalid parent key types'};
                    continue;
                }
            }
            // all the db parts pk cannot be null since it isn't an add
            // unless this is child of an add but that should be a contained in
            // the adds dependants
            if (aurora.db.sql.ChangeWriter.validDbPath_(isAdd ? path.parent() : path)) {
                let base = bases[curBasePath];
                if (base) {
                    base.paths.push({path: path, changeIndex: changeIdx});
                }
                else {
                    let tbl = schema.getTableByName('/' + curBasePath);

                    if (tbl && tbl.info && tbl.info.access && tbl.info.accessFilter) {
                        bases[curBasePath] = {paths: [{path: path, changeIndex: changeIdx}], ids: {}, objs: {}, tbl: tbl};
                    }
                    else if (!tbl || !tbl.info) {
                        me.log_.warn('Invalid Path', path.toString(), 'no table info');
                        results[changeIdx] = {error: 'Invalid Path ' + path.toString()};
                    }
                    else {
                        me.log_.warn('Invalid Security for', path.toString());
                        results[changeIdx] = {error: 'Invalid Security for ' + path.toString()};
                    }
                }
            }
            else {
                me.log_.warn('Invalid Path', path.toString(), 'invalid db path');
                results[changeIdx] = {error: 'Invalid Path ' + path.toString()};
            }
        }

    }
    // read all the base objects
    for (let basePath in bases) {
        let len = basePath.split('/').length;
        bases[basePath].paths.forEach(function(pInfo) {
            // this shouldn't happen if the data is valid
            let item = pInfo.path.items()[len - 1];
            if (!item || item.keys().length !== 1) {
                me.log_.warn('Invalid Path', pInfo.path.toString(), 'invalid number of keys');
                results[pInfo.changeIndex] = {error: 'Invalid Path ' + pInfo.path.toString()};
                return;
            }
            let key = item.keys()[0];
            bases[basePath].ids[key.db] = key.db;
        });

    }

    let baseList = [];
    for (let basePath in bases) {
        baseList.push(bases[basePath]);
    }
    this.async_.eachSeries(baseList, function(base, callback) {
        try {
            let tbl = base.tbl;

            let ids = [];
            for (let k in base.ids) {
                ids.push(base.ids[k]);
            }
            if (ids.length === 0) {
                callback(null);
                return;
            }
            reader.readObjects(
                context, base.tbl, query.isIn(tbl.info.pk, ids),
                base.tbl.info.accessFilter(secContext), function(err, data) {
                    if (err) {
                        // we could not read the original values everything for those
                        // is an error
                        base.paths.forEach(function(pInfo) {
                            results[pInfo.changeIndex].error = 'Unable to get original values';
                        });
                        me.log_.error('Getting original values', err);
                    }
                    else {
                        // put the original object in the base
                        for (let i = 0; i < data.length; i++) {
                            let obj = data[i];
                            let pk = obj[tbl.info.pk.getName()];
                            base.objs[pk] = obj;
                        }

                        base.paths.forEach(function(pInfo) {
                            let objectContext = /** @type {!aurora.db.access.SecurityContext}*/(goog.object.clone(secContext));
                            let change = changes[pInfo.changeIndex];
                            let basePk = null;
                            change.path().items().forEach(function(item) {
                                if (basePk === null && item.keys().length > 0) {
                                    basePk = item.keys()[0].db;
                                }

                            });

                            objectContext.object = base.objs[basePk];
                            if (!me.hasPermission_(change, objectContext)) {
                                me.log_.warn('Field Object Access Denied', change.path().toString());
                                results[pInfo.changeIndex] = {error: 'Access Denied'};

                            }
                        });


                    }

                    callback(null);
                }
            );
        }
        catch (e) {
            me.log_.error('Unable to get original values');
            base.paths.forEach(function(pInfo) {
                results[pInfo.changeIndex].error = 'Unable to get original values ' + e;
            });
            callback(null);
        }


    }, function(err) {
        me.applyChanges_(changes, context, secContext, results, bases, function(err) {
            callback(results);
        });
    });

};

/**
 * goes through all the results and if any of them have an error puts a error, that won't be displayed to the user
 * in all the other results, this is needed because changes are applied in a transaction so if 1 change errors all
 * changes error, the client should not need to know this, since other systems this may not be true
 * @param {?} err maybe a non-change specific error occured in that case all items will error with that
 * @param {!Array<!aurora.db.sql.Result_>} results
 * @return {?} the first error that was there or null, the err parameter is considered the first if supplied
 */
aurora.db.sql.ChangeWriter.prototype.applySilentError = function(err, results) {
    let calcError = null;
    if (!err) {
        let calcErrorFunc = function(results) {
            if (results) {
                for (let i = 0; i < results.length; i++) {
                    if (results[i].error) {
                        calcError = {silent: true};
                        break;
                    }
                    calcErrorFunc(results[i].children);

                }
            }
        };
        calcErrorFunc(results);
    }
    if (err || calcError) {
        let setError = function(results) {
            if (results) {
                for (let i = 0; i < results.length; i++) {
                    if (!results[i].error) {
                        results[i].error = err ? err : calcError;
                        setError(results[i].children);
                    }
                }
            }
        };
        setError(results);
    }

    return err || calcError;
};
/**
 * once the paths have been validated, and security checks have been done
 * actually apply the changes to the database
 *
 * @private
 * @param {!Array<recoil.db.ChangeSet.Change>} changes
 * @param {!Object} context
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {!Array<!aurora.db.sql.Result_>} results
 * @param {Object} bases
 * @param {function(?)} callback
 */
aurora.db.sql.ChangeWriter.prototype.applyChanges_ = function(changes, context, secContext, results, bases, callback) {
    let reader = this.reader_;
    let objectPathMap = new goog.structs.AvlTree(recoil.util.object.compareKey);
    let me = this;
    let query = new recoil.db.Query();
    let CType = recoil.db.ChangeSet.Change.Type;
    let schema = this.schema_;
    let refMap = new goog.structs.AvlTree(recoil.util.object.compareKey);
    let DelayedRef = aurora.db.sql.ChangeWriter.DelayedRef;

    for (let changeIdx = 0; changeIdx < changes.length; changeIdx++) {
        if (!results[changeIdx].error) {
            // no errors so far
            let change = changes[changeIdx];
            if (change instanceof recoil.db.ChangeSet.Set) {
                let curBasePath = me.getBasePath_(change.path());

                if (me.getPath_(bases[curBasePath], change.path())) {
                    me.addSet_(objectPathMap, change, results[changeIdx], null, me.getPath_(bases[curBasePath], change.path().parent()));
                }
                else {
                    results[changeIdx] = {error: 'Invalid Path ' + change.path().toString() + ' - does not exist'};

                }
            }
            else if (change instanceof recoil.db.ChangeSet.Delete) {
                let path = change.path();
                let curBasePath = me.getBasePath_(path);
                let obj = me.getPath_(bases[curBasePath], path);
                if (obj instanceof Object) {
                    me.addDelete_(objectPathMap, change, results[changeIdx], obj);
                }
                else {
                    results[changeIdx] = {error: 'Invalid Path ' + change.path().toString() + ' - does not exist'};
                }
            }
            else if (change instanceof recoil.db.ChangeSet.Add) {
                // two types here we are adding a base object or to a sub object of an existing
                // object we need to make sure that
                let curBasePath = me.getBasePath_(change.path());
                if (me.getPath_(bases[curBasePath], change.path().parent()) !== null) {
                    let id = refMap.safeFind({key: change.path(), delayed: new DelayedRef()}).delayed;
                    id.value = change.path().parent().lastKeys()[0].db;
                    me.addAdd_(objectPathMap, change, results[changeIdx], id, refMap);
                }
                else {
                    // if not base object it is an error
                    if (!me.isBase_(curBasePath, change.path())) {
                        results[changeIdx] = {error: 'Invalid Path ' + change.path().toString() + ' - invalid parent'};
                        continue;
                    }

                    me.addAdd_(objectPathMap, change, results[changeIdx], null, refMap);
                    // this is a base object
                }
            }


        }

    }

    let list = objectPathMap.toList();

//    let objectDepMap = goog.structs.AvlTree.fromList(list, aurora.db.sql.ChangeWriter.changeComparator(list));

    // now group sets so that we only need to do them once
    //aurora.db.Pool.hashPassword(passwords[field], function(err, hash) {
    let passwords = [];
    let changeList = aurora.db.sql.ChangeWriter.optimizeChanges_(objectPathMap, schema, passwords, refMap);
    changeList.sort(aurora.db.sql.ChangeWriter.changeComparator(changeList));

    // in sql changes happen in a transaction basis, if there is 1 error everything errors, put a silent error on all changes
    let error = me.applySilentError(null, results);
    if (error) {
        me.log_.warn('got silent error', error);
        callback(error);
        return;
    }

    // passwords must be hashed this is an asynchronus call since it may take a while
    me.async_.each(passwords, function(entry, cb) {
        aurora.db.Pool.hashPassword(entry.value, function(err, value) {
            if (!err) {
                entry.obj[entry.field] = value;
            }
            else {
                entry.result.error = error;
            }
            cb(err);
        });

    }, function(err) {
        if (err) {
            me.applySilentError(null, results);
            me.log_.warn('got silent error in password hash', error);
            callback(err);
        }
        else {
            me.applyTransactionChanges_(changeList, context, secContext, function(err) {
                if (err) {
                    me.log_.warn('got silent error in apply transaction changes', error);
                    me.applySilentError(err, results);
                }
                callback(err);
            });
        }
    });
};
/**
 * @private
 * @param {!Array<!aurora.db.sql.ChangeWriter.ChangeKeyValue>} changeList
 * @param {!Object} context
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {function(?)} callback
 */
aurora.db.sql.ChangeWriter.prototype.applyTransactionChanges_ = function(changeList, context, secContext, callback) {
    let mainReader = this.reader_;
    let me = this;
    let query = new recoil.db.Query();
    let CType = recoil.db.ChangeSet.Change.Type;
    let schema = this.schema_;
    let DelayedRef = aurora.db.sql.ChangeWriter.DelayedRef;
    let addsToCheck = [];
    mainReader.transaction(function(reader, callback) {
        me.async_.eachSeries(changeList, function(entry, eachCallback) {
            let makeObject = function(path) {
                let tbl = schema.getTableByName(path.pathAsString());
                if (tbl) {
                    let obj = {};
                    let idName = tbl.info.pk.getName();
                    let parentName = tbl.info.parentKey ? tbl.info.parentKey.getName() : null;
                    let fileUpdate = null;
                    for (let k in entry.object) {
                        if (k === parentName) {
                            if (entry.parentId) {
                                obj[k] = entry.parentId.value;
                            }
                        }
                        else if (entry.object[k] instanceof DelayedRef) {
                            obj[k] = entry.object[k].value;
                        }
                        else if (k !== idName) {
                            // does this handle references ????
                            obj[k] = entry.object[k];
                        }
                    }

                    if (entry.parentId && parentName) {
                        obj[parentName] = entry.parentId.value;
                    }
                    return {tbl: tbl, obj: obj, fileUpdate: fileUpdate};
                }
                return null;
            };
            if (entry.key.type === CType.ADD) {
                let info = makeObject(entry.key.path);
                if (info) {
                    let curBasePath = me.getBasePath_(entry.key.path);
                    let isBase = me.isBase_(curBasePath, entry.key.path);
                        // security check needed here we don't want to add items we can't see
                    reader.insert(context, info.tbl, info.obj, function(error, insertId) {
                        if (error) {
                            entry.result.error = error;
                            eachCallback(error);
                        }
                        else {

                            // todo we get no error without an insertid object
                            entry.id.value = BigInt(insertId.insertId);
                            if (isBase) {
                                let keyNames = entry.key.path.last().keyNames();
                                let newPath = entry.key.path.setKeys(keyNames, [new aurora.db.PrimaryKey(entry.id.value)]);
                                addsToCheck.push({tbl: info.tbl, entry: entry, id: entry.id.value});
                            }
                            entry.result.id = entry.id.value;
                            eachCallback(null);
                        }
                    });
                    return;
                }
            }
            else if (entry.key.type === CType.DEL) {
                let path = entry.key.path;
                let tbl = schema.getTableByName(path.pathAsString());
                if (tbl) {
                    // files are special we need to delete them automatically

                    let fileCol = null;
                    for (let col in tbl.meta) {
                        if (tbl.meta[col].type === 'file') {
                            fileCol = col;
                            break;
                        }
                    }

                    let doDelete = function(callback) {
                        let pkQuery = query.eq(tbl.info.pk, query.val(path.lastKeys()[0].db));
                        reader.deleteOneLevel(context, tbl, pkQuery, null, function(err) {
                            callback(err);
                        });
                    };

                    if (fileCol) {
                        let deleteFileData = function(obj) {
                            return function(err) {
                                if (err) {
                                    eachCallback(err);
                                }
                                else {
                                    let fileT = aurora.db.schema.tables.base.file_storage;
                                    let filePartT = fileT.parts;
                                    let fileId = obj[fileCol];
                                    console.log('deleting file', fileId);
                                    reader.deleteOneLevel(context, filePartT, query.eq(filePartT.info.parentKey, query.val(fileId)), null, function(err) {
                                        if (err) {
                                            eachCallback(err);
                                        }
                                        else {
                                            reader.deleteOneLevel(context, fileT, query.eq(fileT.info.pk, query.val(fileId)), null, function(err) {
                                                eachCallback(err);
                                            });
                                        }
                                    });
                                }
                            };
                        };
                        reader.readObjectByKey(
                            context, tbl, [{col: tbl.info.pk, value: path.lastKeys()[0].db}],
                            null, function(err, obj) {
                                if (err) {
                                    eachCallback(err);
                                }
                                else {
                                    doDelete(deleteFileData(obj));
                                }

                            });

                        // we need to get the file id
                    }
                    else {
                        doDelete(eachCallback);
                    }

                    return;
                }
                eachCallback('Unable to find table for ' + path.pathAsString());

            }
            else if (entry.key.type === CType.SET) {
                let info = makeObject(entry.key.parent);
                console.log('made set object', info);
                if (info) {
                // this is a set
                    reader.updateOneLevel(context, info.tbl, info.obj, query.eq(info.tbl.info.pk, entry.key.parent.last().keys()[0].db), function(err) {
                        eachCallback(err);
                    });
                    return;
                }
            }
            eachCallback('Unable to apply change' + entry.key.path.toString());

        }, function(err) {
            if (err || addsToCheck.length === 0) {
                callback(err);
            }
            else {
                me.async_.eachSeries(addsToCheck, function(info, eachCallback) {
                    let securityFilter = info.tbl.info.accessFilter(secContext);
                    reader.readObjectByKey(
                        context, info.tbl, [{col: info.tbl.info.pk, value: info.id}],
                        securityFilter,
                        function(err) {
                            if (err) {
                                info.entry.result.error = 'Access Denied';
                                me.log_.warn('Add Access Denied', info.tbl.info.table, info.id);
                                eachCallback('Access Denied');
                            }
                            else {
                                eachCallback(err);
                            }
                        });

                }, function(err) {
                    callback(err);
                });
            }
        });
    }, function(err) {
        callback(err);
    });

};

/**
 * @param {!goog.structs.AvlTree} objectPathMap
 * @param {!recoil.db.ChangeSet.Change} change
 * @param {!aurora.db.sql.Result_} result
 * @param {?{value: ?}} parentId
 * @param {Object} obj
 */
aurora.db.sql.ChangeWriter.prototype.addSet_ = function(objectPathMap, change, result, parentId, obj) {
    let CType = recoil.db.ChangeSet.Change.Type;
    let fileMeta = this.getFileMetaByPath(change.path());
    if (fileMeta.fileField) {
        let storageT = aurora.db.schema.tables.base.file_storage;
        let changeParent = change.path().parent();
        let actualPath = recoil.db.ChangeSet.Path.fromString(aurora.db.schema.tables.base.file_storage.info.path);
        let parentItem = new recoil.db.ChangeSet.PathItem(actualPath.last().name(), [storageT.info.pk.getName()], [new aurora.db.PrimaryKey(obj[fileMeta.fileField])]);
        actualPath = actualPath.parent().append(parentItem).appendName(change.path().last().name());
        change = new recoil.db.ChangeSet.Set(actualPath, change.orig(), change.value());
    }
    let entry = objectPathMap.safeFind(
        {key: {
            path: change.path(),
            parent: change.path().parent(),
            last: change.path().last(),
            type: CType.SET,
        }, value: null, parentId: parentId, needsRefs: [], hasRefs: [], result: result}
    );

    let meta = fileMeta.meta;
    if (meta && meta.type === 'ref') {
        // this doesn't support references to objects inside objects
        let table = this.schema_.getTableByName(meta.ref);
        let pkName = table.info.pk.getName();
        let val = change.value();
        let orig = obj ? obj[entry.key.last.name()] : null;
        if (val != null) {
            entry.needsRefs.push(recoil.db.ChangeSet.Path.fromString(table.info.path).setKeys(/** @type {!Array<string>} */ (table.info.keys), [val]));
        }
        if (orig != null) {
            entry.hasRefs.push(recoil.db.ChangeSet.Path.fromString(table.info.path).setKeys(/** @type {!Array<string>} */ (table.info.keys), [new aurora.db.PrimaryKey(orig)]));
        }
    }
    entry.value = change;
};

/**
 * @constructor
 */
aurora.db.sql.ChangeWriter.DelayedRef = function() {
    this.value = null;
};

/**
 * @param {!goog.structs.AvlTree} objectPathMap
 * @param {!recoil.db.ChangeSet.Change} change
 * @param {!aurora.db.sql.Result_} result
 * @param {?aurora.db.sql.ChangeWriter.DelayedRef} parentId
 * @param {!goog.structs.AvlTree} refMap
 */
aurora.db.sql.ChangeWriter.prototype.addAdd_ = function(objectPathMap, change, result, parentId, refMap) {
    let CType = recoil.db.ChangeSet.Change.Type;
    let DelayedRef = aurora.db.sql.ChangeWriter.DelayedRef;

    // in an object so we changes will reflect in children once we get an insert id
    let id = refMap.safeFind({key: change.path(), delayed: new DelayedRef()}).delayed;
    let entry = objectPathMap.safeFind(
        {key: {
            path: change.path(),
            type: CType.ADD,
        }, value: null, id: id, object: {}, parentId: parentId, result: result, needsRefs: change.path().size() > 1 ? [change.path().parent()] : []}
    );
    result.children = [];
    let table = this.schema_.getTableByName(change.path());

    let dependants = change.dependants();
    for (let i = 0; i < dependants.length; i++) {
        let dep = dependants[i];
        result.children.push({error: null});
        if (dep instanceof recoil.db.ChangeSet.Set) {
            let name = dep.path().last().name();
            let meta = table.meta[name];
            let val = dep.value();


            if (meta && meta.type === 'ref') {
                let table = this.schema_.getTableByName(meta.ref);
                let pkName = table.info.pk.getName();
                console.log('adding ref', name, val);
                if (val != null) {
                    let refPath = recoil.db.ChangeSet.Path.fromString(table.info.path).setKeys(/** @type {!Array<string>} */ (table.info.keys), [val]);
                    entry.needsRefs.push(refPath);
                    entry.object[name] = val.db == null ? refMap.safeFind({key: refPath, delayed: new DelayedRef()}).delayed : val.db;
                }
                else {
                    entry.object[name] = val;
                }

            }
            else {
                entry.object[name] = val;
            }
        }
        else if (dep instanceof recoil.db.ChangeSet.Add) {
            this.addAdd_(objectPathMap, dep, result.children[i], id, refMap);
        }
    }
    entry.value = change;
};



/**
 * @param {!goog.structs.AvlTree} objectPathMap
 * @param {!recoil.db.ChangeSet.Change} change
 * @param {!aurora.db.sql.Result_} result
 * @param {Object} object
 */
aurora.db.sql.ChangeWriter.prototype.addDelete_ = function(objectPathMap, change, result, object) {
    let CType = recoil.db.ChangeSet.Change.Type;
    let path = change.path();

    let table = this.schema_.getTableByName(path);
    let me = this;
    if (!object || !table) {
        return;
    }

    let entry = objectPathMap.safeFind(
        {key: {
            path: path,
            type: CType.DEL,
        }, value: null, id: path.last().keys[0], result: result, hasRefs: path.size() > 1 ? [path.parent()] : []}
    );

    result.children = [];
    let i = 0;
    for (let field in table.meta) {
        let meta = table.meta[field];
        let val = object[field];
        result.children.push({error: null});

        if (meta.type === 'ref') {
            let table = this.schema_.getTableByName(meta.ref);
            if (val) {
                entry.hasRefs.push(recoil.db.ChangeSet.Path.fromString(table.info.path).setKeys(/** @type {!Array<string>} */ (table.info.keys), [new aurora.db.PrimaryKey(val)]));
            }
        }
        else if (meta.isList) {

            if (val instanceof Array) {
                let childPath = path.appendName(field);
                let childTable = this.schema_.getTableByName(childPath);
                val.forEach(function(child) {

                    let pkName = childTable.info.pk.getName();
                    let curPath = childPath.setKeys([pkName], [new aurora.db.PrimaryKey(child[pkName], child[pkName])]);
                    let change = new recoil.db.ChangeSet.Delete(curPath, null);

                    me.addDelete_(objectPathMap, change, result.children[i], child);

                });
            }

        }
        else if (meta.isObject) {
            let childPath = path.appendName(field);
            let childTable = this.schema_.getTableByName(childPath);
            let child = val;
            let pkName = childTable.info.pk.getName();
            let curPath = childPath.setKeys([pkName], [new aurora.db.PrimaryKey(child[pkName], child[pkName])]);
            let change = new recoil.db.ChangeSet.Delete(curPath, null);
            me.addDelete_(objectPathMap, change, result.children[i], child);
        }
        i++;
    }
    entry.value = change;
};



/**
 * groups set changes together so it is only on query object
 * @private
 * @param {!goog.structs.AvlTree<!aurora.db.sql.ChangeWriter.ChangeKeyValue>} changeMap
 * @param {!aurora.db.SchemaType} schema
 * @param {!Array<{obj:Object,field:string,value:string,result:aurora.db.sql.Result_}>} passwords
 * @param {!goog.structs.AvlTree} refMap
 * @return {!Array<!aurora.db.sql.ChangeWriter.ChangeKeyValue>}
 */
aurora.db.sql.ChangeWriter.optimizeChanges_ = function(changeMap, schema, passwords, refMap) {
    let CType = recoil.db.ChangeSet.Change.Type;
    let changeList = [];
    let setEntries = new goog.structs.AvlTree(recoil.util.object.compareKey);
    let DelayedRef = aurora.db.sql.ChangeWriter.DelayedRef;
    changeMap.inOrderTraverse(function(entry) {
        let key = entry.key;
        if (entry.result.error) {
            return;
        }
        if (CType.DEL === key.type) {
            let curEntry = goog.object.clone(entry);
            curEntry.results = [curEntry.result];
            changeList.push(curEntry);
        }
        else if (CType.ADD === key.type) {
            let tbl = schema.getTableByName(entry.key.path.pathAsString());
            let curEntry = goog.object.clone(entry);
            curEntry.results = [curEntry.result];
            for (let k in entry.object) {
                let meta = tbl.meta[k];
                let val = entry.object[k];
                let isPassword = meta && meta.type === 'password' && val != null && typeof(val) === 'string';

                if (isPassword) {
                    passwords.push({obj: entry.object, field: k, value: val, result: entry.result});
                }
            }
            changeList.push(curEntry);
        }
        else if (CType.SET === key.type) {
            let fileMeta = aurora.db.sql.ChangeWriter.getFileMetaByPath(schema, entry.key.path);
            let oldSet = setEntries.findFirst({key: entry.key.parent});
            let curEntry = oldSet ? oldSet.entry : null;
            if (!curEntry) {
                curEntry = goog.object.clone(entry);
                curEntry.object = {};
                curEntry.paths = [];
                curEntry.results = [];
                curEntry.key = goog.object.clone(entry.key);
                // the path is the parent since there may be multiple
                curEntry.key.path = entry.key.parent;
                changeList.push(curEntry);
                setEntries.add({key: entry.key.parent, entry: curEntry});
            }
            curEntry.paths.push(entry.key.path);
            let ref = null;
            if (entry.needsRefs) {
                curEntry.needsRefs = curEntry.needsRefs || [];
                entry.needsRefs.forEach(function(r) {
                    let pk = r.lastKeys()[0];
                    if (pk && pk.db) {
                        ref = pk.db;
                    } else if (pk && pk.mem) {
                        ref = refMap.safeFind({key: r, delayed: new DelayedRef()}).delayed;
                    }
                    curEntry.needsRefs.push(r);
                });
            }

            if (entry.hasRefs) {
                curEntry.hasRefs = curEntry.hasRefs || [];
                entry.hasRefs.forEach(function(r) {
                    curEntry.hasRefs.push(r);
                });
            }


            curEntry.results.push(entry.result);
            curEntry.object[key.last.name()] = ref != null ? ref : entry.value.value();

            let meta = schema.getMetaByPath(entry.key.path.pathAsString());
            let isPassword = meta && meta.type === 'password';
            if (isPassword) {
                if (entry.value.value() != null) {
                    let val = entry.value.value();
                    if (typeof(val) === 'string') {
                        passwords.push({obj: curEntry.object, field: key.last.name(), value: val, result: entry.result});
                        }
                }
            }
        }



    });
    return changeList;
};



/**
 * this compares changes and puts them in the right order so they
 * don't break foreign key constraints
 * @param {!Array<aurora.db.sql.ChangeWriter.ChangeKeyValue>} changes
 * @return {function({key:!aurora.db.sql.ChangeWriter.ChangeKey},{key:!aurora.db.sql.ChangeWriter.ChangeKey}):number}
 */

aurora.db.sql.ChangeWriter.changeComparator = function(changes) {
    let dependsOn = aurora.db.sql.ChangeWriter.makeDependsOn(changes);
    return function(x, y) {
        if (dependsOn(x, y)) {
            return 1;
        }

        if (dependsOn(y, x)) {
            return -1;
        }

        let xpath = x.key.path.items();
        let ypath = y.key.path.items();

        for (let i = 0; i < xpath.length && i < ypath.length; i++) {
            let res = xpath[i].compare(ypath[i]);
            if (res) {
                return res;
            }
        }
        let res = xpath.length - ypath.length;
        if (res) {
            return res;
        }

        return x.key.type - y.key.type;
    };
};


/**
 * makes a function that will do a transative depends on to change keys
 * depends on (x, y) means y must happen before x
 * @param {!Array<aurora.db.sql.ChangeWriter.ChangeKeyValue>} changes
 * @return function(!aurora.db.sql.ChangeWriter.ChangeKey,!aurora.db.sql.ChangeWriter.ChangeKey):boolean}
 */
aurora.db.sql.ChangeWriter.makeDependsOn = function(changes) {
    let dependsMap = new goog.structs.AvlTree(recoil.util.object.compareKey);
    let dependsOn = aurora.db.sql.ChangeWriter.dependsOnNonTransative_;
    let addDeps = function(deps, v) {
        changes.forEach(function(dep) {
            if (dependsOn(v, dep)) {
//                console.log(v.key.path.toString(), "depends on", dep.key.path.toString());
                if (!deps.findFirst(dep)) {
                    deps.add(dep);
                    addDeps(deps, dep);
                }
            }
        });
    };

    changes.forEach(function(v) {
        let deps = new goog.structs.AvlTree(recoil.util.compare);
        addDeps(deps, v);
        if (deps.getCount() !== 0) {
            dependsMap.add({key: v.key, needs: deps});
        }
    });
    /*
    dependsMap.inOrderTraverse(function (e) {
        console.log(e.key.path.toString(), "needs", e.needs.toList().map(function (v) { return v.key.path.toString();}));
    });
    */
    return function(x, y) {
        let res = dependsMap.findFirst(x);
        return !!(res && res.needs.findFirst(y));
    };
};



/**
 * x depends on y then y needs to be there for x to exist
 * @private
 * @param {!aurora.db.sql.ChangeWriter.ChangeKeyValue} x
 * @param {!aurora.db.sql.ChangeWriter.ChangeKeyValue} y
 * @return {boolean}
 */
aurora.db.sql.ChangeWriter.dependsOnNonTransative_ = function(x, y) {
    // x depends on y then y needs to be there for x to exist
    let CType = recoil.db.ChangeSet.Change.Type;
    let xpaths = x.key.paths == undefined ? [x.key.path] : x.key.paths;
    let ypaths = y.key.paths == undefined ? [y.key.path] : y.key.paths;

    let containsRef = function(allRefs, refs) {
        if (!refs) {
            return false;
        }

        for (let i = 0; i < refs.length; i++) {
            let curRef = refs[i];
            for (let j = 0; j < allRefs.length; j++) {
                if (recoil.util.isEqual(allRefs[j], curRef)) {
                    return true;
                }
            }
        }
        return false;
    };
    if (containsRef(ypaths, x.needsRefs)) {
        return true;
    }
    if (containsRef(xpaths, y.hasRefs)) {
        return true;
    }
    return false;
};



/**
 * check to see if the path keys are valid for something already in the database
 * that means it must not have a null db and all keys must be primary keys
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {boolean}
 */
aurora.db.sql.ChangeWriter.validDbPath_ = function(path) {
    let keys = path.keys();
    for (let j = 0; j < keys.length; j++) {
        if (keys[j] == null || !(keys[j] instanceof aurora.db.PrimaryKey)) {
            return false;
        }
        if (keys[j].db == null) {
            return false;
        }
    }
    return true;
};



/**
 * @private
 * @param {?} base
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {?} the object that exists or null
 */
aurora.db.sql.ChangeWriter.prototype.getPath_ = function(base, path) {
    if (!base) {
        return null;
    }

    let items = path.items();
    let baseLen = base.tbl.info.path.split('/').length - 1;


    if (baseLen < 1 || items.length < baseLen) {
        return null;
    }
    let itemIdx = baseLen - 1;
    let item = items[itemIdx];
    let keys = item.keys();
    if (!keys || keys.length !== 1 || !(keys[0] instanceof aurora.db.PrimaryKey)) {
        return null;
    }
    let curTbl = base.tbl;
    let curObj = base.objs[keys[0].db];

    if (!curObj) {
        return null;
    }

    for (let i = itemIdx + 1; i < items.length && curObj; i++) {
        let meta = curTbl.meta[items[i].name()];
        if (!meta) {
            if (i == items.length - 1 && items[i].name() === 'name') {
                let fileField = this.hasFile_(curTbl);
                if (fileField) {
                    let res = {};
                    res[aurora.db.schema.tables.base.file_storage.info.pk.getName()] = curObj[fileField];
                    console.log('get path', items[i].name(), res);
                    return res;
                }

            }
            return null;
        }
        curObj = curObj[items[i].name()];
        let pks = items[i].keys();
        let subTable = null;
        if (meta.isList || meta.isObject) {
            subTable = this.schema_.getTable(meta.key);
            if (!pks || !(pks[0] instanceof aurora.db.PrimaryKey) || !subTable) {
                return null;
            }
        }
        if (meta.isList) {
            if (curObj instanceof Array) {
                let j = 0;
                for (j = 0; j < curObj.length; j++) {
                    let val = curObj[j];
                    let valPk = val[subTable.info.pk.getName()];
                    if (valPk === pks[0].db) {
                        curObj = val;
                        curTbl = subTable;
                        break;
                    }
                }
                if (j === curObj.length) {
                    return null;
                }
            }
            else {
                return null;
            }

        }
        else if (meta.isObject) {
            curTbl = subTable;
            console.log('todo set object');
            return null;
        }
        else {
            return i === items.length - 1; // must be the last item just return true or false here since its not an object
        }
    }
    return curObj;
};
