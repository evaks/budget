const path = require('path');
const fs = require('fs');

let typeFactories = {
    'id': {jsType: 'bigint', sqlType: 'bigint'},
    'order': {jsType: 'int', sqlType: 'int'},
    'json': {jsType: '?', sqlType: 'json'},
    'bigint': {jsType: 'bigint', sqlType: 'bigint'},
    'int': {jsType: 'int', sqlType: 'int'},
    'datetime': {jsType: 'bigint', sqlType: 'bigint'},
    'parent': {jsType: 'bigint', sqlType: 'bigint'},
    'boolean': {jsType: 'boolean', sqlType: 'boolean'},
    'ref': {jsType: 'reference', getInfo: function(info) {
        let p1 = info.params[0];
        return {
            'table': p1,
        };
    }, sqlType: 'bigint'},

    'owned-list': {jsType: 'list', getInfo: function(info) {
        return {
            'list': true,
            'owned': true,
            'childKey': info.params[0],
        };
    }, sqlType: null},

    'leaf-list': {jsType: 'list', getInfo: function(info) {
        return {
            'list': true,
            'owned': true,
            'leaf': true,
            'childKey': info.params[0],
        };
    }, sqlType: null},

    'owned-object': {jsType: 'list', getInfo: function(info) {
        return {
            'object': true,
            'childKey': info.params[0],
        };
    }, sqlType: null},

    'list': {jsType: 'object', getInfo: function(info) {
        return {
            'list': true,
            'childKey': info.params[0],
        };
    }, sqlType: null},

    'string': {jsType: 'string', getInfo: function(info) {
        let params = info.params;
        if (params.length === 0) {
            return {};
        }
        if (params.length === 1) {
            return {maxLength: params[0]};
        }
        if (params.length === 2) {
            return {
                minLength: params[0],
                maxLength: params[1]
            };
        }

        throw 'Invalid params for string ' + params.join(',');
    }, sqlType: 'varchar'},
    'password' : {jsType: 'password', sqlType: 'password'},

};

let stringify = function(v) {
    if (v instanceof Array) {
        return '[' + v.map(stringify).join(', ') + ']';
    }
    else if (v instanceof Object) {
        var res = '{';
        var first = true;
        for (var k in v) {
            if (!first) {res += ',';}
            first = false;
            if (/^[$A-Za-z_][$A-Za-z_0-9]+$/.test(k)) {
                res += k;
            }
            else {
                res += stringify(k);
            }
            res += ': ' + stringify(v[k]);
        }
        return res + '}';
    }
    else if (typeof(v) === 'string') {
        // linter prefers single quoted strings
        var dQuoted = JSON.stringify(v);
        var res = '\'';
        var esc = false;
        for (var i = 1; i < dQuoted.length - 1; i++) {
            var ch = dQuoted[i];
            if (esc) {
                if (ch === '"') {
                    res += ch;
                }
                else {
                    res += '\\' + ch;
                }
                esc = false;
            }
            else if (ch === '\\') {
                esc = true;
            }
            else if (ch === '\'') {
                res += '\\\'';
            }
            else {
                res += ch;
            }
        }
        return res + '\'';
    } else {
        return v + '';
    }

};
function getColType(data) {
    let nullFunc = function() {return null;};
    let typeInfo = parseType(data.type);
    let factory = typeFactories[typeInfo.type];
    if (!factory) {
        throw 'Unknown type: ' + data.type;
    }
    let info = (factory.getInfo || nullFunc)(typeInfo);
    return Object.assign({}, typeInfo, {raw: data.type}, factory, info);

}

let reserved = {
    interface: 'interface$',
    static: 'static$',
    class: 'class$',
    native: 'native$'
};

let refTypes = {
    'owned-list' : 1,
    'leaf-list' : 1,
    'ref': 1
};

