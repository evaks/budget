
goog.provide('aurora.db.Comms');

goog.require('aurora.db.Serializer');
goog.require('aurora.db.shared');
goog.require('aurora.websocket');
goog.require('recoil.db.ChangeSet');
goog.require('recoil.db.Database');
goog.require('recoil.frp.Frp');
goog.require('recoil.util.Sequence');

/**
 * primary keys are always {db: ?, memory: ?}
 */
/**
 * matches is a map of keys that this query has returned or been inserted by this user
 * added is a map of keys that the user has added to this query
 *
* @typedef {{key:{query:!recoil.db.Query,options:recoil.db.QueryOptions},matches:(!goog.structs.AvlTree|undefined),added:(!goog.structs.AvlTree|undefined), value:(undefined|{failure:!Array<function(!recoil.frp.BStatus)>,success:!Array<function(?)>,value:?})}}
 */
aurora.db.QueryEntry;

/**
 * @constructor
 *
 * @param {!recoil.db.DatabaseComms} comms
 * @param {!recoil.db.ChangeDb} db
 * @param {!aurora.Client} client
 * @param {!aurora.db.Schema} schema
 * @param {!recoil.util.Sequence} transId
 */
aurora.db.Helper = function(comms, db, client, schema, transId) {
    /**
     * @private
     * @type {!goog.structs.AvlTree<{key:string, queries:(undefined|goog.structs.AvlTree<!aurora.db.QueryEntry>)}>}
     */
    this.tblMap_ = new goog.structs.AvlTree(recoil.util.object.compareKey);
    this.channel_ = null;
    this.client_ = client;
    this.comms_ = comms;
    this.db_ = db;
    this.schema_ = schema;
    this.channel_ = this.comms_.createChannel_();
    this.transId_ = transId;

};


/**
 * called when a new row may be added however, before the server reply
 * @private
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes
 * @param {aurora.db.schema.TableType} tbl
 * @param {!recoil.db.Query} query
 * @param {!recoil.db.QueryOptions} options
 */
aurora.db.Helper.prototype.updateAddedNew_ = function(changes, tbl, query, options) {
    let queryInfo = this.findQuery_(tbl, query, options);
    if (queryInfo) {
        for (let i = 0; i < changes.length; i++) {
            let change = changes[i];
            if (change instanceof recoil.db.ChangeSet.Add) {
                let path = change.path();
                if (path.pathAsString() === tbl.info.path) {
                    let pk = path.lastKeys()[0];
                    if (!queryInfo.added.findFirst(pk)) {
                        queryInfo.added.add(pk);
                    }
                }
            }
        }
    }
};

/**
 * @private
 * @param {aurora.db.schema.TableType} tbl
 * @param {!recoil.db.Query} query
 * @param {!recoil.db.QueryOptions} options
 * @param {!Object} list
 * @return {?function(?):boolean}
 */
aurora.db.Helper.prototype.updateQueryInfo_ = function(tbl, query, options, list) {
    let queryInfo = this.findQuery_(tbl, query, options);

    if (queryInfo) {
        let entry = this.tblMap_.findFirst({key: tbl.key.uniqueId()});

        queryInfo.matches.clear();
        if (list instanceof Array) {
            list.forEach(function(obj) {
                let key = obj[tbl.info.pk.getName()];
                queryInfo.matches.add(key);
            });
        }
        else {
            let key = list[tbl.info.pk.getName()];
            queryInfo.matches.add(key);
        }

        let needed = new goog.structs.AvlTree(recoil.util.compare);
        let add = function(v) {
            if (!needed.findFirst(v)) {
                needed.add(v);
            }
        };
        entry.queries.inOrderTraverse(function(e) {
            e.matches.inOrderTraverse(add);
            e.added.inOrderTraverse(add);
        });
        // the filter returns if it is removable
        return function(v) {
            let key = v[tbl.info.pk.getName()];
            return !needed.findFirst(key);
        };
    }
    return null;
};
/**
 * @private
 * @param {?} id
 * @return {!Array}
 */
aurora.db.Helper.prototype.findTables_ = function(id) {
    let entry = this.tblMap_.findFirst({key: id});
    if (!entry) {
        return [];
    }
    let res = [];
    // todo deal with counts probably not here they shouldn't go in the database anyway
    // I don't know how I will deal with inserting, perhaps the server can send a message
    entry.queries.inOrderTraverse(function(query) {
        if (!query.key.options.isCount()) {
            res.push(query);
        }
    });
    return res;
};

/**
 * @param {!aurora.db.schema.TableType} tbl
 * @param {!recoil.db.Query} query
 * @param {!recoil.db.QueryOptions} options
 * @return {?aurora.db.QueryEntry}
 */
aurora.db.Helper.prototype.findQuery_ = function(tbl, query, options) {
    let entry = this.tblMap_.findFirst({key: tbl.key.uniqueId()});

    if (!entry) {
        return null;
    }
    return entry.queries.findFirst({key: {query: query, options: options}});
};

/**
 * @param {!aurora.db.schema.TableType} tbl
 * @param {!recoil.db.Query} query
 * @param {!recoil.db.QueryOptions} options
 * @param {?} err
 * @param {?number} count
 */
aurora.db.Helper.prototype.updateCount = function(tbl, query, options, err, count) {

    let entry = this.findQuery_(tbl, query, options);

    if (!entry) {
        return;
    }
    if (err) {
        entry.value.failure.forEach(function(failCb) {
            failCb(recoil.frp.BStatus.errors([err]));
        });
    }
    else {
        entry.value.success.forEach(function(successCb) {
            successCb(count);
        });
    }
};


/**
 * @param {aurora.db.schema.TableType} keyInfo ,
 * @param {!recoil.db.Query} query
 * @param {!recoil.db.QueryOptions} options
 * @param {?} error
 */
aurora.db.Helper.prototype.updateTableError = function(keyInfo, query, options, error) {
    if (keyInfo && keyInfo.key) {
        var errorStatus = recoil.frp.BStatus.errors([error]);
        var lookupInfo = this.findQuery_(keyInfo, query, options);
        if (lookupInfo) {
            var tableInfo = lookupInfo.value;
            tableInfo.failure.forEach(function(failCb) {
                failCb(errorStatus);
            });
        }
    }
};
/**
 * @private
 * @param {?} data
 * @param {!aurora.db.schema.TableType} tbl
 * @param {!recoil.db.Query} query
 * @param {!recoil.db.QueryOptions} options
 * @param {boolean} all is this a full data from the server
 * @return {?}
 */
