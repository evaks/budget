goog.provide('aurora.db.sql.Reader');

goog.require('aurora.db.Reader');
goog.require('aurora.db.Schema');
goog.require('aurora.log');
goog.require('recoil.db.QueryExp');
goog.require('recoil.db.expr.Equals');


/**
 * @constructor
 * @param {!recoil.db.DBQueryScope} scope
 * helper to map ids to function
 */
aurora.db.sql.TableIdMap = function(scope) {
    this.tableMap_ = {};
    this.scope_ = scope;
};

/**
 * @param {!Array<string>} path
 * @return {string}
 */
aurora.db.sql.TableIdMap.prototype.get = function(path) {
    let key = JSON.stringify(path); // make sure path is unique
    let val = this.tableMap_[key];
    if (val === undefined) {
        val = this.scope_.nextTable();
        this.tableMap_[key] = val;
    }
    return val;
};

/**
 * @constructor
 * @implements {aurora.db.Reader}
 * @implements {recoil.db.Escaper}
 * @param {!aurora.db.Pool} driver
 */

aurora.db.sql.Reader = function(driver) {
    this.driver_ = driver;
    this.async_ = require('async');
};



/**
 * @param {function(!aurora.db.Reader,function(?,...))} callback first argument reader, second callback when done transaction
 * @param {function(?,...)} doneFunc
 */
aurora.db.sql.Reader.prototype.transaction = function(callback, doneFunc) {
    this.driver_.transaction(function(pool, driverDoneFunc) {
        let reader = new aurora.db.sql.Reader(pool);
        try {
            callback(reader, function(err) {
                driverDoneFunc.apply(null, arguments);
            });
        }
        catch (e) {
            driverDoneFunc(e);
        }

    }, doneFunc);

};

/**
 * @const
 */
aurora.db.sql.log = aurora.log.createModule('READER-SQL');

/**
 * @param {?recoil.db.Query} filter
 * @param {?recoil.db.Query} securityFilter
 * @return {?recoil.db.Query}
 */

aurora.db.sql.Reader.prototype.addSecurityFilter_ = function(filter, securityFilter) {
    if (!filter) {
        return securityFilter;
    }
    if (!securityFilter) {
        return filter;
    }
    let query = new recoil.db.Query();
    return query.and(filter, securityFilter);
};

/**
 * @final
 */
aurora.db.sql.Reader.converters_ = {
    'id': {
        fromDb(driver, val) {
            return BigInt(val);
        }
    },
    'int64': {
        fromDb(driver, val) {
            return BigInt(val);
        }
    },
    'ref': {
        fromDb(driver, val) {
            return BigInt(val);
        }
    },
    'json': {
        fromDb(driver, val) {
            return driver.fromJson(val);
        }
    }
};
/**
 * @param {!aurora.db.Pool} driver
 * @param {string} type
 * @param {?} val
 * @return {?}
 */
aurora.db.sql.Reader.fromDbType = function(driver, type, val) {
    if (val == undefined) {
        return null;
    }
    let converter = aurora.db.sql.Reader.converters_[type];

    return converter && converter.fromDb ? converter.fromDb(driver, val) : val;
};
/**
 * @private
 * @param {!aurora.db.Pool} driver
 * @param {!Array<string>} path
 * @param {number} start
 * @param {!Array} data
 * @param {?aurora.db.schema.TableType} table
 * @param {!Object<string,string>} colMap
 * @param {!Object<string,!Object<?,{key:?, list:!Array, path:!Array<string>}>>} unread
 * @param {number=} opt_end
 * @return {?{next: number, object: Object, pk: ?, parentId: ?}}
 */