function processAccessFilter(out, accessFilter, depth) {
    if (typeof(accessFilter) === 'string') {
        if (accessFilter === 'all') {
            fs.appendFileSync(out, 'aurora.db.access.filter.allFilter');
        }
        else {
            fs.appendFileSync(out, accessFilter);
        }
    }
    else if (accessFilter instanceof Array) {
        fs.appendFileSync(out, 'aurora.db.access.filter.choice([');
        for (let i = 0; i < accessFilter.length; i++) {
            if (Object.keys(accessFilter[i]).length !== 1) {
                throw new Error('there can only be one key per object');
            }
            for (let perm in accessFilter[i]) {
                // should only be one
                if (i !== 0) {
                    fs.appendFileSync(out, ',');
                }

                fs.appendFileSync(out, '\n        {' + stringify(perm) + ':');
                processAccessFilter(out, accessFilter[i][perm], depth + 1);
                fs.appendFileSync(out, '}');
            }
        }
        fs.appendFileSync(out, '])');
    }

}
function parseType(type) {
    type = type.trim();
    let bIndex = type.indexOf('(');
    if (bIndex === -1 || type[type.length - 1] !== ')') {
        return {type: type, params: []};
    }
    try {
        let typeName = type.substring(0, bIndex);
        let params;
        let paramsStr = type.substring(bIndex + 1, type.length - 1);
        if (refTypes[typeName] != undefined) {
            params = paramsStr.split(',');
        }
        else {
            params = JSON.parse('[' + paramsStr + ']');
        }
        return {type: typeName, params: params};
    }
    catch (e) {
        throw 'Error parsing type ' + type;
    }
}
let serverOnlyTypes = ['order'];

function jsEscape(name) {
    return reserved[name] || name;
}

function toStr(txt) {
    return '\'' + txt + '\'';
}

let traverseTable = function(inDef, cb) {
    let nullFunc = function() {};
    let todo = [{def: inDef, stack: []}];
    while (todo.length > 0) {
        let item = todo.shift();
        let stack = [...item.stack];
        let def = item.def;
        if (def.tableName === undefined) {
            def.tableName = def.name;
        }
        stack.push(item.def);

        let fullTableName = stack.map(function(d) {
            return jsEscape(d.name);
        }).join('.');


        (cb.startTable || nullFunc)(def.name, def, stack, fullTableName, item.col);

        (def.columns || []).forEach(function(col) {
            (cb.startCol || nullFunc)(col.name, col, fullTableName, def.tableName, item.col);

            if (col.table) {
                let tdef = {...col.table};
                tdef.tableName = col.table.name;
                tdef.name = col.name;
                todo.push({def: tdef, stack: stack, col: col});
            }

            (cb.endCol || nullFunc)(col.name, col, fullTableName);
        });


        (cb.endTable || nullFunc)(def.name, def, stack, fullTableName);
    }


};
let shouldSkip = function(client, type, parentCol) {
    if (client) {
        if (serverOnlyTypes.indexOf(type) !== -1) {
            return true;
        }

        if (parentCol && type.type === 'id') {
            let pType = getColType(parentCol);
            if (pType.leaf) {
                console.log('xxxx', type, getColType(parentCol));
            }
        }
    }
    return false;
};
let traverse = function(def, cb) {
    (def.tables || []).forEach(function(table) {
        traverseTable(table, cb, []);
    });
};