aurora.db.Helper.prototype.filterQuery_ = function(data, tbl, query, options, all) {
    // filtering count should be done outside this
    var entry = this.findQuery_(tbl, query, options);

    if (data instanceof Array) {
        let colKeyMap = aurora.db.schema.makeColKeyMap(tbl);
        let res = [];
        for (let i = 0; i < data.length; i++) {
            let pk = data[i][tbl.info.pk.getName()];

            if (entry) {
                let matches = entry.matches.findFirst(pk);
                // maybe we don't need matches at all at least if is a non limited query
                if (!matches) {
                    // we also add items that match the query that where not added if the query is
                    // not limited in length
                    let options = entry.key.options;
                    if (!options) {
                        matches = true;
                    }
                    else if (!options.isCount() && options.size != undefined) {
                        var scope = new recoil.db.QueryScope(aurora.db.Helper.makeTableObjectValue_(tbl, data[i]), undefined, colKeyMap);
                        matches = entry.key.query.eval(scope);
                    }
                }

                if (matches || entry.added.findFirst(pk)) {
                    res.push(data[i]);
                }
            }
        }
        return res;
    }
    else {
        // don't filter non lists the server should filter these anyway
        return data;
    }

};
/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {recoil.db.PathMap=} opt_currentErrors
 */
aurora.db.Helper.prototype.updateTable = function(path, opt_currentErrors) {
    var currentErrors = opt_currentErrors;
    var keyInfo = aurora.db.Comms.pathToInfo(path);
    if (!keyInfo) {
        console.log('no info', path, keyInfo);
        return;
    }

    if (!keyInfo.key) {
        // if there is no key then this is not a root table no need to update
        return;
    }
    let me = this;
    var status = keyInfo.info && keyInfo.info.status;
    this.findTables_(keyInfo.key.uniqueId()).forEach(function(lookupInfo) {
        // if this is a count we handle it somewhere else ignore
        if (lookupInfo.key.options.isCount()) {
            return;
        }
        var tableInfo = lookupInfo.value;
        // TODO think about this I think we may make this the primary key
        // and stop using the primary key izer on a table, it will work for
        // individual tables but not for multiple
        var value = me.filterQuery_(me.db_.get(path), keyInfo, lookupInfo.key.query, lookupInfo.key.options, false);
        // turn into array note the 2 ways this can be an object 1 it is an object
        // the other is it
        var kInfo = keyInfo.info;
        var isArray = kInfo.keys && kInfo.keys.length > 0 && !(kInfo.params && kInfo.params.length == kInfo.keys.length);
        let kName = kInfo.pk.getName();
        var tableVal = (isArray ? value : [value]).filter(v => {
            let k = v[kName];
            
            return lookupInfo.matches.contains(k) || lookupInfo.added.contains(k);
        });
        var table = me.createTable(path, tableVal, currentErrors);

        

        tableInfo.value = table;
        tableInfo.success.forEach(function(success) {
            success(table);
        });

    });
};

/**
 * @private
 * @param {Array<Object>} array
 * @return {!Array<!recoil.structs.table.ColumnKey>}
 */
aurora.db.Helper.getColumnKeys_ = function(array) {
    var res = [];

    for (var i = 0; i < array.length; i++) {
        res.push(array[i].key);
    }
    return res;
};

/**
 * @private
 * @param {!recoil.structs.table.ColumnKey} pk
 * @param {!Object} tableMeta
 * @return {{primaryKeys:!Array<!recoil.structs.table.ColumnKey>,otherKeys:!Array<!recoil.structs.table.ColumnKey>}}
 */
aurora.db.Helper.prototype.extractKeys_ = function(pk, tableMeta) {
    return aurora.db.Helper.extractKeys(pk, tableMeta);
};

/**
 * @param {!recoil.structs.table.ColumnKey} pk
 * @param {!Object} tableMeta
 * @return {{primaryKeys:!Array<!recoil.structs.table.ColumnKey>,otherKeys:!Array<!recoil.structs.table.ColumnKey>}}
 */
aurora.db.Helper.extractKeys = function(pk, tableMeta) {
    var primaryKeys = [];
    var otherKeys = [];

    for (var obj in tableMeta) {
        if (tableMeta.hasOwnProperty(obj)) {
            var val = tableMeta[obj];
            if (val.key === pk) {
                continue;
            } if (val.hasOwnProperty('primary')) {
                primaryKeys.push(val);
            }
            else {
                otherKeys.push(val.key);
            }
        }
    }
    /**
     * @suppress {missingProperties}
     * @param {?} a
     * @param {?} b
     * @return {number}
     */
    var comp = function(a, b) {
        return a.primary - b.primary;
    };

    primaryKeys.sort(comp);

    return {primaryKeys: [pk],
            otherKeys: aurora.db.Helper.getColumnKeys_(primaryKeys).concat(otherKeys)};

};

/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {Object} value
 * @param {recoil.db.PathMap=} currentErrors
 * @return {recoil.structs.table.Table}
 */
aurora.db.Helper.prototype.createTable = function(path, value, currentErrors) {
    return aurora.db.Helper.createTable(path, value, currentErrors);
};


/**
 * @private
 * @param {?} value
 * @param {?} orig
 * @param {Object} meta
 * @param {boolean=} opt_inlist
 * @return {?}
 */
aurora.db.Helper.makeServerValue_ = function(value, orig, meta, opt_inlist) {
    if (!meta || value == undefined) {
        if (meta && meta.type === 'id') {
            return meta.key.getDefault();
        }
        return value;
    }

    if ((opt_inlist && meta.isList) || meta.isObject) {
        let subTable = aurora.db.schema.getTable(meta.key);
        if (subTable) {
            let res = {};
            let isLeaf = meta.leaf;
            let fieldCount = 0;
            let fieldName = null;
            if (isLeaf) {
                for (let k in subTable.meta) {
                    let sMeta = subTable.meta[k];
                    if (sMeta.type === 'order' || sMeta.type === 'id') {
                        continue;
                    }
                    fieldCount++;
                    fieldName = k;
                }
            }
            if (fieldCount === 1) {
                let newValue = {};
                newValue[fieldName] = value;
                value = newValue;
            }
            let pos = 0;
            for (let k in subTable.meta) {
                let sMeta = subTable.meta[k];
                if (isLeaf) {
                    if (sMeta.type === 'id') {
                        if (orig == undefined) {
                            // make up a unique id for this
                            res[k] = sMeta.key.getDefault();
                        }
                        else {
                            res[k] = orig[k];
                        }
                        continue;
                    }

                }
                res[k] = aurora.db.Helper.makeServerValue_(value[k], orig ? orig[k] : null, sMeta, false);
            }
            return res;
        }
    }
    if (meta.isList) {
        let subTable = aurora.db.schema.getTable(meta.key);
        if (subTable) {
            if (meta.leaf) {
                return value.map(function(v, idx) {
                    let res = aurora.db.Helper.makeServerValue_(v, orig ? orig[idx] : null, meta, true);
                    for (let k in subTable.meta) {
                        let sMeta = subTable.meta[k];
                        if (sMeta.type === 'order') {
                            res[k] = idx;
                        }
                    }
                    return res;
                });
            }

            let primaryCols = subTable.info.keys;
            let comparator = aurora.db.Comms.comparePks(primaryCols.map(function(k) {return subTable.meta[k].key;}));
            let origMap = new goog.structs.AvlTree(comparator);
            if (orig) {
                orig.forEach(function(v) {
                    origMap.add({key: primaryCols.map(function(k) {return v[k];}), value: v});
                });
            }
            return value.map(function(v, idx) {
                let old = origMap.findFirst({key: primaryCols.map(function(k) {return v[k];}), value: null});
                return aurora.db.Helper.makeServerValue_(v, old ? old.value : null, meta, true);
            });

        }

    }
    return value;
};