aurora.db.sql.Reader.readObject_ = function(driver, path, start, data, table, colMap, unread, opt_end) {
    let maxEnd = opt_end === undefined ? data.length : opt_end;
    let Field = recoil.db.expr.Field;
    if (!table) {
        return null;
    }
    if (start >= maxEnd) {
        return null;
    }

    if (table.info.view) {

        console.log('reading row', colMap[table.info.pk.getId()]);
    }

    if (colMap[table.info.pk.getId()] === undefined) {
        return {next: start + 1, object: null};
    }

    let readObject = aurora.db.sql.Reader.readObject_;
    let curObject = {};
    let row = data[start];
    let curPk = row[colMap[table.info.pk.getId()]];

    if (curPk === null) {
        return {next: start + 1, object: null, pk: null}; // only null if outer join comes back null
    }
    let subTables = [];
    // do the to level columns

    let parentId = table.info.parentKey ? row[colMap[table.info.parentKey.getId()]] : null;
    for (let k in table.meta) {
        let meta = table.meta[k];
        let key = meta.key;
        let val = row[colMap[key.getId()]];
        let type = meta.type;
        let subPath = [...path];
        subPath.push(key.getName());
        if (meta.isList) {
            let subTableRows = [];
            let subTable = aurora.db.schema.getTable(key);
            curObject[k] = subTableRows;

            if (colMap[subTable.info.pk.getId()]) {
                subTables.push({path: subPath, table: subTable, rows: subTableRows});
            }
            else {
                let tableInfo = recoil.util.map.safeRecGet(unread, [JSON.stringify(subPath)], {
                    data: {},
                    table: subTable, sec: null, filter: null,
                    parentField: new Field(subPath.concat([meta.childKey])),
                    path: subPath
                });
                recoil.util.map.safeRecGet(tableInfo.data, [curPk], {key: curPk, list: subTableRows});

                // path->{table, [{key: number, list}];
            }
        }
        else if (type === 'owned-object' || type === 'object') {
            let read = readObject(driver, subPath, start, data, aurora.db.schema.getTable(key), colMap, unread);
            curObject[k] = read ? read.object : null;

        }
        else if (type === 'file') {
            let fileT = aurora.db.schema.tables.base.file_storage;
            aurora.db.sql.Reader.getColumns_(fileT).forEach(function(col) {
                if (col === fileT.info.pk) {
                    return;
                }
                let val = row[colMap[col.getId()]];
                let type = fileT.meta[col.getName()];
                curObject[col.getName()] = aurora.db.sql.Reader.fromDbType(driver, type, val);
            });
            curObject[k] = aurora.db.sql.Reader.fromDbType(driver, type, val);
        } else {
            curObject[k] = aurora.db.sql.Reader.fromDbType(driver, type, val);
        }

    }
    let end = start + 1;
    for (let i = start + 1; i < maxEnd; i++) {
        let row = data[i];
        let pk = row[colMap[table.info.pk.getId()]];
        if (pk !== curPk) {
            break;
        }
        end++;
    }
    subTables.forEach(function(info) {
        for (let i = start; i < end;) {
            let readInfo = readObject(driver, info.path, i, data, info.table, colMap, unread, end);
            if (!readInfo) {
                break;
            }
            if (readInfo.object !== null) {
                info.rows.push(readInfo.object);
            }
            i = readInfo.next;
        }
    });
    return {next: end, object: curObject, pk: curPk, parentId};

};

/**
 * @param {!aurora.db.schema.TableType} baseTable
 * @param {!Array<!recoil.structs.table.ColumnKey>} links
 * @param {!recoil.db.Query} filter
 * @param {{distinct:(undefined|boolean)}} options
 * @param {function(?,Object)} callback
 */

aurora.db.sql.Reader.prototype.selectReference = function(baseTable, links, filter, options, callback) {
    let getTable = aurora.db.schema.getTable;
    let getParentTable = aurora.db.schema.getParentTable;
    let query = new recoil.db.Query();
    let basePath = baseTable.info.path;
    let driver = this.driver_;
    let me = this;
    let curTable = baseTable;
    let scope = new recoil.db.DBQueryScope({}, new recoil.db.SQLQueryHelper(this), this.makeChildPathFunc(baseTable));
    let tName = scope.addPathTable([], me.getColumns_(baseTable));
    let selectTables = [driver.escapeId(baseTable.info.table) + ' ' + driver.escapeId(tName)];

    for (let i = 0; i < links.length; i++) {
        let linkTable = getParentTable(links[i]);
        let linkPath = linkTable.info.path + '/' + links[i].getName();
        if (linkPath.indexOf(basePath + '/') !== 0) {
            throw basePath + ' must be a prefix of ' + linkPath;
        }
        let remainingParts = linkPath.substring(basePath.length + 1).split('/');

        for (let j = 0; j < remainingParts.length; j++) {
            let part = remainingParts[j];
            let meta = curTable.meta[part];
            if (meta.type === 'ref' || meta.isList || meta.isObject) {
                let subTable = meta.type === 'ref' ? aurora.db.schema.tableMap[meta.table] : /** @type {!aurora.db.schema.TableType} */ (aurora.db.schema.getTable(meta.key));

                tName = scope.addPathTable([], me.getColumns_(subTable));
                if (meta.type === 'ref') {
                    filter = query.and(filter, query.eq(meta.key, subTable.info.pk));
                }
                else {
                    filter = query.and(filter, query.eq(curTable.info.pk, subTable.info.parentKey));
                }
                curTable = subTable;
                basePath = curTable.info.path;

                selectTables.push(driver.escapeId(subTable.info.table) + ' ' + tName);
            }
            else {
                throw new Error(part + ' is not a reference to another table');
            }

        }
    }
    let escapeId = function(v) {return driver.escapeId(v);};
    let cols = [];
    for (let k in curTable.cols) {
        cols.push(escapeId(tName) + '.' + escapeId(k) + ' ' + escapeId(k));
    }

    let sql = 'SELECT ' + cols.join(',') + ' FROM ' + selectTables.join(',') + ' WHERE ' + filter.query(scope);
    driver.query(sql, function(err, results) {
        let rows = [];
        if (!err) {
            results.forEach(function(res) {
                let row = {};
                for (let k in curTable.cols) {
                    row[k] = res[k];
                }
                rows.push(row);
            });
        }
        callback(err, rows);

    });

};
/**
 * @param {!aurora.db.schema.TableType} base
 * @return {function((!Array<string|!recoil.structs.table.ColumnKey>)):!Array<{id: string, parent: string, col: string, table:string}>}
 */