let doGenerate = function(def, ns, client, custRequires, out) {
    let nullFunc = function() {return {};};
    fs.writeFileSync(out, '/**\n * GENERATED DO NOT CHANGE\n */\n\n');
    let provides = [];
    let prefix = 'aurora.db.schema.tables.' + ns;
    traverse(def, {
        startTable: function(name, data, stack, fullName) {
            provides.push(prefix + '.' + fullName);
        }
    });

    provides.sort();

    provides.forEach(function(provide) {
        fs.appendFileSync(out, 'goog.provide(\'' + provide + '\');\n');
    });
    fs.appendFileSync(out, '\n');
    let colMap = {};
    let keyMap = {};
    let prefixMap = {};
    let tableMap = {};
    let tablePathMap = {};
    let requires = ['aurora.db.schema.TableType', 'recoil.db.BasicType', 'aurora.db.access', 'aurora.db.access.filter', 'recoil.structs.table.ColumnKey', 'aurora.db'].concat(Object.keys(custRequires));
    requires.sort();
    requires.forEach(function(r) {
        fs.appendFileSync(out, 'goog.require(\'' + r + '\');\n');
    });

    fs.appendFileSync(out, '\n');


    traverse(def, {
        startTable: function(name, data, stack) {
            fs.appendFileSync(out, '/**\n * @struct\n * @const\n */\n');

            let tName = stack.map(function(d) {
                return jsEscape(d.name);
            }).join('.');

            fs.appendFileSync(out, prefix + '.' + tName + '.cols = {\n');
        },
        startCol: function(name, data, fullTableName) {
            colMap[prefix + '.' + fullTableName + '.cols.' + jsEscape(name)] = prefix + '.' + fullTableName;
            if (data.type === 'id') {
                fs.appendFileSync(out, '   ' + jsEscape(name) + ': aurora.db.createId(' + toStr(name) + '),\n');
            }
            else {
                fs.appendFileSync(out, '   ' + jsEscape(name) + ': new recoil.structs.table.ColumnKey(' + toStr(name) + '),\n');
            }

        },
        endTable: function(name, data, stack) {
            fs.appendFileSync(out, '};\n\n');

        }
    });

    traverse(def, {
        startTable: function(name, data, stack, fullTableName, parentCol) {
            fs.appendFileSync(out, '/**\n * @type {!aurora.db.schema.InfoType}\n * @const\n */\n');
            let tName = fullTableName;
            fs.appendFileSync(out, prefix + '.' + tName + '.info = {\n');
            let tablePath = '/' + ns + '/' + stack.map(function(d) {
                return d.name;
            }).join('/');
            let prefixStr = '/' + ns;
            prefixMap[prefixStr] = true;
            for (let i = 0; i < stack.length - 1; i++) {
                prefixStr += '/' + stack[i].name;
                prefixMap[prefixStr] = true;
            }

            keyMap[tablePath] = prefix + '.' + tName;

            fs.appendFileSync(out, '    name: ' + stringify(tablePath) + ',\n');
            fs.appendFileSync(out, '    path: ' + stringify(tablePath) + ',\n');
            tablePathMap[data.tableName] = tablePath;
            if (!client) {
                tableMap[data.tableName] = prefix + '.' + tName;
                fs.appendFileSync(out, '    table: ' + stringify(data.tableName) + ',\n');
                if (parentCol) {
                    fs.appendFileSync(out, '    parentKey: new recoil.structs.table.ColumnKey(' + toStr(getColType(parentCol).childKey) + '),\n');
                }
            }

            let access = null;
            let accessFilter = null;
            for (let i = stack.length - 1; i >= 0 && !access; i--) {
                access = stack[i].access;
                accessFilter = stack[i].accessFilter;
            }
            if (!access) {
                throw 'Table ' + tablePath + ' or it\'s parents do not specify an access level';
            }

            if (!accessFilter) {
                throw 'Table ' + tablePath + ' or it\'s parents do not specify an access filter';
            }


            fs.appendFileSync(out, '    access: ' + access + ',\n');
            if (!client) {
                // client will not be doing sql queries so not necessary
                fs.appendFileSync(out, '    accessFilter: ');
                processAccessFilter(out, accessFilter, 0);
                fs.appendFileSync(out, ',\n');
            }

            let pk = null;
            let auto = true;
            for (let column in data.columns) {
                let e = data.columns[column];
                if (e.type === 'id') {
                    if (pk !== null) {
                        throw prefix + '.' + tName + ' has more than 1 primary key';
                    }
                    if (e.auto === false) {
                        auto = false;
                    }
                    pk = jsEscape(e.name);
                }

            }
            if (pk === null) {
                throw prefix + '.' + tName + ' has no primary key';
            }

            fs.appendFileSync(out, '    pk: ' + prefix + '.' + tName + '.cols.' + jsEscape(pk) + ',\n');
            fs.appendFileSync(out, '    keys: [' + stringify(pk) + '],\n');
            if (!auto) {
                fs.appendFileSync(out, '    autoPk: false,\n');
            }


            if (!data.unique || data.unique.length === 0) {
                fs.appendFileSync(out, '    unique: []\n');
            }
            else {
                fs.appendFileSync(out, '    unique: [\n');
                data.unique.forEach(function(keys, idx) {
                    if (idx !== 0) {
                        fs.appendFileSync(out, ',\n');
                    }
                    fs.appendFileSync(out, '        [' + keys.map(function(k) {
                        return prefix + '.' + tName + '.cols.' + jsEscape(k);
                    }).join() + ']');

                });
                fs.appendFileSync(out, '\n    ]\n');
            }


            fs.appendFileSync(out, '};\n\n');


            fs.appendFileSync(out, '/**\n * @type {!recoil.db.BasicType}\n * @const\n */\n');
            fs.appendFileSync(out, prefix + '.' + tName + '.key = ');
            fs.appendFileSync(out, 'new recoil.db.BasicType([],' + prefix + '.' + tName + '.info);\n');

        }

    });
    let skipCol = false;
    traverse(def, {
        startTable: function(name, data, stack, tName) {
            fs.appendFileSync(out, '/**\n * @const\n */\n');
            fs.appendFileSync(out, prefix + '.' + tName + '.meta = {\n');
        },
        startCol: function(name, data, fullTableName, tableName, parentCol) {
            let typeInfo = parseType(data.type);
            let factory = typeFactories[typeInfo.type];
            if (!factory) {
                throw 'Unknown type: ' + data.type;
            }
            fs.appendFileSync(out, '   ' + toStr(name) + ': {\n');

            let info = (factory.getInfo || nullFunc)(typeInfo);
            let numInfo = Object.keys(info).length;

            fs.appendFileSync(out, '       key: ' + prefix + '.' + fullTableName + '.cols.' + jsEscape(name));
            fs.appendFileSync(out, ',\n       type: ' + toStr(typeInfo.type));

            let isRef = typeInfo.type === 'ref';

            if (isRef) {
                fs.appendFileSync(out, ',\n       ref: ' + stringify(tablePathMap[info.table]));
            }
            for (let k in info) {
                if (isRef && client && k === 'table') {
                    continue;
                }

                fs.appendFileSync(out, ',\n       ' + k + ': ' + JSON.stringify(info[k]));
            }
            fs.appendFileSync(out, '\n');

        },

        endCol: function(name, data) {
            if (!skipCol) {
                fs.appendFileSync(out, '    },\n');
            }

        },
        endTable: function(name, data, stack) {
            fs.appendFileSync(out, '};\n\n');

        }
    });


    fs.appendFileSync(out, '(function(map) {\n');
    for (let k in colMap) {
        fs.appendFileSync(out, '    map[' + k + '] = ' + colMap[k] + ';\n');
    }
    fs.appendFileSync(out, '})(aurora.db.schema.colMap);\n\n');

    fs.appendFileSync(out, '(function(map) {\n');
    // name path -> tableInfo
    for (let k in keyMap) {
        fs.appendFileSync(out, '    map[' + stringify(k) + '] = ' + keyMap[k] + ';\n');
    }
    fs.appendFileSync(out, '})(aurora.db.schema.keyMap);\n');

    fs.appendFileSync(out, '(function(map) {\n');
    // name path -> tableInfo
    for (let k in prefixMap) {
        fs.appendFileSync(out, '    map[' + stringify(k) + '] = ' + prefixMap[k] + ';\n');
    }
    fs.appendFileSync(out, '})(aurora.db.schema.prefixMap);\n');


    if (!client) {
        fs.appendFileSync(out, '(function(map) {\n');
        // name path -> tableInfo
        for (let k in tableMap) {
            fs.appendFileSync(out, '    map[' + stringify(k) + '] = ' + tableMap[k] + ';\n');
        }
        fs.appendFileSync(out, '})(aurora.db.schema.tableMap);\n');
    }

};

