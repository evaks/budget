const ChangeSet = require('../../output/testable.js').recoil.db.ChangeSet;
const PrimaryKey = require('../../output/testable.js').aurora.db.PrimaryKey;
const access = require('../../output/testable.js').aurora.db.access;
const recoil = /**/ require('../../output/testable.js').recoil;
const QueryScope = require('../../output/testable.js').aurora.db.schema.TableQueryScope;
const db = require('../../output/testable.js').aurora.db;
const dummy =  require('../../output/testable.js').aurora.string;

const makeTable = function (keyMap, path, object, hasParent, colMap) {

    let meta = {
        'id': {
            key:  db.createId('id'),
            type: 'id'
        }
    };
    let cols = {
        id: meta['id'].key,
    };

    let parts = path.split('/');
    let base = {
        meta: meta,
        cols: cols,
        info: {
            pk: cols.id,
            name: path,
            path: path,
            keys: ['id'],
            table: parts[parts.length -1],
        }
    };

    colMap[base.info.pk] = {path: path, col: base.info.pk, tbl: base};
    if (hasParent) {
        base.info.parentKey = new recoil.structs.table.ColumnKey('parent');
    }
    else {
        base.info.accessFilter = access.filter.allFilter;
    }
    keyMap[path] = base;

    for (let k in object) {
        let info = object[k];
        let key =  new recoil.structs.table.ColumnKey(k);
        let type = info.type;
        if (k === 'access') {
            base.info.access = info;
            continue;
        }
        if (k === 'accessFilter') {
            base.info.accessFilter = info;
            continue;
        }
        colMap[key] = {path: path, col: key, tbl: base};
        meta[k] = {
            type: info.type,
            key: key
        };
        if (info.type === 'ref') {
            meta[k].table = info.table;
            meta[k].ref = '/' + info.table;
        }
        if (info.type === 'list') {
            meta[k].isList = true;
        }
        if (info.type === 'object') {
            meta[k].isObject = true;
        }
        cols[k] = key;
        if (info.children) {
            base[k] = makeTable(keyMap, path + '/' + k, info.children, true, colMap);
        }
    }
    return base;
};
const makeSchema = function (schema) {
    let keyMap = {};
    let colMap = {};
    for (let k in schema) {
        keyMap['/' + k] = makeTable(keyMap, '/' + k, schema[k], false, colMap);
    }
    let pathToString = function (p) {
        if (p instanceof recoil.db.ChangeSet.Path) {
            return p.pathAsString();
        }
        return p;
    };

    let res = {
        keyMap: keyMap,
        getTable: function (col) {
            let info = colMap[col];
            if (info) {
                return info.tbl[col.getName()] || null;
            }
            return null;
        },
        getParentTable: function (col) {
            let info = colMap[col];
            if (info) {
                return info.tbl;
            }
            return null;
        },
        getTableByName: function (name) {
            if (typeof(name) === 'string') {
                return keyMap[name] || null;
            }
            return keyMap[name.pathAsString()] || null;
        },
        getMetaByPath: function (name) {
            let list = pathToString(name).split('/');
            let last = list.pop();
            let info = keyMap[list.join('/')];
            if (info)
            {
                return info.meta[last];
            }
            return null;
        }

    };

    return res;
};

const makePath = function () {
    let parts = [];

    for (let i = 0; i < arguments.length; i++) {
        let item = arguments[i];
        if (typeof(item) === 'string') {
            item.split('/').forEach(function (v) {
                parts.push(new ChangeSet.PathItem(v, [], []));
            });
        }
        else if (item.mem !== undefined) {
            let part = parts[parts.length - 1];
            parts[parts.length - 1] = new ChangeSet.PathItem(part.name(),['id'],[new PrimaryKey(null, item.mem)]);
        }
        else {
            let part = parts[parts.length - 1];
            parts[parts.length - 1] = new ChangeSet.PathItem(part.name(),['id'],[new PrimaryKey(item)]);
        }
    }

    return new ChangeSet.Path(parts);
};