aurora.db.sql.Reader.prototype.makeChildPathFunc = function(base) {
    return function(path) {
        try {
            let col = path[0];
            // convert the path to a column we only have do do this once
            if (!(col instanceof recoil.structs.table.ColumnKey)) {
                // traverse path from base to get the col
                let fullPathParts = base.info.path.split('/').concat(path);
                let colName = fullPathParts.pop();
                try {

                    let tbl = aurora.db.schema.getTableByName(fullPathParts.join('/'));
                    if (tbl.meta[colName]) {
                        col = tbl.meta[colName].key;
                    }
                    else if (tbl.info.parentKey && tbl.info.parentKey.getName() === colName) {
                        col = tbl.info.parentKey;
                    }
                    else {
                        throw new Error('invalid key');
                    }
                }
                catch (e) {
                    if (path.length > 1) {
                        // this could be following a foriegn key do that check

                        let res = [];
                        let cur = base;
                        for (let i = 0; i < path.length - 1; i++) {
                            let meta = cur.meta[path[i]];
                            if (!meta) {
                                throw e;
                            }

                            if (meta.type === 'ref') {
                                res.push({
                                    id: cur.info.pk.getName(),
                                    col: path[i],
                                    table: cur.info.table
                                });
                                cur = aurora.db.schema.getTableByName(meta.ref);

                            }
                            else if (meta.type === 'file') {
                                res.push({
                                    id: cur.info.pk.getName(),
                                    col: path[i],
                                    table: cur.info.table
                                });
                                cur = aurora.db.schema.tables.base.file_storage;

                            }
                            else {
                                cur = aurora.db.schema.getTableByName(cur.info.path + '/' + path[i]);
                                res.push({
                                    id: cur.info.pk.getName(),
                                    parent: cur.info.parentKey.getName(),
                                    table: cur.info.table,

                                });
                            }
                        }
                        col = cur.meta[path[path.length - 1]].key;
                        res.push({
                            id: cur.info.pk.getName(),
                            parent: null,
                            col: col.getName(), table: cur.info.table});
                        return res;
                    }
                    else {
                        throw e;
                    }
                }
            }

            let meta = aurora.db.schema.getMeta(col);
            if ((meta.isList || meta.isObject)) {
                if (meta.leaf) {
                    let tbl = aurora.db.schema.getTable(col);
                    for (let k in tbl.meta) {
                        let e = tbl.meta[k];
                        if (e.type !== 'id' && e.type !== 'order') {
                            col = e.key;
                            meta = tbl.meta[k];
                            break;
                        }
                    }
                }
                else {
                    throw new Error('Invalid column for contains ' + col);
                }
            }
            let tbl = aurora.db.schema.getParentTable(col);
            let parts = tbl.info.path.split('/');
            let baseParts = base.info.path.split('/');
            if (tbl.info.path.indexOf(base.info.path + '/') !== 0) {
                throw new Error('Invalid column for contains ' + col);
            }
            let res = [{id: tbl.info.pk.getName(), parent: tbl.info.parentKey ? tbl.info.parentKey.getName() : null, col: col.getName(), table: tbl.info.table}];
            parts.pop();
            while (parts.length >= baseParts.length) {
                let cur = aurora.db.schema.getTableByName(parts.join('/'));
                res.unshift({id: cur.info.pk.getName(), parent: cur.info.parentKey ? cur.info.parentKey.getName() : null, table: cur.info.table});
                parts.pop();
            }
            return res;
        }
        catch (e) {
            aurora.db.sql.log.warn('invalid path', path, 'for', base.info.path, e);
            return [];
        }
    };
};
/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {!Array<{col:!recoil.structs.table.ColumnKey,value:?}>} keys
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,Object)} callback
 * @param {recoil.db.QueryOptions=} opt_options
 */
aurora.db.sql.Reader.prototype.readObjectByKey = function(context, table, keys, securityFilter, callback, opt_options) {
    let filter = recoil.db.Query.True;
    let query = new recoil.db.Query();
    let keyMap = {};
    let where = [];
    let Field = recoil.db.expr.Field;
    let makeWhere = function(t, path) {
        for (let k in t.cols) {
            let col = t.cols[k];
            let keyValue = keyMap[col.getId()];
            if (keyValue) {
                where.push(query.eq(query.field(path.concat(col.getName())), keyValue));
            }
            let meta = t.meta[col.getName()];
            if (meta.isList || meta.isObject) {
                let subTable = t[k];
                // outer equals
                let subPath = [...path];
                subPath.push(col.getName());
                makeWhere(subTable, subPath);
            }
        }
    };
    keys.forEach(function(entry) {
        keyMap[entry.col.getId()] = query.val(entry.value);
    });

    makeWhere(table, []);
    if (where.length > 0) {
        filter = query.and.apply(query, where);
    }
    this.readObjects(context, table, filter, securityFilter, function(error, list) {
        if (error) {
            callback(error, null);
            return;
        }
        if (list.length !== 1) {
            callback('Unexpected Number of Items ' + list.length, null);
            return;

        }
        callback(null, list[0]);
    }, opt_options);


};