function makeTableDefMap(def) {
    let res = {};

    traverse(def, {startTable: function(name, data) {
        res[name] = data;
    }});
    return res;
}
function getPkColumn(table) {
    let res = null;
    table.columns.forEach(function(c) {
        if (c.type === 'id') {
            res = c.name;
        }
    });
    return res;
}

function safeGet(map, key, opt_def) {
    var res = map[key];
    if (res === undefined && arguments.length === 3) {
        res = opt_def;
        map[key] = opt_def;
    }
    return res;
}

function safeRecGet(map, keys, opt_def) {

    if (keys.length === 0) {
        throw new Error('must provide at least one key');
    }
    var curMap = map;
    for (var i = 0; i < keys.length - 1; i++) {
        if (arguments.length === 3) {
            curMap = safeGet(curMap, keys[i], {});
        }
        else if (curMap) {
            curMap = safeGet(curMap, keys[i]);
        }
        else {
            return undefined;
        }
    }
    if (arguments.length === 3) {
        return safeGet(curMap, keys[i], opt_def);
    }
    return safeGet(curMap || {}, keys[i]);
}

function makePasswords(def) {
    let passwords = {};
    traverse(def, {
        startCol: function(name, data, fullTableName, tableName) {
            let typeInfo = parseType(data.type);
            if (data.type === 'password') {
                safeRecGet(passwords, [tableName, name], true);
            }
        }
    });
    return passwords;
}
function makeForeignKeys(def) {
    let foreignKeys = {};
    let pTable = null;
    let tableDefs = makeTableDefMap(def);
    traverse(def, {
        startTable: function(name, data) {
            pTable = data;
        },
        startCol: function(name, data, fullTableName, tableName) {
            let typeInfo = parseType(data.type);
            let factory = typeFactories[typeInfo.type];
            let info = (factory && factory.getInfo) ? factory.getInfo(typeInfo) : null;
            if (factory) {
                if (factory.jsType === 'list') {
                    let tableKeys = foreignKeys[data.table.name] = foreignKeys[data.table.name] || {};

                    let colKeys = tableKeys[typeInfo.params[0]] = tableKeys[typeInfo.params[0]] || {};
                    colKeys.table = tableName;
                    colKeys.col = getPkColumn(pTable);

                }
                else if (factory.jsType === 'reference') {
                    let tableKeys = foreignKeys[tableName] = foreignKeys[tableName] || {};
                    let colKeys = tableKeys[data.name] = tableKeys[data.name] || {};
                    colKeys.table = info.table;
                    colKeys.col = getPkColumn(tableDefs[colKeys.table]);
                }
            }
        }
    });

    return foreignKeys;
}
function generateDbInit(def, ns, out) {
    fs.writeFileSync(out, '/**\n * GENERATED DO NOT CHANGE\n */\n\n');
    let prefix = 'aurora.db.schema.init.' + ns;
    let provides = [prefix + '.updateDb'];
    let inserts = {};
    let passwords = makePasswords(def);
    let tableMap = {};

    provides.sort();

    provides.forEach(function(provide) {
        fs.appendFileSync(out, 'goog.provide(\'' + provide + '\');\n');
    });
    fs.appendFileSync(out, '\n');
    fs.appendFileSync(out, 'goog.require(\'aurora.db.schema.init\');\n\n');
    fs.appendFileSync(out, 'goog.require(\'aurora.log\');\n\n');

    fs.appendFileSync(out, '/**\n * @param {!aurora.db.Pool} pool\n');
    fs.appendFileSync(out, ' * @param {function(?)} cb\n */\n');
    fs.appendFileSync(out, prefix + '.updateDb = function (pool, cb) {\n');

    fs.appendFileSync(out, '    let log = aurora.log.createModule(' + stringify('DBINIT-' + ns.toUpperCase(ns)) + ');\n');
    fs.appendFileSync(out, '    let todoInserts = [];\n');
    fs.appendFileSync(out, '    const async = require(\'async\');\n');

    fs.appendFileSync(out, '    async.series([\n');

    let firstTable = true;
    let first = true;
    let foreignKeys = makeForeignKeys(def);
    let tableInfo = {passwords: {}};
    traverse(def, {
        startTable: function(name, data, stack, tName, parentCol) {
            let tableName = data.tableName;
            tableMap[tableName] = data;
            if (data.initial) {
                inserts[tableName] = (inserts[tableName] || []).concat(data.initial);
            }
            if (!firstTable) {
                fs.appendFileSync(out, ',\n');
            }
            tableInfo = {passwords: {}};
            fs.appendFileSync(out, '        function (callback) {\n            log.info(\'Creating table\', ' + stringify(tableName) + ');\n');
            fs.appendFileSync(out, '            pool.createTable(' + stringify(tableName) + ', {\n');
            if (parentCol) {
                let parentType = getColType(parentCol);
                fs.appendFileSync(out, '                ' + stringify(parentType.childKey) + ': {type: aurora.db.type.types.bigint}');
                first = false;
            }
            else {
                first = true;
            }
            firstTable = false;
        },
        startCol: function(name, data) {
            let typeInfo = parseType(data.type);
            let factory = typeFactories[typeInfo.type];

            if (!factory || factory.sqlType !== null) {
                if (!first) {
                    fs.appendFileSync(out, ',\n');
                }
                if (data.type === 'id' && data.start != undefined) {
                    tableInfo.start = data.start;
                }
                fs.appendFileSync(out, '                ' + stringify(name));
                fs.appendFileSync(out, ': {type: aurora.db.type.types.' + (factory ? factory.sqlType : 'unknown_' + typeInfo.type));
                if (data.type === 'password') {
                    tableInfo.passwords[name] = true;
                }
                let info = (factory && factory.getInfo) ? factory.getInfo(typeInfo) : null;

                if (info && info.maxLength != undefined) {
                    fs.appendFileSync(out, ',length: ' + info.maxLength);
                }

                if (data.default != undefined) {
                    fs.appendFileSync(out, ', default: ' + stringify(data.default));
                }
                if (data.nullable === true) {
                    fs.appendFileSync(out, ', nullable: true');
                }
                if (data.type === 'id') {
                    fs.appendFileSync(out, ', pk: true');
                    if (data.auto === false) {
                        fs.appendFileSync(out, ', auto: false');
                    }


                }
                fs.appendFileSync(out, '}');
                first = false;
            }

        },
        endTable: function(name, data) {

            fs.appendFileSync(out, '},\n');
            let first = true;
            let indexes = [];
            if (data.indexes) {
                indexes = data.indexes.map(function(el) {
                    let res = {columns: el.columns};
                    if (el.unique) {
                        res.unique = true;
                    }
                    return res;
                });
            }
            fs.appendFileSync(out, '            ' + stringify(indexes) + ',\n');
            fs.appendFileSync(out, '            {exists: true,');
            if (tableInfo.start != undefined) {
                fs.appendFileSync(out, 'start: ' + stringify(tableInfo.start));
            }
            fs.appendFileSync(out, '}, callback);}');
        }

    });
    function doInserts(start, table, tInserts, parent, depth) {
        let padding = '     '.repeat(depth * 3);
        let colMap = {};
        let parentKey = null;

        if (tableMap[parent]) {
            tableMap[parent].columns.forEach(function(c) {
                if (c.table && table === c.table.name) {
                   parentKey = getColType(c).params[0];
                }
            });
        }

        tableMap[table].columns.forEach(function(c) {
            colMap[c.name] = c;
        });
        tInserts.forEach(function(row) {
            let hasPassword = false;
            let basicRow = {};
            let pRow = {};
            row = {...row};

            let subInserts = [];
            for (let k in row) {
                if (colMap[k] && colMap[k].table) {
                    subInserts = subInserts.concat({table: colMap[k].table, values: row[k]});
                    delete row[k];
                }
                else if (safeRecGet(passwords, [table, k])) {
                    hasPassword = true;
                    pRow[k] = row[k];
                } else {
                    basicRow[k] = row[k];
                }
            }

            if (!start) {
                fs.appendFileSync(out, ',');
            }
            fs.appendFileSync(out, '\n' + padding + '        function(callback) {\n');

            if (row['!select']) {
                let info = row['!select'];
                let cols = info.cols;

                let sql = stringify('INSERT INTO ') + ' + pool.escapeId(' + stringify(table) + ') + ' + stringify(' (') + ' + \n';
                if (depth !== 0) {
                    sql += padding + '    '.repeat(4);
                    sql += 'pool.escapeId(' + stringify(parentKey) + ') + \',\' + \n';
                }
                sql += cols.map(function(v) {
                    return padding + '    '.repeat(4) + 'pool.escapeId(' + stringify(v.to) + ')';
                }).join(' + \',\' + \n') + ' + \')  (SELECT \'';
                let after = cols.map(function(v) {
                    if (v.exp) {
                        return padding + '    '.repeat(4) + stringify(v.exp);
                    }
                    return padding + '    '.repeat(4) + 'pool.escapeId(' + stringify(v.from) + ')';
                }).join(' + \',\' +\n') + ' + ' + stringify(info.query + ')');
                if (depth !== 0) {
                    fs.appendFileSync(out, padding + '            pool.query(' + sql);
                    fs.appendFileSync(out, ' + pool.escape(res.insertId) + \',\' +\n' + after);
                }
                else {
                    fs.appendFileSync(out, padding + '            pool.query(' + sql + after);
                }
            }
            else if (hasPassword) {
                fs.appendFileSync(out, padding + '            let row = ' + stringify(row) + ';\n');
                if (depth !== 0) {
                    fs.appendFileSync(out, padding + '            row[' + stringify(parentKey) + '] = res.insertId;\n');
                }
                fs.appendFileSync(out, padding + '            log.info(\'Insert row\', row , \'into\',' + stringify('\'' + table.toUpperCase() + '\'') + ');\n');
                fs.appendFileSync(out, padding + '            aurora.db.Pool.passwordInsert(pool,' + stringify(table) + ', ' + stringify(pRow) + ',row ');
            }
            else {
                fs.appendFileSync(out, padding + '            let row = ' + stringify(row) + ';\n');
                if (depth !== 0) {
                    fs.appendFileSync(out, padding + '            row[' + stringify(parentKey) + '] = res.insertId;\n');
                }
                fs.appendFileSync(out, padding + '            log.info(\'Insert row\', row , \'into\',' + stringify('\'' + table.toUpperCase() + '\'') + ');\n');
                fs.appendFileSync(out, padding + '            pool.insert(' + stringify(table) + ',row ');
            }
            if (subInserts.length > 0) {

                fs.appendFileSync(out, padding + ', function (err, res) {\n');
                fs.appendFileSync(out, padding + '                log.info("starting sub");\n');
                fs.appendFileSync(out, padding + '                if (err) {\n');
                fs.appendFileSync(out, padding + '                    callback(err);\n');
                fs.appendFileSync(out, padding + '                } else {\n');
                subInserts.forEach(function(info, idx) {
                    fs.appendFileSync(out, padding + '                   todoInserts.push({table:' + stringify(info.table.name) + ', action:');

                    doInserts(idx === 0, info.table.name, info.values, table, depth + 1);
                    fs.appendFileSync(out, '});\n');
                });
                fs.appendFileSync(out, padding + '                    callback(null);\n');
                fs.appendFileSync(out, padding + '                }\n');
                fs.appendFileSync(out, padding + '            });\n');
                fs.appendFileSync(out, padding + '        }');
            }
            else {
                fs.appendFileSync(out, ', callback);\n' + padding + '        }');
            }
        });
    };

    //  we need the depenancies so we we can do the inserts right
    let depMap = {};

    for (let t in foreignKeys) {
        let entry = foreignKeys[t];
        depMap[t] = depMap[t] || {};
        for (let col in entry) {
            depMap[t][entry[col].table] = true;
        }
    }

    function closeDeps(depMap, entry, item, seen) {
        let dependsOn = depMap[item];
        if (seen[item]) {
            console.error('loop in dependancies', item, depMap);
            process.exit(1);
        }
        seen[item] = true;
        if (entry != item) {
            depMap[entry][item] = true;
        }
        if (!dependsOn) {
            return;
        }
        for (let provider in dependsOn) {
            // a table can reference itself
            if (item !== provider) {
                closeDeps(depMap, entry, provider, seen);
            }
        }
    };

    for (let t in depMap) {
        closeDeps(depMap, t, t, {});
    }

    function depComparator(x, y) {
        if (x === y) {
            return 0;
        }
        if (depMap[x] && depMap[x][y]) {
            return 1;
        }
        if (depMap[y] && depMap[y][x]) {
            return -1;
        }
        return x.localeCompare(y);
    }

    let insertKeys = Object.keys(inserts);
    insertKeys.sort(depComparator);
    insertKeys.forEach(function(table) {
        doInserts(false, table, inserts[table], null, 0);
    });

    fs.appendFileSync(out, ',\n        function(callback) {\n');
    fs.appendFileSync(out, '                 aurora.db.schema.init.processDependants(todoInserts, ' + JSON.stringify(depMap) + ', callback);\n');
    fs.appendFileSync(out, '        }');

    for (let fkTable in foreignKeys) {
        let fkInfo = foreignKeys[fkTable];
        for (let fkName in fkInfo) {
            let info = fkInfo[fkName];
            fs.appendFileSync(out, ',\n        function(callback) {\n');
            fs.appendFileSync(out, '                 pool.createForeignKey(' + stringify(fkTable) + ', [' + stringify(fkName) + '] ,' + stringify(info.table) + ', [' + stringify(info.col) + '], callback);\n');
            fs.appendFileSync(out, '        }');
        }
    }

    //todo ref types foriegn keys
    // objects unowned -> isn't this a ref?
    // objects owned <- just like list except fk is unique? car about ordering maybe but not really should only need to update when deleting
    // check out parent - seems to use parent and id we shouldn't need both but ok

    fs.appendFileSync(out, '], \n        function (err) {\n');
    fs.appendFileSync(out, '            if (err) {log.error(err);}\n');
    fs.appendFileSync(out, '            else { log.info(\'database created\');}\n');
    fs.appendFileSync(out, '            cb(err);\n        });\n');
    fs.appendFileSync(out, '};\n');
}