/**
 * @private
 * @param {aurora.db.schema.TableType} table
 * @param {?} value
 * @return {?}
 */
aurora.db.Helper.makeTableObjectValue_ = function(table, value) {
    let res = {};
    for (var tMeta in table.meta) {
        var colKey = table.meta[tMeta].key;
        // item can be null if the toplevel container is not present
        res[colKey.getName()] = aurora.db.Helper.makeValue_(value[tMeta], table.meta[tMeta]);
    }
    return res;
};
/**
 * @private
 * @param {?} value
 * @param {Object} meta
 * @param {boolean=} opt_inlist
 * @return {?}
 */
aurora.db.Helper.makeValue_ = function(value, meta, opt_inlist) {
    if (value == undefined) {
        return value;
    }
    if (!(value instanceof Object)) {
        return value;
    }
    if (meta) {
        if ((opt_inlist && meta.isList) || meta.isObject) {
            let subTable = aurora.db.schema.getTable(meta.key);
            if (subTable) {
                let res = {};
                let isLeaf = meta.leaf;
                let fields = [];
                for (let k in subTable.meta) {
                    let sMeta = subTable.meta[k];
                    if (isLeaf) {
                        if (sMeta.type === 'order') {
                            continue;
                        }
                        if (sMeta.type === 'id') {
                            continue;
                        }

                    }
                    fields.push(k);
                    res[k] = aurora.db.Helper.makeValue_(value[k], sMeta, false);
                }

                return isLeaf && fields.length === 1 ? res[fields[0]] : res;

            }
            return value;
        }

        if (meta.isList) {
            return value.map(function(v) {
                return aurora.db.Helper.makeValue_(v, meta, true);
            });
        }

    }
    return value;
};
/**
 * @param {!aurora.db.Schema} schema
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tableB
 * @param {!recoil.frp.Behaviour<Array>} pkB
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */
aurora.db.Helper.createSubTableB = function(schema, tableB, pkB, col) {
    let frp = tableB.frp();

    return frp.liftBI(function(baseTable) {
        let pk = pkB.get();
        let row = null;
        if (!baseTable) {
            return null;
        }
        let basePath = baseTable.getMeta().basePath;
        if (pk === null) {
            // just find a row should only be one if no pk specified
            baseTable.forEach(function(r, pks) {
                row = r;
                pk = pks;
            });
        }
        else {
            row = baseTable.getRowKeys(pk);
        }

        let tbl = null;
        if (row) {
            let pkNames = baseTable.getPrimaryColumns().map(function(col) {return col.getName();});
            let path = basePath.setKeys(pkNames, pk).appendName(col.getName());
            let errors = new recoil.db.PathMap(schema);
            let cellErrors = row.getCellMeta(col).errors || [];
            cellErrors.forEach(function(e) {
                if (e.path) {
                    errors.put(e.path, e);
                }
            });

            tbl = aurora.db.Helper.createTable(path, row.get(col), errors).unfreeze();

        }
        else {

            tbl = aurora.db.Helper.createTable(basePath, []).unfreeze();
        }
        if (baseTable.getMeta().permContext) {
            tbl.addMeta({permContext: baseTable.getMeta().permContext});
        }
        let tableT = aurora.db.schema.getTable(col);
        if (tableT && tbl) {
            aurora.db.PermDatabase.addTablePermissions(tbl, tableT);
        }

        return tbl.freeze();

    }, function(tbl) {
        let res = tableB.get().createEmpty();
        let basePath = tableB.get().getMeta().basePath.appendName(col.getName());
        let pk = pkB.get();
        tableB.get().forEachModify(function(row, pks) {

            if (pk === null || recoil.util.object.isEqual(pk, pks)) {
                let keyInfo = aurora.db.schema.keyMap[basePath.pathAsString()];

                let toList = aurora.db.Comms.convertFromTable_(tbl, row.get(col), keyInfo);
                row.set(col, toList);
            }
            res.addRow(row);
        });
        tableB.set(res.freeze());
    }, tableB, pkB);
};

/**
 * @param {!aurora.db.schema.TableType} tbl
 * @return {recoil.structs.table.Table}
 */
aurora.db.Helper.createEmptyTable = function(tbl) {
    return aurora.db.Helper.createTable(recoil.db.ChangeSet.Path.fromString(tbl.info.path), []);
};
/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {Object} value
 * @param {recoil.db.PathMap=} currentErrors
 * @return {recoil.structs.table.Table}
 */