/**
 * @private
 * @param {!recoil.db.DBQueryScope} scope
 * @param {!aurora.db.schema.TableType} table
 * @param {?recoil.db.Query} filter
 * @return {{query:string,filter:recoil.db.Query}}
 */
aurora.db.sql.Reader.prototype.mkCountSql_ = function(scope, table, filter) {
    let driver = this.driver_;
    let tname = scope.addPathTable([], []);
    let sql = 'SELECT count(*) count FROM ' + driver.escapeId(table.info.table) + ' ' + driver.escapeId(tname);
    return {
        query: sql,
        filter: filter
    };
};
/**
 * @private
 * @param {!recoil.db.DBQueryScope} scope
 * @param {!Object<string,string>} colMap
 * @param {{data:Object<string,{key:?}>,sec:recoil.db.Query,filter:recoil.db.Query,
            table:aurora.db.schema.TableType,path:!Array<string>,parentField:(undefined|recoil.db.expr.Field)}} cur
 * @param {!Array<{tid:string,col:string, colName:string}>} columns
 * @param {boolean} limited
 * @param {function(!Array<string>, boolean):boolean} columnFilter
 * @return {{query:string,filter:recoil.db.Query}}
 */
aurora.db.sql.Reader.prototype.mkSelectSql_ = function(scope, colMap, cur, columns, limited, columnFilter) {
    // where clauses will just filter out sub keys they will not stop the join
    let query = new recoil.db.Query();
    let tableIdMap = new aurora.db.sql.TableIdMap(scope);
    let Field = recoil.db.expr.Field;
    let driver = this.driver_;
    let me = this;
    let colIdx = 0;
    let makeOnClause = function(clause) {
        return clause.query(scope);
    };

    function mkTname(t) {
        return driver.escapeId(t.table) + ' ' + driver.escapeId(t.tid);
    }

    let getData = function(table, columns, path) {
        let where = [];
        let sorts = [];
        let tables = [];
        let todo = [];


        let getDataInternal = function(table, isList, columns, path, listCount, parentField, childField) {
            let addedLists = 0;
            let tId = tableIdMap.get(path);
            let joins = [];
            if (!columnFilter(path, path.length > 0)) {
                return;
            }

            if (table.info.parentKey) {
                scope.addPathNamedTable(path, me.getColumns_(table).concat(table.info.parentKey), tId);
            }
            else {
                scope.addPathNamedTable(path, me.getColumns_(table), tId);
            }

            if ((listCount.val > 0 || limited) && isList) {
                todo.push({path: path, table: table});
                return;
            }
            tables.push({table: table.info.table, tid: tId, joins});
            if (isList) {
                listCount.val++;
            }
            if (parentField && childField) {
                // this will need to change to deal with todos
                joins.push(new recoil.db.expr.Equals(parentField, childField));
            }
            if (table.info.parentKey) {
                colMap[table.info.parentKey] = 'col' + colIdx;
                columns.push({tid: tableIdMap.get(path), col: table.info.parentKey.getName(), colName: 'col' + colIdx++});

            }
            for (let k in table.cols) {
                if (!columnFilter(path.slice(0).concat([k]), false)) {
                    continue;
                }

                let col = table.cols[k];
                let meta = table.meta[col.getName()];
                if (!meta.isList && !meta.isObject) {
                    if (meta.type === 'file') {
                        let fileT = aurora.db.schema.tables.base.file_storage;
                        let filePath = path.concat('$storage');
                        let fileTid = tableIdMap.get(filePath);
                        scope.addPathNamedTable(filePath, me.getColumns_(fileT), fileTid);
                        tables.push({table: fileT.info.table, tid: fileTid, inner: true, joins: [query.eq(query.field(col), query.field(filePath.concat(['id'])))]});

                        for (let name in fileT.meta) {
                            let meta = fileT.meta[name];
                            if (meta.type !== 'id' && !meta.isList) {
                                let col = meta.key;
                                colMap[col.getId()] = 'col' + colIdx;
                                columns.push({tid: fileTid, col: col.getName(), colName: 'col' + colIdx++});
                            }
                        }
                    }

                    colMap[col.getId()] = 'col' + colIdx;
                    columns.push({tid: tableIdMap.get(path), col: col.getName(), colName: 'col' + colIdx++});
                }
                else {
                    let subTable = table[k];
                    let subPath = [...path];
                    subPath.push(col.getName());
                    getDataInternal(subTable, meta.isList, columns, subPath, listCount,
                            new Field(path.concat(table.info.pk.getName())), new Field(subPath.concat([meta.childKey])));
                }
            }


        };
        getDataInternal(table, false, columns, path, {val: 0}, null, null);
        return {sorts, where, tables, todo};

    };
    let data = getData(cur.table, columns, cur.path);
    let sql = 'SELECT ' + columns.map(
        function(v, idx) {
            return driver.escapeId(v.tid) + '.' + driver.escapeId(v.col) + ' ' + v.colName;
        }).join(',');

    if (data.tables.length > 0) {
        sql += ' FROM ' + mkTname(data.tables[0]);

        for (let i = 1; i < data.tables.length; i++) {
            let t = data.tables[i];
            sql += (t.inner ? ' JOIN ' : ' LEFT OUTER JOIN ') + mkTname(t);
            sql += ' ON ' + t.joins.map(makeOnClause).join(' AND ');

        }


    }
    let filter = null;
    if (cur.data) {
        // contruct the filter from the data
        let keys = [];
        for (let k in cur.data) {
            let item = cur.data[k];
            keys.push(item.key);
        }
        filter = query.isIn(new recoil.db.Query(cur.parentField), keys);
    }
    return {
        query: sql,
        filter: filter,
    };
};