let makeReader = function (schema) {
    let writes = [];
    let tables = {};
    let transStack = [writes];
    let db = {};
    let removeArray = function (obj) {
        return function (id) {
            for (let i = 0; i <obj.length; i++) {
                if (obj[i].id == id) {
                    obj.splice(i,1);
                    break;
                }
            }
        };
    };
    let getAllObjects = function (base, sub, offset, remove, res)
    {
        if (!base) {
            return res;
        }

        if (offset >= sub.length) {
            for (let k in base) {
                res[k] = {remove: remove, val: base[k]};
            }
            return res;
        }
        else {
            for (let k in base) {
                let item = base[k];
                let child = item[sub[offset]];
                if (child instanceof Array) {
                    let newBase = {};
                    child.forEach(function (e) {
                        newBase[e.id] = e;
                    });
                    getAllObjects(newBase, sub, offset + 1, removeArray(child), res);
                }
                else if (child instanceof Object){
                    let newBase = {};
                    newBase[child.id] = child;
                    getAllObjects(newBase, sub, offset + 1, function (id) {
                        if (id == child.id) {
                            delete item[sub[offset]];
                        }
                    }, res);
                }
            }
        }
        return res;
    };
    let getTableObjects = function (table) {
        let cur = table;
        let sub = [];
        let base = db[table.info.table];
        let parts = table.info.path.split('/');
        while (!base) {
            if (parts.length <= 1) {
                return {};
            }
            sub.unshift(parts.pop());
            let parent = schema.getTableByName(parts.join('/'));
            if (parent) {
                base = db[parent.info.table];
            }

        }
        return getAllObjects(base, sub, 0, function (id) {
            delete base[id];
        }, {});
    };

    let curId = -1n;

    let reader = {
        addObject: function (table, object) {
            let tbl = (db[table] = (db[table] || {}));
            if (typeof(object.id) !== 'bigint') {
                object.id = BigInt(object.id);
            }
            tbl[object.id] = object;
        },
        updateOneLevel(context, table, obj, query, callback) {
            setTimeout(function () {
                let objects = getTableObjects(table);
                let res = [];
                for (let key in objects) {
                    if (query.eval(new QueryScope({}, objects[key].val, table, schema))) {
                        writes.push({type: 'update', table: table.info.table, id: BigInt(key), obj});
                    }
                }
                callback(null, res);
            }, 1);
        },
        deleteObjects: function (context, table, query, secFilter, callback) {
            if (secFilter) {
                query  = query.and(secFilter);
            }
            setTimeout(function () {
                let objects = getTableObjects(table);
                let res = [];
                for (let key in objects) {
                    if (query.eval(new QueryScope({}, objects[key].val, table, schema))) {
                        writes.push({type: 'delete', table: table.info.table, id: BigInt(key)});
                        objects[key].remove();
                    }
                }
                callback(null, res);
            }, 1);

        },
        deleteOneLevel: function (context, table, query, secFilter, callback) {
            if (secFilter) {
                query  = query.and(secFilter);
            }
            setTimeout(function () {
                let objects = getTableObjects(table);
                let res = [];
                for (let key in objects) {
                    if (query.eval(new QueryScope({}, objects[key].val, table, schema))) {
                        writes.push({type: 'deleteOne', table: table.info.table, id: BigInt(key)});
                        objects[key].remove();
                    }
                }
                callback(null, res);
            }, 1);

        },

        readObjectByKey: function (context, table, keys, secFilter, callback) {
            let query = new recoil.db.Query().True();
            keys.forEach(function (info) {
                query = query.and(query.field(info.col).eq(query.val(info.value)));
            });
            reader.readObjects(context, table, query, secFilter, function (err, obj) {
                if (err) {
                    callback(err, null);
                }
                else {
                    callback(err, obj[0]);
                }
            });
        },

        readObjects: function (context, table, query, secFilter, callback) {
            let objects = db[table.info.table] || {};
            if (secFilter) {
                query  = query.and(secFilter);
            }
            setTimeout(function () {
                let res = [];

                for (let key in objects) {

                    if (query.eval(new QueryScope({}, objects[key], table, schema))) {
                        res.push(objects[key]);
                    }
                }
                callback(null, res);
            }, 1);
        },
        writes: writes,
        insert: function (context, tbl, obj, cb) {
            setTimeout(function () {
                let cp = {...obj};
                tables[tbl.info.table] = tables[tbl.info.table] || [];
                cp.id = curId--;
                tables[tbl.info.table].push(cp);
                writes.push({type: 'insert', table: tbl.info.table, obj: obj});
                cb(null, {insertId: cp.id});
            }, 1);
        },
        transaction: function (cb, doneFunc) {
            let newWrites = [];
            writes.push({transaction: newWrites});
            writes = newWrites;
            transStack.push(writes);
            try {

                cb(reader, function () {
                    let args = [];

                    for (let i = 0; i < arguments.length; i++) {
                        args.push(arguments[i]);
                    }
                    writes = transStack.pop();
                    setTimeout(function () {
                        doneFunc.apply(null, args);
                    }, 1);
                });
            } catch (e) {
                console.error("exception occurred", e);
                writes = transStack.pop();
                doneFunc(e);
            }
        }
    };
    return reader;
};

module.exports = {
    makePath : makePath,
    makeSchema: makeSchema,
    makeReader: makeReader
};