aurora.db.Helper.createTable = function(path, value, currentErrors) {
    var keyInfo = aurora.db.Comms.pathToInfo(path);
    var tableMeta = keyInfo.meta;
    var primaryMeta = [];
    var keys = aurora.db.Helper.extractKeys(keyInfo.info.pk, tableMeta);
    var tbl = new recoil.structs.table.MutableTable(keys.primaryKeys, keys.otherKeys);
    let filterSilent = function(errors) {
        if (errors) {
            return errors;
        }
        let res = [];
        for (let i = 0; i < errors.length; i++) {
            if (!errors[i].silent) {
                res.push(errors[i]);
            }
        }
        return res;
    };
    let order = null;
    for (var k in tableMeta) {
        var meta = tableMeta[k];
        if (meta && meta.hasOwnProperty('primary')) {
            primaryMeta.push({name: k, meta: meta});
        }
        if (meta && meta.type === 'order') {
            order = k;
        }
    }

    primaryMeta.sort();

    tbl.setMeta({'typeFactories': aurora.Client.typeFactories, basePath: path});

    for (var tMeta in tableMeta) {
        var colKey = tableMeta[tMeta].key;
        tbl.setColumnMeta(colKey, tableMeta[tMeta]);
    }
    var pkNames = [];
    for (var j = 0; j < primaryMeta.length; j++) {
        pkNames.push(primaryMeta[j].name);
    }
    var i = 0;
    if (value) {
        value.forEach(function(item) {
            if (!item) {
                return; // doesn't really exist
            }
            var pks = [];
            for (var j = 0; j < primaryMeta.length; j++) {
                pks.push(item[primaryMeta[j].name]);
            }
            var rowPath = path.setKeys(pkNames, pks);
            var row = new recoil.structs.table.MutableTableRow(i);
            // adjust the path so it includes the key


            for (var tMeta in tableMeta) {
                var colKey = tableMeta[tMeta].key;
                // item can be null if the toplevel container is not present
                row.set(colKey, aurora.db.Helper.makeValue_(item[tMeta], tableMeta[tMeta]));
                if (currentErrors) {
                    row.addRowMeta({errors: filterSilent(currentErrors.getExact(rowPath))});
                    row.addCellMeta(
                        colKey,
                        {errors: filterSilent(currentErrors.get(rowPath.appendName(tMeta)))});
                }
            }
            if (order !== null) {
                row.setPos(parseInt(item[order], 10));
            }

            tbl.addRow(row);
            i++;
        });
    }
    return tbl.freeze();
};
/**
 * instruct the databse that we are no longer interested
 * @template T
 * @param {!recoil.db.Type<T>} id identifier of the object that to be retrieve from the database
 * @param {?} key the information we need to get the object/objects
 * @param {recoil.db.QueryOptions} options
 */
aurora.db.Helper.prototype.stop = function(id, key, options) {
    let queryKey = this.keyToQuery_(key);
    let entry = this.tblMap_.findFirst({key: id.uniqueId()});
    if (!entry) {
        return;
    }
    let colSerializer = new aurora.db.Serializer();
    let entryKey = {query: queryKey, options: options};
    let query = entry.queries.findFirst({key: entryKey});
    if (query) {
        this.channel_.send({name: id.getData().name, query: queryKey.serialize(colSerializer), options: options.serialize(), command: 'stop'});
        console.log('implement remove from database');
        // we need to go through all of our queries and remove the items that do not match any
        // also we have to deal with values that are added but don't match the query
        //this.db_.remove(this.makePath_(id.getData().name, key));

        entry.queries.remove({key: entryKey});
        if (entry.queries.getCount() === 0) {
            this.tblMap_.remove({key: id.uniqueId()});
        }
    }
};

/**
 * @private
 * @param {string} name
 * @param {Array} key
 * @return {!recoil.db.ChangeSet.Path}
 */

aurora.db.Helper.prototype.makePath_ = function(name, key) {
    return recoil.db.ChangeSet.Path.fromString(name);
};

/**
 * if a connection is lost we need to reget everything once it is re-established
 */
aurora.db.Helper.prototype.reregister = function()  {
    var me = this;
    me.currentErrors_ = new recoil.db.PathMap(this.schema_);
    me.queuedChanges_ = [];
    me.erroredChanges_ = [];
    let colSerializer = new aurora.db.Serializer();
    this.tblMap_.inOrderTraverse(function(entry) {
        entry.queries.inOrderTraverse(function(node) {
            console.log('re-registering', node);
            let idSeq = this.transId_.next();

            me.channel_.send({name: entry.id.getData().name, id: idSeq, query: node.key.query.serialize(colSerializer), options: node.query.options.serialize(), command: 'get'});
        });
    });
};

/**
 * @private
 * @param {!recoil.db.Query|!Array<?>} inKey the information we need to get the object/objects
 * @return {!recoil.db.Query}
 */
aurora.db.Helper.prototype.keyToQuery_ = function(inKey) {
    let query = new recoil.db.Query();
    if (inKey instanceof recoil.db.Query) {
        return inKey;
    }
    else if (inKey && inKey.length > 0) {
        return query.and.apply(query, inKey);
    }
    return query.True();
};

/**
 * @private
 * @template T
 * @param {function(T)} success called when the data is retrieve from the database, maybe called multiple times
 * @param {function(!recoil.frp.BStatus)} failure called when the data fails to be retrieved from the database, maybe called multiple times
 * @param {!recoil.db.Type<T>} id identifier of the object that to be retrieve from the database
 * @param {!recoil.db.Query|!Array<?>} inKey the information we need to get the object/objects
 * @param {!recoil.db.QueryOptions} options
 */
aurora.db.Helper.prototype.get_ = function(success, failure, id, inKey, options) {
    if (id.getData().action) {
        success({action: null, data: null, output: null, enabled: recoil.ui.BoolWithExplanation.TRUE});
        return;
    }

    let key = this.keyToQuery_(inKey);

    options = options.cleanStart();
    let colSerializer = new aurora.db.Serializer();
    var keyInfo = aurora.db.schema.keyMap[id.getData().name];

    var existingEntry = this.findQuery_(keyInfo, key, options);
    var existing = existingEntry ? existingEntry.value : null;
    if (existing) {
        existing.success.push(success);
        existing.failure.push(failure);
        if (existing.value) {
            success(existing.value);
        }
    }
    else {
        let idSeq = this.transId_.next();
        this.client_.registerLoad(aurora.db.Helper.makeLoadId(idSeq, id, key, options));

        this.channel_.send({name: id.getData().name, id: idSeq, query: key.serialize(colSerializer), options: options.serialize(), command: 'get'});

        let entry = this.tblMap_.findFirst({key: id.uniqueId()});
        let queryKey = {query: key, options: options};
        if (!entry) {
            entry = {key: id.uniqueId(), queries: new goog.structs.AvlTree(recoil.util.object.compareKey)};
            this.tblMap_.add(entry);
        }
        existing = {id: id, keys: key, value: null, success: [success], failure: [failure]};

        entry.queries.add({key: queryKey, matches: new goog.structs.AvlTree(recoil.util.compare), added: new goog.structs.AvlTree(recoil.util.compare), value: existing});
    }
};

/**
 * @template T
 * @param {string} idSeq
 * @param {!recoil.db.Type<T>} id
 * @param {recoil.db.Query} query
 * @param {recoil.db.QueryOptions} options
 * @return {{id: string, info:string}}
 */
aurora.db.Helper.makeLoadId = function(idSeq, id, query, options) {
    var res = id.uniqueId() + ':' + id.getData().name;
    res += '[' + (query ? JSON.stringify(query.serialize(new aurora.db.Serializer())) : '') + ']';
    res += '[' + (options ? JSON.stringify(options.serialize()) : '') + ']';
    return {id: idSeq, info: res};
};

/**
 * @private x
 * @param {!goog.structs.AvlTree<{key:!recoil.db.ChangeSet.Path, id: number}>} idMap
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes
 * @param {(Array<{id:(undefined|?),children:(!Array|undefined)}>|undefined)} results
 */