/**
 * reads on object level piece wize because it may be to large
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {recoil.db.Query} filter
 * @param {?recoil.db.Query} securityFilter
 * @param {function(!Object, function())} entryCb
 * @param {function(?)} doneCb
 */
aurora.db.sql.Reader.prototype.readLevel = function(context, table, filter, securityFilter, entryCb, doneCb) {
    let me = this;

    let scope = new recoil.db.DBQueryScope(context, new recoil.db.SQLQueryHelper(me), me.makeChildPathFunc(table));
    let cols = me.getColumns_(table);
    let driver = this.driver_;
    let tName = scope.addPathNamedTable([], cols, '');

    let sql = 'SELECT ' + cols.map(function(col) {
        return driver.escapeId(col.getName());
    }).join(',') + ' FROM ' + driver.escapeId(table.info.table) + ' ' + driver.escapeId(tName) +
        this.makeWhere_(scope, filter, securityFilter);

    driver.queryLarge(sql, {}, entryCb, doneCb);

    /*
        let sql = me.mkSelectSql_(scope, colMap, cur, columns, false, function () {return true;});

    return {
        query: sql,
        filter: filter,
    };

    if (!cur.data) {
                // this the toplevel
                sql.filter = me.addSecurityFilter_(filter, securityFilter);
            }

            if (filter) {
                // todo add extra JOINs to table so we can get subtables

                sql.query += ' WHERE ' + sql.filter.query(scope);
            }

            console.log('query', driver.addOptions(sql.query, opt_options));
            driver.query(driver.addOptions(sql.query, opt_options), function(error, data, colInfo) {
            }*/

};

/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {recoil.db.Query} filter
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,Object)} callback
 * @param {recoil.db.QueryOptions=} opt_options
 */
aurora.db.sql.Reader.prototype.readObjects = function(context, table, filter, securityFilter, callback, opt_options) {
    let driver = this.driver_;
    let colMap = {};
    let me = this;

    let trueFunc = function() {return true;};
    let colFilter = opt_options ? opt_options.columnFilter() : trueFunc;
    let topLevelList = [];
    // a map of path to table info of tables to read
    let unreadTables = {};
    // a map from path to table data

    unreadTables[JSON.stringify([])] = {
        data: null,
        sec: securityFilter,
        filter: filter,
        table: table,
        path: []

    };
    let isCount = opt_options ? opt_options.isCount() : false;
    let readObject = aurora.db.sql.Reader.readObject_;
    let processList = function(unreadTables, opt_options) {
        let limit = opt_options ? opt_options.size() != undefined : false;
        let cur = null;
        for (let k in unreadTables) {
            cur = unreadTables[k];
            delete unreadTables[k];
            if (colFilter(cur.path, cur.path.length > 0)) {
                break;
            }
            else {
                cur = null;
            }
        }
        if (!cur) {
            // nothing todo we are done
            try {
                callback(null, topLevelList);
                return;
            }
            catch (e) {
                aurora.db.sql.log.error('Callback Error', e, topLevelList);
                return;
            }
        }
        let columns = [];
        try {
            let scope = new recoil.db.DBQueryScope(context, new recoil.db.SQLQueryHelper(me), me.makeChildPathFunc(table));
            let sql;
            if (isCount) {
                sql = me.mkCountSql_(scope, table, filter);
            } else {
                if (cur.table.info.view) {
                    let srcCur = goog.object.clone(cur);
                    let srcFilter = function(path, subtable) {
                        if (!colFilter(path, subtable)) {
                            return false;
                        }
                        if (path.length > 0) {
                            let last = path[path.length - 1];
                            if (cur.table.meta[last]) {
                                return true;
                            }
                            return false;
                        }
                        return true;
                    };
                    srcCur.table = aurora.db.schema.getTableByName(cur.table.info.view);
                    sql = me.mkSelectSql_(scope, colMap, /** @type {?} */(srcCur), columns, limit, srcFilter);
                    for (var k in srcCur.table.meta) {
                        let meta = cur.table.meta[k];
                        let srcMeta = srcCur.table.meta[k];
                        if (meta) {
                            colMap[meta.key.getId()] = colMap[srcMeta.key.getId()];
                        }
                    }
                    console.log('colmap', colMap);
                }
                else {
                    sql = me.mkSelectSql_(scope, colMap, cur, columns, limit, colFilter);
                }
            }


            if (!cur.data) {
                // this the toplevel
                sql.filter = me.addSecurityFilter_(filter, securityFilter);
            }

            if (filter) {
                // todo add extra JOINs to table so we can get subtables

                sql.query += ' WHERE ' + sql.filter.query(scope);
            }

            if (cur.table.info.view) {
                console.log('view sql---------------------------------------------', sql);
            }

            driver.query(driver.addOptions(sql.query, opt_options), function(error, data, colInfo) {
                try {
                    if (error) {
                        aurora.db.sql.log.error('SQL error', error);
                        callback(error, null);
                        return;
                    }
                    // sort by sort order, then id, id is the parent so should be ok
                    console.log('todo test large integers from database, sort by items, clear passwords option');
                    if (isCount) {
                        callback(null, data[0]['count']);
                        return;
                    } if (data && data.length > 0) {
                        let res = null;
                        do {
                            res = readObject(me.driver_, cur.path, res ? res.next : 0, /** @type {!Array} */(data), cur.table, colMap, unreadTables);
                            if (res && res.object) {
                                if (cur.data) {
                                    cur.data[res.parentId].list.push(res.object);
                                }
                                else {
                                    topLevelList.push(res.object);
                                }
                            }

                        }
                        while (res);

                    }
                    processList(unreadTables, null);

                }
                catch (e) {
                    aurora.db.sql.log.error('Process Error', e);
                }
            });
        }
        catch (e) {
            aurora.db.sql.log.error('Error Constructing SQL', e);
            console.log(e);
            callback(e, null);
        }
    };
    processList(unreadTables, opt_options);
};