function mergeTable(oldTable, newTable) {

    if (newTable.access) {
        oldTable.access = newTable.access;
    }

    if (newTable.accessFilter) {
        oldTable.accessFilter = newTable.accessFilter;
    }

    if (newTable.initial) {
        oldTable.initial = (oldTable.initial || []).concat(newTable.initial);
    }

    if (newTable.indexes) {
        oldTable.indexes = (oldTable.indexes || []).concat(newTable.indexes);
    }

    if (newTable.columns) {
        let colMap = [];
        // the old table must have columns
        oldTable.columns.forEach(function(col) {
            colMap[col.name] = col;
        });

        newTable.columns.forEach(function(col) {
            let old = colMap[col.name];
            if (old) {
                if (old.table) {
                    throw 'merge subtables not supported yet';
                }
                else {
                    Object.assign(old, col);
                }
            }
            else {
                oldTable.columns.push(col);
            }
        });
    }

}

module.exports = {
    generateSchema: function(sqlDefFiles, ns, output) {
        let tableMap = {};
        let defs = {tables: []};
        let requires = {};
        sqlDefFiles.forEach(function(sqlDefFile) {
            let curDef = JSON.parse(fs.readFileSync(sqlDefFile));
            if (curDef.require) {
                curDef.require.forEach(function(req) {
                    requires[req] = true;
                });
            }
            if (curDef.tables) {
                for (let i = 0; i < curDef.tables.length; i++) {
                    let table = curDef.tables[i];
                    if (tableMap[table.name]) {
                        mergeTable(tableMap[table.name], table);
                    }
                    else {
                        tableMap[table.name] = table;
                        defs.tables.push(table);
                    }
                }
            }

        });
        doGenerate(defs, ns, true, requires, output + '.gen.client.js');
        doGenerate(defs, ns, false, requires, output + '.gen.server.js');
        generateDbInit(defs, ns, output + '.init.gen.server.js');
    },
};