aurora.db.Helper.prototype.addChangesToIdMap_ = function(idMap, changes, results) {
    if (results) {
        for (let i = 0; i < changes.length; i++) {
            let change = changes[i];
            if (results[i].error) {
                continue;
            }

            if (change instanceof recoil.db.ChangeSet.Add && results[i].id != null) {
                idMap.add({key: aurora.db.Comms.getErrorPath(change), id: results[i].id});
                this.addChangesToIdMap_(idMap, change.dependants(), results[i].children);
            }
        }
    }
};
/**
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes
 * @param {!recoil.db.PathMap} currentErrors
 * @param {undefined|Array} serverResults
 * @return {!goog.structs.AvlTree}
 */
aurora.db.Helper.prototype.updateEffectedTables = function(changes, currentErrors, serverResults) {
    var effectedTables = [];
    var me = this;
    // build a map of path memid ->
    // make it that longer paths occur first in the list that way we do not screw up parent paths before
    // we insert the child
    console.log('update references to keys as well');
    let idMap = new goog.structs.AvlTree(function(x, y) {
        let res = y.key.size() - x.key.size();
        if (res !== 0) {
            return res;
        }
        return recoil.util.object.compareKey(x, y);
    });
    this.addChangesToIdMap_(idMap, changes, serverResults);
    idMap.inOrderTraverse(function(entry) {
        let pk = entry.key.lastKeys()[0];
        let newPk = new aurora.db.PrimaryKey(entry.id, pk.mem);
        let tbl = aurora.db.schema.getTableByName(entry.key);
        let tblInfo = me.tblMap_.findFirst({key: tbl.key.uniqueId()});
        if (tblInfo) {
            tblInfo.queries.inOrderTraverse(function(q) {
                if (q.added.remove(pk) && !q.added.findFirst(newPk)) {
                    q.added.add(newPk);
                }
            });
        }

        me.db_.updatePk(me.schema_, entry.key, [newPk]);
    });
    this.tblMap_.inOrderTraverse(function(qEntry) {
        qEntry.queries.inOrderTraverse(function(entry) {
            var tblInfo = entry.value;
            var tblPath = me.makePath_(tblInfo.id.getData().path, entry.key.keys);
            for (var i = 0; i < changes.length; i++) {
                var change = changes[i];
                if (tblPath.isAncestor(aurora.db.Comms.getErrorPath(change), true)) {
                    // TODO check that tblPath actually
                    // contains change it maybe filtered

                    effectedTables.push(tblInfo);
                    break;
                }
                if (change instanceof recoil.db.ChangeSet.Add || change instanceof recoil.db.ChangeSet.Delete) {
                    if (change.path().isAncestor(tblPath, false)) {
                        effectedTables.push(tblInfo);
                        break;
                    }
                }
            }
        });
    });

    effectedTables.forEach(function(info) {
        me.updateTable(recoil.db.ChangeSet.Path.fromString(info.id.getData().name), currentErrors);
    });
    return idMap;
};



/**
 * @implements {recoil.db.DatabaseComms}
 * @constructor
 * @param {!recoil.db.ChangeDb} db
 * @param {!aurora.db.Schema} schema
 * @param {!aurora.Client} client
 */
aurora.db.Comms = function(db, schema, client) {
    this.schema_ = schema;
    this.pendingActions_ = {};
    this.transId_ = new recoil.util.Sequence();
    this.queuedChanges_ = [];
    this.sentChanges_ = [];
    this.erroredChanges_ = [];
    this.actionErrorListeners_ = [];
    this.db_ = db;
    this.currentErrors_ = new recoil.db.PathMap(schema);
    this.helper_ = new aurora.db.Helper(this, this.db_, client, schema, this.transId_);
    this.client_ = client;
    this.transactional_ = true;
};

/**
 * @param {function(?)} callback
 */
aurora.db.Comms.prototype.addActionErrorListener = function(callback) {
    this.actionErrorListeners_.push(callback);
};
/**
 * after disconnection we have to re-register every thing we are interested in
 */
aurora.db.Comms.prototype.reregister = function() {
    this.helper_.reregister();
};

/**
 * @param {!aurora.db.schema.ActionType} action
 * @param {!Array<?>=} opt_pathParams
 * @param {!Object=} opt_params the params to the action
 * @param {function(Object,?)=} opt_callback
 */
aurora.db.Comms.prototype.performAction = function(action, opt_pathParams, opt_params, opt_callback) {
    // build up the path
    var path = new recoil.db.ChangeSet.Path([]);
    var curParam = 0;
    action.path.forEach(function(part) {
        if (part.name) {
            var keys = [];
            for (var i = 0; i < opt_pathParams.length; i++) {
                keys.push(opt_pathParams[curParam++]);
            }
            path = path.append(new recoil.db.ChangeSet.PathItem(part.name, path.keys, keys));
        }
        else {
            path = path.appendName(part);
        }
    });

    var id = this.transId_.next();
    var serializor = aurora.db.Comms.valSerializer_;
    var compressor = new recoil.db.ChangeSet.DefaultPathCompressor();
    var inputs = {};
    if (opt_params) {
        for (var k in opt_params) {
            inputs[k] = serializor.serialize(path.appendName(k), opt_params[k]);
        }
    }
    if (opt_callback) {
        this.pendingActions_[id] = {action: action, callback: opt_callback};
    }

    this.channel_.send({'command': 'action', id: id, path: path.serialize(serializor, compressor), inputs: inputs});

};
/**
 * @param {!IArrayLike} args
 * @return {!Object}
 */
aurora.db.Comms.prototype.makeKey = function(args) {
    return args;
};

/**
 * @param {aurora.db.schema.TableType} tbl
 * @param {!recoil.db.Query} query
 * @param {!recoil.db.QueryOptions} options
 * @param {?} error
 */
aurora.db.Comms.prototype.updateTableError = function(tbl, query, options, error) {
    this.helper_.updateTableError(tbl, query, options, error);
};
/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {!recoil.db.PathMap} errors
 */
aurora.db.Comms.prototype.updateTable = function(path, errors) {
   this.helper_.updateTable(path, errors);
};

/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {?} obj
 * @param {aurora.db.Schema} schema
 * @return {?}
 */
aurora.db.Comms.deserialize = function(path, obj, schema) {
    let res;
    let cls = aurora.db.Comms;

    if (schema.isLeaf(path)) {
        var contDef = schema.getContainerDef(path.parent());
        if (contDef) {
            return aurora.db.Comms.valSerializer_.deserialize(path, obj);
        }
        return obj;
    }

    res = obj;
    if (obj instanceof Array) {
        res = [];
        for (var i = 0; i < obj.length; i++) {
            res.push(cls.deserialize(path, obj[i], schema));
        }
    }
    else if (obj instanceof Object) {
        res = {};
        for (var key in obj) {
            res[key] = cls.deserialize(path.appendName(key), obj[key], schema);
        }
    }
    return res;
};