/**
 * for now this only does the top level object, I need to think about how to do lower level items
 * for example security you may not want to update certain fields, also we need the original object in order
 * do this correctly, maybe we should pass in changes instead
 *
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {!Object} object
 * @param {?recoil.db.Query} query
 * @param {function(?)} callback
 */
aurora.db.sql.Reader.prototype.updateOneLevel = function(context, table, object, query, callback) {
    // this could delete and add children but first update the base object since this should be ok to update
    let me = this;
    let scope = new recoil.db.DBQueryScope(context, new recoil.db.SQLQueryHelper(me), this.makeChildPathFunc(table));
    let cols = me.getColumns_(table);
    scope.addPathNamedTable([], cols, '');

    // start transaction
    this.driver_.transaction(function(driver, doneFunc) {
        let sets = [];
        let toWrite = {};
        let sql = 'UPDATE ' + driver.escapeId(table.info.table) + ' SET ';
        cols.forEach(function(col) {
            if (col !== table.info.pk && col !== table.info.parentKey) {
                let meta = table.meta[col.getName()];
                if (object[col.getName()] !== undefined) {
                    sets.push(driver.escapeId(col.getName()) + ' = ' + driver.escape(me.toDb_(meta, object[col.getName()])));

                }
            }
        });
        sql += sets.join(',') + me.makeWhere_(scope, query, null);
        aurora.db.sql.log.info('updating', sql);
        driver.query(sql, function(err) {
            if (err) {
                aurora.db.sql.log.error(err);
            }
            doneFunc(err);
        });

    }, function(err) {
        if (err) {
            aurora.db.sql.log.error(err);
        }
        callback(err);
    });
};


/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {!Array<{field: !recoil.structs.table.ColumnKey, value: ?}>} fields
 * @param {?recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,number)} callback
 */
aurora.db.sql.Reader.prototype.updateObjects = function(context, table, fields, query, securityFilter, callback) {
    console.log('update objects not implement yet');

};


/**
 * @param {string} name
 * @param {function(?,?number)} callback
 */
aurora.db.sql.Reader.prototype.sequence = function(name, callback) {
    let seqTable = this.driver_.escapeId(name);
    let me = this;
    this.driver_.nextSequence(name, callback);
};

/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {!Object} object
 * @param {function(?,?aurora.db.type.InsertDef)} callback
 */
aurora.db.sql.Reader.prototype.insert = function(context, table, object, callback) {
    let async = this.async_;
    let me = this;
    let doInsertObject = function(driver, table, parentId, object, insertCb) {
        try {
            let row = {};
            let pk = null;
            let children = [];
            // the filter is important here for security reasons the user cannot just choose which fields to insert
            // although may just result is sql error
            for (let name in table.meta) {
                let meta = table.meta[name];
                let key = meta.key;
                if (meta.type === 'id' && table.info.autoPk !== false) {
                    // important user does not get to choose the primary key
                    pk = name;
                }
                else if (meta.isList || meta.isObject) {
                    // only insert owned outer items will deal with inserting references
                    if (meta.owned) {
                        let subTable = aurora.db.schema.getTable(key);
                        let childVal = object[name];
                        if (meta.isList) {
                            let order = null;
                            for (let k in subTable.meta) {
                                if (subTable.meta[k].type === 'order') {
                                    order = k;
                                }
                            }

                            if (childVal instanceof Array) {
                                childVal.forEach(function(item, idx) {
                                    if (order) {
                                        item[order] = idx;
                                    }
                                    children.push({table: subTable, item: item});
                                });
                            }
                        }
                        else {
                            if (childVal instanceof Object) {
                                children.push({table: subTable, item: childVal});
                            }
                        }
                    }
                }
                else {
                    row[name] = me.toDb_(meta, object[name]);
                }
            }
            if (table.info.parentKey) {
                row[table.info.parentKey.getName()] = parentId;
            }
            driver.insert(table.info.table, row, function(err, res) {
                if (err) {
                    insertCb(err, null);
                }
                else {
                    async.each(children, function(child, callback) {
                        doInsertObject(driver, child.table, res.insertId, child.item, function(err) {
                            callback(err);
                        });
                    }, function(err) {
                        insertCb(err, {insertId: res.insertId});
                    });
                }
            });
        }
        catch (e) {
            callback(e, null);
        }
    };

    this.transaction(function(reader, transCallback) {
        let parentId = table.info.parentKey ? object[table.info.parentKey.getName()] : null;
        doInsertObject(reader.driver_, table, parentId, object, function(err, insertInfo) {
            transCallback(err, insertInfo);
        });
    }, function(err, insertInfo) {
        callback(err, insertInfo);
    });
};




/**
 * @param {string} query
 * @param {function(?,(Array|!aurora.db.type.InsertDef),?)|!Object<string,?>} params (error, results, fields)
 * @param {function(?,(Array|!aurora.db.type.InsertDef),?)=} opt_callback not optional, but can be suplied in params argument
 */
aurora.db.sql.Reader.prototype.query = function(query, params, opt_callback) {
    console.log('query', query);
    this.driver_.query(query, params, opt_callback);
};

/**
 * first items are the bottom level
 * @private
 * @param {!Object<string,!Object<string,{table:aurora.db.schema.TableType,key:string}>>} depMap
 * @return {function(?,?):number}
 */
aurora.db.sql.Reader.prototype.makeDepenancyComparator_ = function(depMap) {
    let dependsOn = function(x, y) {
        return dependsOn[x.info.table][y.info.table];
    };
    return function(x, y) {
        if (x === y) {
            return 0;
        }
        if (dependsOn(x, y)) {
            return 1;
        }
        else if (dependsOn(y, x)) {
            return 1;
        }
        return x.info.table.localeCompare(y.info.table);
    };

};

/**
 * @private
 * @param {!aurora.db.schema.TableType} table
 * @return {!Object<string,!Object<string,{table:aurora.db.schema.TableType,key:string}>>}
 */
aurora.db.sql.Reader.prototype.getDependancyMap_ = function(table) {
    let deps = {};
    let tables = [];
    let makeDeps = function(table, parents) {
        let myDeps = recoil.util.map.safeRecGet(deps, [table.info.table], {});
        tables.push(table);

        let subParents = parents.concat(table);
        for (let col in table.meta) {
            let meta = table.meta[col];

            if (meta.owned && (meta.isList || meta.isObject)) {
                let childTable = aurora.db.schema.getTable(meta.key);
                subParents.forEach(function(parent) {
                    recoil.util.map.safeRecGet(deps, [parent.info.table, childTable.info.table], {table: childTable, key: meta.childKey});
                });
                makeDeps(childTable, subParents);
            }
        }

    };
    makeDeps(table, []);

    tables.sort(this.makeDepenancyComparator_(deps));
    return {tables: tables, deps: deps};

};

/**
 * @private
 * @param {!aurora.db.schema.TableType} table
 * @return {!Array<!aurora.db.schema.TableType>}
 */
aurora.db.sql.Reader.prototype.getChildTables_ = function(table) {
    let res = [];
    for (let col in table.meta) {
        let meta = table.meta[col];

        if (meta.owned && (meta.isList || meta.isObject)) {
            res.push(/** @type {!aurora.db.schema.TableType}*/ (aurora.db.schema.getTable(meta.key)));
        }
    }
    return res;
};




/**
 * @private
 * @param {!recoil.db.DBQueryScope} scope
 * @param {recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @return {string}
 */
aurora.db.sql.Reader.prototype.makeWhere_ = function(scope, query, securityFilter) {
    let filter = this.addSecurityFilter_(query, securityFilter);
    if (filter) {
        return ' WHERE ' + filter.query(scope);
    }
    return '';
};
/**
 * @private
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,Array<number>)} callback
 */