/**
 * @param {!aurora.db.Comms} me
 * @return {function(recoil.db.ChangeSet.Path,!recoil.db.ChangeDb,?, ?)}
 */
aurora.db.Comms.setChangesInDb = function(me) {
    return function(path, db, value, query) {
        var changedObjects = db.setRoot(path, value, query);
        changedObjects.forEach(function(path) {
            me.helper_.updateTable(path, undefined);
        });
    };
};

/**
 * @private
 * @return {Object}
 */
aurora.db.Comms.prototype.createChannel_ = function() {
    var schema = this.schema_;
    let Query = recoil.db.Query;
    let QueryOptions = recoil.db.QueryOptions;
    var me = this;
    var setChangesInDb = aurora.db.Comms.setChangesInDb(this);
    var pendingChanges = [];
    let colDeserializer = new aurora.db.Serializer();
    if (!this.channel_) {
        this.channel_ = aurora.websocket.getObjectChannel(
            aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA,
            /**
             * @param {!coms.Command} obj
             */
            function(obj) {
                if (obj.command === 'action-response') {
                    var actionInfo = me.pendingActions_[obj.id];
                    if (actionInfo) {
                        if (obj.error) {
                            actionInfo.callback(null, obj.results);
                        }
                        else {
                            actionInfo.callback(obj.results, null);
                        }
                        delete me.pendingActions_[obj.id];
                    }
                } else if (obj.command === 'full') {
                    var path = aurora.db.Comms.makeRootPath(obj.name, [], schema);
                    var info = aurora.db.Comms.pathToInfo(path);
                    let query = Query.deserialize(obj['query'], colDeserializer);
                    let options = QueryOptions.deserialize(obj['options']);
                    let loadId = aurora.db.Helper.makeLoadId(
                        obj['id'], info.key, query, options);
                    if (options.isCount()) {
                        // hear we should deal with count
                        me.helper_.updateCount(info, query, options, obj['value-error'], obj['value']);
                        me.client_.registerLoadDone(loadId);

                    }
                    else if (obj['value-error']) {
                        console.error('error result', obj['value-error']);
                        me.updateTableError(info, query, options, obj['value-error']);
                        me.client_.registerLoadDone(loadId);
                    }
                    else {
                        obj.value = aurora.db.Comms.deserialize(path, obj.value, me.schema_);
                        try {
                            let filter = me.helper_.updateQueryInfo_(info, query, options, obj.value);
                            if (filter) {
                                setChangesInDb(path, me.db_, obj.value, filter);
                            }
                            me.client_.registerLoadDone(loadId);
                        }catch (e) {
                            console.error(e);
                            me.client_.registerLoadDone(loadId);
                        }
                    }

                }
                else if (obj.command === 'action') {
                    let action = me.pendingActions_[obj.id];
                    if (action) {
                        delete me.pendingActions_[obj.id];
                        action.success({action: null, id: obj.id, output: {value: obj.outputs, error: obj.error}, enabled: recoil.ui.BoolWithExplanation.TRUE});
                        if (obj.error) {
                            console.error('got error action', obj.error);
                            me.actionErrorListeners_.forEach(cb => cb(obj.error));
                        }
                    }
                }
                else if (obj.command === 'set') {
                    var setChanges = me.sentChanges_;
                    var idMap = null;
                    if (setChanges) {

                        console.log('got set result', obj);
                        me.currentErrors_ = new recoil.db.PathMap(schema);
                        let notApplied = aurora.db.Comms.generateErrors(obj.results, setChanges, me.currentErrors_);
                        if (me.transactional_ && notApplied.unapplied.length > 0)  {
                            // if it is transactional reverse all the changes they do not stack
                            // the will simply cause all future changes to not be applied
                            me.db_.applyChanges(setChanges.map(x => x.inverse(schema)));
                        }
                            
                        idMap = me.helper_.updateEffectedTables(setChanges, me.currentErrors_, obj.results);
                        if (me.transactional_) {
                            me.erroredChanges_ = [];
                        }
                        else {
                            me.erroredChanges_ = notApplied.unapplied;
                        }


                        me.sentChanges_ = [];
                        
                        if (notApplied.unapplied.length > 0) {
                            console.error('UPDATE ERRORS', obj.results, setChanges, notApplied, me.currentErrors_);
                        }
                    }

                    if (me.queuedChanges_.length > 0) {
                        var sendChanges = me.erroredChanges_ || [];
                        me.queuedChanges_.forEach(function(change) {
                            // update queued changes path we new path ids
                            sendChanges.push(change.forEachChange(function(c) {
                                let changePath = c.path();
                                while (changePath.size() > 1) {
                                    let lastKeys = changePath.lastKeys();

                                    if (lastKeys.length == 1 && lastKeys[0] instanceof aurora.db.PrimaryKey) {

                                        let newId = idMap.findFirst({key: changePath});
                                        if (newId) {
                                            let newKey = new aurora.db.PrimaryKey(newId.id, lastKeys[0].mem);
                                            c = c.setPathKeys([newKey], changePath.size() - 1);
                                        }
                                    }
                                    changePath = changePath.parent();
                                }

                                return c;
                            }));
                        });
                        me.queuedChanges_ = [];
                        me.erroredChanges_ = [];
                        var mergedChanges = recoil.db.ChangeSet.merge(schema, sendChanges);
                        var toSend = {
                            command: 'set',
                            id: me.transId_.next(),
                            list: recoil.db.ChangeSet.Change.serializeList(mergedChanges, false, schema, aurora.db.Comms.valSerializer_)
                        };

                        me.sentChanges_ = mergedChanges;
                        if (mergedChanges.length > 0) {

                            me.channel_.send(toSend);
                        }
                        else {
                            me.currentErrors_ = new recoil.db.PathMap(schema);
                            me.helper_.updateEffectedTables(sendChanges, this.currentErrors_, undefined);
                        }
                    }

                }

            });
    }
    return this.channel_;
};

/**
 * instruct the databse that we are no longer interested
 * @template T
 * @param {!recoil.db.Type<T>} id identifier of the object that to be retrieve from the database
 * @param {?} key the key to stop
 * @param {?} options the key to stop
 */
aurora.db.Comms.prototype.stop = function(id, key, options) {
    this.helper_.stop(id, key, options);
};

/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {aurora.db.schema.TableType}
 */
aurora.db.Comms.pathToInfo = function(path) {
    var pathStr = path.pathAsString();
    var res = aurora.db.schema.keyMap[pathStr];
    if (res) {
        return res;
    }
    return aurora.db.schema.keyMap[pathStr.substr(1)];
};

/**
 * @private
 * @param {!Object} keyInfo
 * @return {!Array<string>}
 */
aurora.db.Comms.createKeyMap_ = function(keyInfo) {
    var keyMap = {};
    var keyList = [];
    /*
    for (var col in keyInfo.pk) {
        if (keyInfo.meta[col].primary !== undefined) {
            keyMap[keyInfo.info.primary] = col;
        }
    }
    for (var idx = 0; keyMap[idx]; idx++) {
        keyList.push(keyMap[idx]);
    }
    */
    return keyList;
};

/**
 * given an original object and new object update $pk on the new object
 * if it does not exist, if it matches the existing object it will use the existing objects pk
 * otherwize it will generate a new one
 * @param {aurora.db.schema.TableType} keyInfo schema information about obj
 * @param {Object} origObj the object to set the primary key on
 * @param {Object} newObj the object to set the primary key on
 */
aurora.db.Comms.updatePrimaryKeys = function(keyInfo, origObj, newObj) {
    if (!newObj) {
        return;
    }
    /*
    var subInfo;
    var keyList = aurora.db.Comms.createKeyMap_(keyInfo);
    var doSub = function(origObj, newObj) {
        for (var col in newObj) {
            subInfo = aurora.db.schema.keyMap[keyInfo.info.name + '/' + col];
            if (subInfo) {
                aurora.db.Comms.updatePrimaryKeys(subInfo, origObj ? origObj[col] : null, newObj[col]);
            }
        }
    };
    if (keyList.length > 0) {
        var origKeyMap = new goog.structs.AvlTree(recoil.util.object.compareKey);
        var origPkMap = {};
        var pk;
        if (origObj) {
            for (var i = 0; i < origObj.length; i++) {
                var origKeys = [];
                var origRow = origObj[i];
                pk = origRow['$pk'];
                if (pk !== undefined) {
                    keyList.forEach(function(keyName) {
                        origKeys.push(origRow[keyName]);
                    });
                    origKeyMap.add({key: origKeys, pk: pk, obj: origRow});
                    origPkMap[pk] = {keys: origKeys, obj: origRow};
                }
            }

        }

        for (i = 0; i < newObj.length; i++) {
            var newRow = newObj[i];
            pk = newRow['$pk'];
            if (pk !== undefined && pk !== null) {
                var keys = origPkMap[pk];
                if (keys) {
                    origKeyMap.remove({key: keys.keys});
                    doSub(keys.obj, newRow);

                }
                else {
                    doSub(null, newRow);
                }
            }
        }
        for (i = 0; i < newObj.length; i++) {
            var newKeys = [];
            newRow = newObj[i];
            if (pk === undefined || pk === null) {

                keyList.forEach(function(keyName) {
                    newKeys.push(newRow[keyName]);
                });
                var existing = origKeyMap.findFirst({key: newKeys});
                if (existing) {
                    newRow['$pk'] = existing.pk;
                    doSub(existing.obj, newRow);
                }
                else {
                    newRow['$pk'] = keyInfo.cols.$pk.getDefault();
                    doSub(null, newRow);
                }
            }

        }
    }
    else {
        delete newObj['$pk'];
        doSub(origObj, newObj);
    }
    */
};

/**
 * @param {!recoil.db.ChangeSet.Change} change
 * @return {!recoil.db.ChangeSet.Path}
 */
aurora.db.Comms.getErrorPath = function(change) {
    var path = change.to ? change.to() : change.path();
    return new aurora.db.Schema().absolute(path);
};
/**
 * given a path it will adjust it for any move that happen after it
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes
 * @param {number} start
 * @return {!recoil.db.ChangeSet.Path}
 */
aurora.db.Comms.adjustPath = function(path, changes, start) {
    var outPath = path;
    for (var i = start; i < changes.length; i++) {
        var change = changes[i];
        if (change instanceof recoil.db.ChangeSet.Move) {
            outPath = path.move(change.from(), change.to());

        }
        if (change instanceof recoil.db.ChangeSet.Delete) {
            if (change.path().isAncestor(outPath, false)) {
                return outPath;
            }
        }
    }
    return outPath;
};
/**
 * generates a list of changes that where not applied due to this
 * change set being applied
 * @param {!Array<Object>} results an array of errors matching the changes
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes an array of changes that where being applied
 * @param {!recoil.db.PathMap<Object>} errorMap a map of path to errors
 * @return {{count:number, errors: number, unapplied:Array<!recoil.db.ChangeSet.Change>}}
 */
aurora.db.Comms.generateErrors = function(results, changes, errorMap) {
    var cleanError = function(error) {
        if (!error) {
            return error;
        }
        if (error.errorno && error.message) {
            if (error.message.startsWith('maapi_move:')) {
                return error.errorno;
            }
        }
        return error;
    };

    var res = {count: 0, errors: 0, unapplied: []};
    for (let changeIdx = 0; changeIdx < changes.length; changeIdx++) {
        var change = changes[changeIdx];
        var error = cleanError(results[changeIdx].error);
        var path = aurora.db.Comms.getErrorPath(change);
        if (error === null) {
            if (change.dependants) {
                var subRes = aurora.db.Comms.generateErrors(results[changeIdx].children, change.dependants(), errorMap);
                subRes.unapplied.forEach(function(subChange) {
                    res.unapplied.push(subChange);
                });
                res.errors += subRes.errors;
                res.count += subRes.count;
            }
            res.count++;
            errorMap.remove(aurora.db.Comms.getErrorPath(change));
        }
        else {
            var adjPath = aurora.db.Comms.adjustPath(path, changes, changeIdx);
            errorMap.put(adjPath, {path: adjPath, error: error});
            res.unapplied.push(change);
            res.errors++;
            res.count++;
        }

    }
    return res;
};


/**
 * @param {!recoil.structs.table.Table} table
 * @param {!Object} info
 * @return {Object}
 */
aurora.db.Comms.convertFromTable = function(table, info) {
    var res = [];
    var columns = table.getColumns();
    var colNames = [];
    columns.forEach(function(col) {
        for (var name in info.meta) {
            if (info.meta[name].key === col) {
                colNames.push(name);
                break;
            }
        }
    });

    table.forEach(function(row) {
        var outRow = {};
        for (var i = 0; i < colNames.length; i++) {
            outRow[colNames[i]] = row.get(columns[i]);
        }
        res.push(outRow);
    });
    return info.info.keys ? res : res[0];
};


/**
 * @param {!recoil.structs.table.Table} table
 * @param {!Object} oldValue
 * @param {!Object} info
 * @return {Object}
 */