aurora.db.sql.Reader.prototype.readIds_ = function(context, table, query, securityFilter, callback) {
    let scope = new recoil.db.DBQueryScope(context, new recoil.db.SQLQueryHelper(this), this.makeChildPathFunc(table));
    let tName = scope.addPathTable([], this.getColumns_(table));

    let sql = 'SELECT ' + this.driver_.escapeId(table.info.pk.getName()) + ' id FROM '
        + this.driver_.escapeId(table.info.table) + ' ' + this.driver_.escapeId(tName) + ' '
        + this.makeWhere_(scope, query, securityFilter);
    this.driver_.query(sql, function(error, data) {
                if (error) {
                    callback(error, null);
                }
                else {
                    callback(error, data.map(function(v) {return v['id'];}));
                }
            });

};
/**
 * @param {Object} meta
 * @param {?} val
 * @return {?}
 */
aurora.db.sql.Reader.prototype.toDb_ = function(meta, val) {
    if (val == null) {
        return null;
    }

    return meta.type === 'json' ? this.driver_.toJson(val) : val;
};

/**
 * only get the non list and object columns
 * @param {!aurora.db.schema.TableType} table
 * @return {!Array<!recoil.structs.table.ColumnKey>}
 */
aurora.db.sql.Reader.prototype.getColumns_ = function(table) {
    return aurora.db.sql.Reader.getColumns_(table);
};

/**
 * only get the non list and object columns
 * @param {!aurora.db.schema.TableType} table
 * @return {!Array<!recoil.structs.table.ColumnKey>}
 */
aurora.db.sql.Reader.getColumns_ = function(table) {
    let res = [];
    if (table.info.parentKey) {
        res.push(table.info.parentKey);
    }

    for (let k in table.meta) {
        let meta = table.meta[k];
        if (!meta.isList && !meta.isObject) {
            res.push(meta.key);
        }
    }
    return res;
};
/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,number)} callback
 */
aurora.db.sql.Reader.prototype.deleteObjects = function(context, table, query, securityFilter, callback) {
    let async = this.async_;
    // first get the information about the children tables
    // with a dependancy map
    let whereClause = null;
    let childTables = this.getChildTables_(table);
    let filter = this.addSecurityFilter_(query, securityFilter);
    let scope = new recoil.db.DBQueryScope({}, new recoil.db.SQLQueryHelper(this), this.makeChildPathFunc(table));
    let me = this;
    // naming the tables in delete doesn't work
    scope.addPathNamedTable([], me.getColumns_(table), '');
    if (filter) {
        whereClause = ' WHERE ' + filter.query(scope);
    }

    this.transaction(function(reader, transCallback) {
        let deleteMe = function() {
            let sql = 'DELETE FROM ' + me.driver_.escapeId(table.info.table) + ' ' + whereClause;
            console.log('sql =', sql);
            reader.driver_.query(sql, function(error) {
                transCallback(error);
            });
        };

        if (childTables.length === 0) {
            deleteMe();
        }
        else {
            me.readIds_(context, table, filter, null, function(error, ids) {
                console.log('delete trans ids', ids, error);
                if (!error) {
                    async.each(childTables, function(child, callback) {
                        reader.deleteObjects(context, child, query.isIn(child.info.parentKey, ids), null, function(error) {
                            callback(error);
                        });
                    }, function(error) {
                        if (error) {
                            transCallback(error);
                        }
                        else {
                            deleteMe();
                        }
                    });
                }
                else {
                    transCallback(error);
                }
            });
        }

    }, callback);
};


/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,number)} callback
 */
aurora.db.sql.Reader.prototype.deleteOneLevel = function(context, table, query, securityFilter, callback) {
    // first get the information about the children tables
    // with a dependancy map
    let whereClause = null;
    let filter = this.addSecurityFilter_(query, securityFilter);
    let scope = new recoil.db.DBQueryScope({}, new recoil.db.SQLQueryHelper(this), this.makeChildPathFunc(table));
    let me = this;
    // naming the tables in delete doesn't work
    let tname = scope.addPathNamedTable([], me.getColumns_(table), '');
    if (filter) {
        whereClause = ' WHERE ' + filter.query(scope);
    }

    this.transaction(function(reader, transCallback) {
        let sql = 'DELETE FROM ' + me.driver_.escapeId(table.info.table) + ' ' + whereClause;
        console.log('sql =', sql);
        reader.driver_.query(sql, function(error) {
            transCallback(error);
        });
    }, callback);
};


/**
 * @param {string} str
 * @return {string}
 */
aurora.db.sql.Reader.prototype.escapeId = function(str) {
    return this.driver_.escapeId(str);
};

/**
 * @param {?} str
 * @return {string}
 */
aurora.db.sql.Reader.prototype.escape = function(str) {
    if (str instanceof aurora.db.PrimaryKey) {
        return this.driver_.escape(str.db);
    }
    return this.driver_.escape(str);
};

/**
 * @param {string} exp
 * @return {?}
 */

aurora.db.sql.Reader.prototype.expression = function(exp) {
    return this.driver_.expression(exp);
};