aurora.db.Comms.convertFromTable_ = function(table, oldValue, info) {
    var res = [];
    var columns = table.getColumns();
    var colNames = [];
    columns.forEach(function(col) {
        for (var name in info.meta) {
            if (info.meta[name].key === col) {
                colNames.push(name);
                break;
            }
        }
    });
    let primaryCols = table.getPrimaryColumns();

    let comparator = aurora.db.Comms.comparePks(primaryCols);

    let oldRowMap = new goog.structs.AvlTree(comparator);

    oldValue = info.info.keys ? oldValue : [oldValue];
    oldValue.forEach(function(v) {
        let key = primaryCols.map(function(col) {
            return v[col.getName()];
        });
        oldRowMap.add({key: key, value: v });
    });


    table.forEach(function(row) {
        var outRow = {};
        for (var i = 0; i < colNames.length; i++) {
            let colName = colNames[i];
            let oldRow = (oldRowMap.findFirst({key: table.getRowKeys(row), value: {}}) || {value: {}}).value;
            outRow[colName] = aurora.db.Helper.makeServerValue_(row.get(columns[i]), oldRow[columns[i].getName()], info.meta[colName]);
        }
        res.push(outRow);
    });
    return info.info.keys ? res : res[0];
};

/**
 * @param {!Array<!recoil.structs.table.ColumnKey>} primaryCols list of the key columns
 * @return {function(?,?):number}
 */
aurora.db.Comms.comparePks = function(primaryCols) {
    return function(a, b) {
        for (let key = 0; key < primaryCols.length; key++) {
            var col = primaryCols[key];
            var res = col.valCompare(a.key[key], b.key[key]);
            if (res !== 0) {
                return res;
            }
        }
        return 0;
    };
};




/**
 * @type {!recoil.db.ChangeSet.ValueSerializor}
 * @private
 */
aurora.db.Comms.valSerializer_ = new aurora.db.ValueSerializor();

/**
 * sets data to the database
 * @template T
 * @param {T} data to set
 * @param {T} oldData old data that we already been received this can be used to only send changes
 * @param {function(T)} successFunc called when the data is retrieve from the database, the parameter is the set data
 * @param {function(recoil.frp.BStatus)} failFunc called when the data fails to be retrieved from the database
 * @param {!recoil.db.Type<T>} id identifier of the object that to be retrieve from the database
 * @param {?} inKey the information we need to get the object/objects
 * @param {recoil.db.QueryOptions} options
 */
aurora.db.Comms.prototype.set = function(data, oldData, successFunc, failFunc, id, inKey, options) {
    if (id.getData().action) {
        let idSeq = this.transId_.next();
        let toSend = {'command': 'action', 'id': idSeq, 'inputs': data.action, 'path': id.getData().path};
        this.pendingActions_[idSeq] = {success: successFunc, fail: failFunc};
        this.channel_.send(toSend);
        successFunc({action: null, output: null, enabled: recoil.ui.BoolWithExplanation.FALSE});
        return;
    }
    let key = this.helper_.keyToQuery_(inKey);

    let schema = this.schema_;
    var old = [];
    var keyInfo = aurora.db.schema.keyMap[id.getData().name];
    let me = this;
    let path = recoil.db.ChangeSet.Path.fromString(keyInfo.info.name);
    let oldObj = me.helper_.filterQuery_(me.db_.get(path), keyInfo, key, options || new recoil.db.QueryOptions(), false);
    let newObj = aurora.db.Comms.convertFromTable_(data, oldObj, keyInfo);

    // sub pks may have been lost put them back
    aurora.db.Comms.updatePrimaryKeys(keyInfo, oldObj, newObj);
    var changes = recoil.db.ChangeSet.diff(
        oldObj, newObj,
        recoil.db.ChangeSet.Path.fromString(keyInfo.info.name),
        keyInfo.info.pk.getName(), schema);
    if (changes.changes.length === 0) {
        this.updateTable(recoil.db.ChangeSet.Path.fromString(id.getData().name), this.currentErrors_);
        return;
    }
    let transId = this.transId_.next();

    this.helper_.updateAddedNew_(changes.changes, keyInfo, key, options || new recoil.db.QueryOptions());
    this.db_.applyChanges(changes.changes);
    this.helper_.updateEffectedTables(changes.changes, this.currentErrors_, null);

    let sendChanges = [];
    this.erroredChanges_.forEach(function(change) {
        sendChanges.push(change);
    });

    this.queuedChanges_.forEach(function(change) {
        sendChanges.push(change);
    });

    changes.changes.forEach(function(change) {
        sendChanges.push(change);
    });
    var mergedChanges = recoil.db.ChangeSet.merge(schema, sendChanges);

    if (this.sentChanges_.length > 0) {
        this.queuedChanges_ = mergedChanges;
    }
    else {
        this.sendId_ = transId;
        var toSend = {
            command: 'set',
            id: transId,
            list: recoil.db.ChangeSet.Change.serializeList(mergedChanges, false, schema, aurora.db.Comms.valSerializer_)
        };
        this.sentChanges_ = mergedChanges;
        if (mergedChanges.length > 0) {
            this.channel_.send(toSend);
        }
        else {
            this.currentErrors_ = new recoil.db.PathMap(schema);
            this.helper_.updateEffectedTables(sendChanges, this.currentErrors_, undefined);
        }
    }
};
/**
 * gets data from the database
 *
 * @template T
 * @param {function(T)} success called when the data is retrieve from the database, maybe called multiple times
 * @param {function(!recoil.frp.BStatus)} failure called when the data fails to be retrieved from the database, maybe called multiple times
 * @param {!recoil.db.Type<T>} id identifier of the object that to be retrieve from the database
 * @param {?} key the information we need to get the object/objects
 * @param {recoil.db.QueryOptions} options
 *
 */
aurora.db.Comms.prototype.get = function(success, failure, id, key, options) {
    this.helper_.get_(success, failure, id, key, options || new recoil.db.QueryOptions());
};


/**
 * @param {string} name
 * @param {Array} keys
 * @param {!aurora.db.Schema} schema
 * @return {!recoil.db.ChangeSet.Path}
 */
aurora.db.Comms.makeRootPath = function(name, keys, schema) {
    return schema.makeRootPath(name, keys, aurora.db.Comms.valSerializer_, new recoil.db.ChangeSet.DefaultPathCompressor());
};



/**
 * called when a frp transaction is started
 */
aurora.db.Comms.prototype.startTrans = function() {
};


/**
 * called when a frp transaction is ended, if you want to store changes up until every thing
 * is propogated use this
 */
aurora.db.Comms.prototype.stopTrans = function() {
};
