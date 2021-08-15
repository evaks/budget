/**
 * common file that defines things used in the schema
 */
goog.provide('aurora.db.Schema');
goog.provide('aurora.db.schema.ColsType');
goog.provide('aurora.db.schema.InfoType');
goog.provide('aurora.db.schema.RefType');
goog.provide('aurora.db.schema.TableQueryScope');
goog.provide('aurora.db.schema.TableType');
goog.provide('aurora.db.schema.actionMap');
goog.provide('aurora.db.schema.actions');
goog.provide('aurora.db.schema.keyMap');
goog.provide('aurora.db.schema.modules');
goog.provide('aurora.db.schema.pathMap');
goog.provide('aurora.db.schema.prefixMap');
goog.provide('aurora.db.schema.tables.sec.permissions');
goog.require('aurora.db');
goog.require('aurora.db.access');
goog.require('recoil.db.BasicType');
goog.require('recoil.db.ChangeSet');
goog.require('recoil.structs.table.ColumnKey');

/**
 * @typedef {{
 *          getTable:function(!recoil.structs.table.ColumnKey):?aurora.db.schema.TableType,
 *          getParentTable:function(!recoil.structs.table.ColumnKey):?aurora.db.schema.TableType,
 *          getTableByName:function((string|!recoil.db.ChangeSet.Path)):?aurora.db.schema.TableType,
 *          getMetaByPath:function((string|!recoil.db.ChangeSet.Path)):Object,
 *          keyMap:!Object<string,aurora.db.schema.TableType>,
 *          }}
 */
aurora.db.SchemaType;
/**
 * @typedef {{path:string,
 *            pk:!recoil.structs.table.ColumnKey,
 *            parentKey:(!recoil.structs.table.ColumnKey|undefined),
 *            refs:!Array<!aurora.db.schema.RefType>,
 *            autoPk:(boolean|undefined),
 *            access:(function(!aurora.db.access.SecurityContext,string):boolean|undefined),
 *            accessFilter:(function(!aurora.db.access.SecurityContext):!recoil.db.Query|undefined),
 *            unique:!Array<!Array<!recoil.structs.table.ColumnKey>>,
 *      keys:(!Array<string>|undefined),name:string,config:(boolean|undefined),autokey:(undefined|boolean)}}
 */
aurora.db.schema.InfoType;

/**
 * @typedef {Object}
 */
aurora.db.schema.ColsType;


/**
 * @typedef {{table:!aurora.db.schema.TableType, col: string, nullable:boolean}}
 */
aurora.db.schema.RefType;

/**
 * @typedef {{type:string,list:(boolean|undefined), owned:(boolean|undefined),childKey:(undefined|string)}}
 */
aurora.db.schema.ColumnMeta;

/**
 * @typedef {{info:!aurora.db.schema.InfoType,key:!recoil.db.BasicType, cols:!aurora.db.schema.ColsType,meta:!Object}}
 */
aurora.db.schema.TableType;

/**
 * @typedef {{key:!recoil.db.BasicType, arrayParams:(undefined|boolean),func:(undefined|function(!aurora.db.access.SecurityContext,?,!Array,function(?,!Array))|function(!aurora.db.access.SecurityContext,?,...)),inputs:!Array, outputs:!Array}}
 */
aurora.db.schema.ActionType;


/**
 * @typedef {{enumDisplay:?}}
 */
aurora.db.schema.Enum;

/**
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {!Object}
 */
aurora.db.schema.getEnum = function(col) {
    var table = aurora.db.schema.colMap[col];
    for (var c in table.meta) {
        if (col === table.meta[c].key) {
            return table.meta[c].enum;
        }
    }
    throw 'unable to find enum';
};
/**
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {!Object}
 */
aurora.db.schema.getMeta = function(col) {
    var table = aurora.db.schema.colMap[col];
    for (var c in table.meta) {
        if (col === table.meta[c].key) {
            return table.meta[c];
        }
    }
    throw 'unable to find meta';
};


/**
 * @param {string|!recoil.db.ChangeSet.Path} path
 * @return {!Object}
 */
aurora.db.schema.getMetaByPath = function(path) {
    if (path instanceof recoil.db.ChangeSet.Path) {
        path = path.pathAsString();
    }
    let parts = path.split('/');
    let last = parts.pop();

    var table = aurora.db.schema.keyMap[parts.join('/')];
    if (table && table.meta[last]) {
        return table.meta[last];
    }
    throw 'unable to find meta for ' + path;
};

/**
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {!Array<!Object>}
 */
aurora.db.schema.getMetas = function(col) {
    var tables = aurora.db.schema.pathMap[aurora.db.schema.colMap[col].info.path];
    var res = [];
    tables.forEach(function(table) {
        for (var c in table.meta) {
            if (col === table.meta[c].key) {
                res.push(table.meta[c]);
            }
         }
    });
    return res;
};
/**
 * @param {!aurora.db.schema.TableType} tbl
 * @param {!Array<string>=} opt_path
 * @param {!Object<string,!Array<string>>=} opt_res
 * @return {!Object<string,!Array<string>>}
 */
aurora.db.schema.makeColKeyMap = function(tbl, opt_path, opt_res) {
    let res = opt_res || {};
    let path = [] || opt_path;

    for (var name in tbl.meta) {
        var meta = tbl.meta[name];
        let subPath = goog.array.clone(path);
        let key = meta.key;
        let child = aurora.db.schema.getTable(key);
        subPath.push(name);
        res[meta.key.getId()] = subPath;
        if (child) {
            aurora.db.schema.makeColKeyMap(child, subPath, res);
        }

    }
    return res;
};

/**
 * @param {!aurora.db.schema.TableType} tbl
 * @param {function(!recoil.structs.table.ColumnKey,Object,string)} itr argument: column,meta info, col name
 */
aurora.db.schema.forEachRealCol = function(tbl, itr) {
    for (var name in tbl.meta) {
        var meta = tbl.meta[name];
        itr(meta.key, meta, name);
    }
};

/**
 * gets the table associated with the column i.e. the column is a container
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {?aurora.db.schema.TableType}
 */
aurora.db.schema.getTable = function(col) {
    var colEntry = aurora.db.schema.colMap[col];
    return colEntry ? aurora.db.schema.keyMap[colEntry.info.name + '/' + col.getName()] : null;
};

/**
 * @param {string|!recoil.db.ChangeSet.Path} name
 * @return {?aurora.db.schema.TableType}
 */

aurora.db.schema.getTableByName = function(name) {
    if (typeof(name) === 'string') {
        return aurora.db.schema.keyMap[name] || null;
    }
    return aurora.db.schema.keyMap[name.pathAsString()] || null;
};

/**
 * get a list of tables that reference this table
 *
 * @param {!aurora.db.schema.TableType} table
 * @return {!Array<!aurora.db.schema.RefType>}
 */

aurora.db.schema.getReferences = function(table) {
    return table.info.refs;
};


/**
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {string} access the type of access you want one of c,r,u,d
 * @return {boolean}
 */
aurora.db.schema.hasAccess = function(context, path, access) {
    let tbl = aurora.db.schema.getTableByName(path);
    if (tbl === null) {
        if (path.size() == 0) {
            return false;
        }
        // you can't create or delete a leaf
        if (access === 'c' || access == 'd') {
            return false;
        }
        // could be just a column with no subtable so check the parent
        tbl = aurora.db.schema.getTableByName(path.parent());
        if (tbl === null) {
            return false;
        }
        let meta = tbl.meta[path.last().name()];

        if (!meta) {
            return false;
        }
        if (meta.access) {
            return meta.access(context, access);
        }
        path = path.parent();
    }


    while (tbl && path.size() > 0) {
        if (tbl.info.access) {
            return tbl.info.access(context, access);
        }
        let pTbl = aurora.db.schema.getTableByName(path.parent());
        if (pTbl) {
            let meta = pTbl.meta[path.last().name()];

            if (!meta) {
                return false;
            }
            if (meta.access) {
                return meta.access(context, access);
            }
        }
        path = path.parent();
        tbl = pTbl;

        // we are no longer deleting or adding we are updating
        if (access === 'c' || access == 'd') {
            access = 'u';
        }
    }
    return false;

};

/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {recoil.db.ChangeSet.Path}
 */
aurora.db.schema.getBasePath = function(path) {
    let tbl = aurora.db.schema.getTableByName(path);
    if (tbl == null || path.size() === 0) {
        return null;
    }
    let parent = path.parent();
    tbl = aurora.db.schema.getTableByName(parent);
    while (tbl && parent.size() > 0) {
        path = parent;
        parent = parent.parent();
        tbl = aurora.db.schema.getTableByName(parent);
    }

    return path;
};

/**
 * makes a path to a table, filling in the keys, if the table doesn't exist
 * or keys are missing then returns null
 * @param {string} path
 * @param {!Array} inKeys
 * @param {boolean=} opt_item if true will assume the last value has a key
 * @return {recoil.db.ChangeSet.Path}
 */
aurora.db.schema.getTablePath = function(path, inKeys, opt_item) {
    let tbl = aurora.db.schema.getTableByName(path);
    if (!tbl) {
        return null;
    }
    let keys = goog.array.clone(inKeys);
    let parts = path.split('/');
    let items = opt_item ? [] : [new recoil.db.ChangeSet.PathItem(parts.pop(), [], [])];
    tbl = aurora.db.schema.getTableByName(parts.join('/'));
    while (tbl && tbl.info) {
        let partKeys = [];
        let name = parts.pop();
        let expectedKeys = tbl.info.keys || [];

        if (expectedKeys.length > keys.length) {
            // missing a key
            return null;
        }

        for (let i = 0; i < expectedKeys.length; i++) {
            partKeys.push(keys.pop());
        }
        partKeys.reverse();
        items.push(new recoil.db.ChangeSet.PathItem(name, expectedKeys, partKeys));
        tbl = aurora.db.schema.getTableByName(parts.join('/'));
    }
    while (parts.length > 0) {
        let name = parts.pop();
        if (name !== '') {
            items.push(new recoil.db.ChangeSet.PathItem(name, [], []));
        }
    }
    items.reverse();

    // don't allow too may keys
    if (keys.length !== 0) {
        return null;
    }
    return new recoil.db.ChangeSet.Path(items);

};

/**
 * gets the table the column is in
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {aurora.db.schema.TableType}
 */
aurora.db.schema.getParentTable = function(col) {
    return aurora.db.schema.keyMap[aurora.db.schema.colMap[col].info.name];
};
/**
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {{value:!Object,display:!recoil.ui.message.MessageEnum}}
 */
aurora.db.schema.getEnumInfo = function(col) {
    var table = aurora.db.schema.colMap[col];
    for (var c in table.meta) {
        if (col === table.meta[c].key) {
            return {value: table.meta[c].enum, display: table.meta[c].enumDisplay};
        }
    }
    throw 'unable to find enum';
};
/**
 * @param {!aurora.db.schema.TableType} type
 * @return {!Array<!recoil.structs.table.ColumnKey>}
 */
aurora.db.schema.getPrimaryColumns = function(type) {
    var res = [];
    (type.info.keys || []).forEach(function(key) {
        res.push(type.meta[key].key);
    });
    return res;
};


/**
 * @const
 * @type {!Object<string,aurora.db.schema.TableType>}
 */
aurora.db.schema.keyMap = {};


/**
 * @const
 * @type {Object<string,!Array<aurora.db.schema.TableType>>}
 */
aurora.db.schema.pathMap = {};


/**
 * @const
 * @type {Object<string,boolean>}
 */
aurora.db.schema.prefixMap = {};

/**
 * @const
 * @type {Object<string,aurora.db.schema.ActionType>}
 */
aurora.db.schema.actionMap = {};

/**
 * @type {Object<!recoil.structs.table.ColumnKey,aurora.db.schema.TableType>}
 */
aurora.db.schema.colMap = {};

/**
 * @type {Object<string,aurora.db.schema.TableType>}
 */
aurora.db.schema.tableMap = {};

/**
 * @constructor
 * @implements {recoil.db.ChangeSet.Schema}
 */
aurora.db.Schema = function() {};

/**
 * makes a scope from the path so queries can execute on the object
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {Object} context
 * @param {?} object
 * @return {!recoil.db.QueryScope}
 */

aurora.db.Schema.prototype.makeQueryScope = function(path, context, object) {
    var def = /** @type {aurora.db.schema.TableType} */ (this.getContainerDef(path));
    return new aurora.db.schema.TableQueryScope(context, object, def, aurora.db.schema);

};


/**
 * makes a scope from the path so queries can execute on the object
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {Object} context
 * @param {?} object
 * @return {!recoil.db.QueryScope}
 */

aurora.db.Schema.prototype.makeLookupScope = function(path, context, object) {
    var def = /** @type {aurora.db.schema.TableType} */ (this.getContainerDef(path));
    return new aurora.db.schema.LookupScope(context, object, def, aurora.db.schema);

};

/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {!Array<string>} the children
 */
aurora.db.Schema.prototype.children = function(path) {
    var def = this.getContainerDef(path);
    var res = [];
    if (def) {
        for (var name in def.meta) {
            res.push(name);
        }
    }
    return res;
};

/**
 * set up container after item is added
 * @param {recoil.db.ChangeSet.Path} path
 * @param {!recoil.db.ChangeDbInterface} db
 */
aurora.db.Schema.prototype.applyDefaults = function(path, db) {
    var def = this.getContainerDef(path);
    var res = [];
    if (def) {
        var keys = {};
        if (def.info.keys) {
            for (var i = 0; i < def.info.keys.length; i++) {
                keys[def.info.keys[i]] = true;
            }
        }

        for (var name in def.meta) {
            if (!keys[name]) {
                if (def.meta[name].type === 'list') {
                    db.set(path.appendName(name), []);
                }
                else {
                    if (def.meta[name].isEmpty) {
                        db.set(path.appendName(name), false);
                    }
                    else {
                        db.set(path.appendName(name), null);
                    }
                }
            }
        }
    }
};

/**
 * returns a list of keys at the path level not parent keys
  * @param {recoil.db.ChangeSet.Path} path
* @return {!Array<string>} keys
 */
aurora.db.Schema.prototype.keys = function(path) {
    var def = this.getContainerDef(path);
    return def && def.info.keys ? def.info.keys : [];

};
/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {Object}
 */
aurora.db.Schema.prototype.getContainerDef = function(path) {
    if (path.items().length === 0) {
        return null;
    }
    var last = path.last();
    var pathStr = path.pathAsString();
    var def = aurora.db.schema.keyMap[pathStr];
    if (!def) {
        def = aurora.db.schema.keyMap[pathStr.substr(1)];
    }
    return def;
};
/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {boolean}
 */
aurora.db.Schema.prototype.isLeaf = function(path) {
    if (this.getContainerDef(path)) {
        return false;
    }
    var pathStr = path.pathAsString();
    return !aurora.db.schema.prefixMap[pathStr];
};

/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {boolean} true if the list can be updated without deleting other items
 */
aurora.db.Schema.prototype.isPartial = function(path) {
    let def = this.getContainerDef(path);
    if (def) {
        return false;
    }

    var pathStr = path.pathAsString();
    return !!(def.info && def.info.partial);
};

/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {boolean} true if the path is a list of object and the keys are not specified, else false
 */
aurora.db.Schema.prototype.isKeyedList = function(path) {
    var parts = path.parts();
    var def = this.getContainerDef(path);
    var params = path.lastKeys();
    return def && def.info.keys && def.info.keys.length > params.length;
};

/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {boolean} true if the path is a list of object and the keys are not specified, else false
 */
aurora.db.Schema.prototype.isOrderedList = function(path) {
    var strPath = path.pathAsString();
    var def = this.getContainerDef(path);
    return !!(def && def.info && def.info.ordered);
};



/**
 * @param {recoil.db.ChangeSet.Path} path
 * @return {boolean} returns true if the user has to create
 */
aurora.db.Schema.prototype.isCreatable = function(path) {
    var def = this.getContainerDef(path);
    return !!(def && def.creatable);
};
/**
 * @param {!aurora.db.schema.InfoType} def
 * @param {Array} keys
 * @param {Array<!recoil.db.ChangeSet.PathItem>} remainingItems
 * @return {!recoil.db.ChangeSet.Path}
 */
aurora.db.Schema.resolveParams = function(def, keys, remainingItems) {
    var parts = def.path.split('/');
    var items = [];
    var curKey = 0;
    var cur = [''];
    for (var i = 1; i < parts.length; i++) {
        cur.push(parts[i]);
        var curPath = cur.join('/');

        var info = aurora.db.schema.keyMap[curPath];

        var item = new recoil.db.ChangeSet.PathItem(parts[i], [], []);
        if (info && info.info && info.info.keys) {
            var curKeys = [];
            for (var j = 0; j < info.info.keys.length; j++) {
                curKeys.push(keys[curKey++]);
            }
            item = new recoil.db.ChangeSet.PathItem(parts[i], info.info.keys, curKeys);
        }
        items.push(item);
    }
    remainingItems.forEach(function(i) {
        items.push(i);
    });

//    console.log("resolved path ", new recoil.db.ChangeSet.Path(items).toString());
    return new recoil.db.ChangeSet.Path(items);
};

/**
 * @param {string} name
 * @param {Array} keys
 * @param {!recoil.db.ChangeSet.ValueSerializor} valSerializor
 * @param {!recoil.db.ChangeSet.PathCompressor} compressor
 * @return {!recoil.db.ChangeSet.Path}
 */

aurora.db.Schema.prototype.makeRootPath = function(name, keys, valSerializor, compressor) {
        var res = recoil.db.ChangeSet.Path.fromString(name);
        if (!keys || keys.length === 0) {
            return res;
        }
        var info = this.getContainerDef(res);

        if (info && info.info && info.info.params) {
            // we need to get the actual location of the keys so we can deserialize them
            var ab = this.absolute(res.setKeys(info.info.params, keys));
            var skeys = recoil.db.ChangeSet.Path.deserialize(
                {parts: ab.parts().join('/'), params: keys}, this, valSerializor, compressor).keys();
            return res.setKeys(info.info.params, skeys);
        }
        return res;
    };
/**
 * converts a path into an absolute path this solve
 * so you can have different paths for the same thing
 *
 * @param {!recoil.db.ChangeSet.Path} path
 * @return {!recoil.db.ChangeSet.Path}
 */
aurora.db.Schema.prototype.absolute = function(path) {
    var items = path.items();
    var workingItems = path.items().slice(0);
    var popped = 0;

    if (workingItems.length > 0) {
        var firstItem = workingItems[0];
        if (firstItem.keys().length > 0) {
            var paramDef = this.getContainerDef(new recoil.db.ChangeSet.Path([firstItem]));
            if (paramDef && paramDef.info && paramDef.info.params) {

                workingItems.shift();


//                console.log("first item this maybe wrong", path.toString(), paramDef.info.path, workingItems);
                return aurora.db.Schema.resolveParams(paramDef.info, firstItem.keys(), workingItems);
            }
        }
    }

    var def = this.getContainerDef(path);
    while (workingItems.length > 0 && !def) {
        popped++;
        workingItems.pop();
        def = this.getContainerDef(new recoil.db.ChangeSet.Path(workingItems));
    }
    if (def) {
        var absItems = recoil.db.ChangeSet.Path.fromString(def.info.path).items();
        var resItems = [];
        var curAbs;
        for (curAbs = 0; curAbs < absItems.length - (items.length - popped); curAbs++) {
            resItems.push(absItems[curAbs]);
        }

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (curAbs < absItems.length) {
                resItems.push(
                    new recoil.db.ChangeSet.PathItem(
                        absItems[curAbs++].name(),
                        item.keyNames(), item.keys()));
            }
            else {
                resItems.push(item);
            }
        }

        return new recoil.db.ChangeSet.Path(resItems);
    }


    return path;
};

/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {?} obj
 * @return {!recoil.db.ChangeSet.Path}
 */
aurora.db.Schema.prototype.createKeyPath = function(path, obj) {
    var def = this.getContainerDef(path);
    var keys = [];
    def.info.keys.forEach(function(key) {
        keys.push(obj[key]);
    });
    return path.setKeys(def.info.keys, keys);
};

/**
 * this is used to filter out items that may exist in the aboslute path
 * but not in the named path
 *
 * @param {recoil.db.ChangeSet.Path} path
 * @return {boolean} true if the path exist for this path
 */
aurora.db.Schema.prototype.exists = function(path) {
    var def = this.getContainerDef(path);
    if (def) {
        return true;
    }
    if (path.items().length <= 1) {
        return false;
    }
    def = this.getContainerDef(path.parent());
    if (!def) {
        return false;
    }
    return def.meta[path.last().name()] ? true : false;
};


/**
 * a fake permissions table so we can get the permissions
 */
/**
 * @struct
 * @const
 */
aurora.db.schema.tables.sec.permissions.cols = {
    userid: new recoil.structs.table.ColumnKey('userid'),
    permissions: new recoil.structs.table.ColumnKey('permissions'),
};

/**
 * @final
 */
aurora.db.schema.actions = {};


/**
 * @type {!aurora.db.schema.InfoType}
 * @const
 */
aurora.db.schema.tables.sec.permissions.info = {
    name: '/$sec/permissions',
    path: '/$sec/permissions',
    pk: aurora.db.schema.tables.sec.permissions.cols.userid,
    unique: [],
    refs: []
};
/**
 * @const
 */
aurora.db.schema.tables.sec.permissions.meta = {
    'userid': {
        key: aurora.db.schema.tables.sec.permissions.cols.userid,
        type: 'int'
    },
    'permissions': {
        key: aurora.db.schema.tables.sec.permissions.cols.permissions,
        type: 'object'

    }
};

/**
 * @type {!recoil.db.BasicType}
 * @const
 */
aurora.db.schema.tables.sec.permissions.key = new recoil.db.BasicType([], aurora.db.schema.tables.sec.permissions.info);

(function(keyMap, colMap, prefixMap, tbl) {
    prefixMap['/$sec'] = true;
    keyMap['/$sec/permissions'] = tbl;
    colMap[tbl.cols.userid] = tbl;
    colMap[tbl.cols.permissions] = tbl;
})(aurora.db.schema.keyMap, aurora.db.schema.colMap, aurora.db.schema.prefixMap, aurora.db.schema.tables.sec.permissions);



/**
 * @extends {recoil.db.QueryScope}
 * @constructor
 * @param {Object} context
 * @param {Object} map
 * @param {!aurora.db.schema.TableType} table
 * @param {!aurora.db.SchemaType} schema
 * @param {!recoil.db.QueryHelper=} opt_helper
 */
aurora.db.schema.TableQueryScope = function(context, map, table, schema, opt_helper) {
    recoil.db.QueryScope.call(this, map, opt_helper);
    this.basePath_ = table.info.path.split('/');
    this.schema_ = schema;
    this.obj_ = map;
    this.context_ = context;
};
goog.inherits(aurora.db.schema.TableQueryScope, recoil.db.QueryScope);




/**
 * @param {Array<string|!recoil.structs.table.ColumnKey>} inParts indexes to get the object
 * @return {*}
 */
aurora.db.schema.TableQueryScope.prototype.get = function(inParts) {
    if (inParts.length === 0) {
        return undefined;
    }
    if (inParts.length == 1 && inParts[0] instanceof recoil.structs.table.ColumnKey) {
        let col = /** @type {!recoil.structs.table.ColumnKey} */ (inParts[0]);
        let tbl = this.schema_.getParentTable(col);
        if (!tbl) {
            return undefined;
        }
        let parts = tbl.info.path.split('/');
        if (this.basePath_.length > parts.length) {
            return undefined;
        }
        // doesn't work with lists
        for (let i = 0; i < this.basePath_.length; i++) {
            if (parts[i] !== this.basePath_[i]) {
                return undefined;
            }
        }

        let cur = this.obj_;
        for (let i = this.basePath_.length; cur && i < parts.length; i++) {
            cur = cur[parts[i]];
        }
        let res = cur ? cur[col.getName()] : undefined;
        if (res instanceof aurora.db.PrimaryKey) {
            return res.db;
        }
        return res;
    }

    let res = aurora.db.schema.TableQueryScope.superClass_.get.call(this, inParts);
    if (res instanceof aurora.db.PrimaryKey) {
        return res.db;
    }
};


/**
 * @extends {recoil.db.QueryScope}
 * @constructor
 * @param {Object} context
 * @param {Object} map
 * @param {!aurora.db.schema.TableType} table
 * @param {!aurora.db.SchemaType} schema
 * @param {!recoil.db.QueryHelper=} opt_helper
 */
aurora.db.schema.LookupScope = function(context, map, table, schema, opt_helper) {
    recoil.db.QueryScope.call(this, map, opt_helper);
    this.basePath_ = table.info.path.split('/');
    this.schema_ = schema;
    this.obj_ = map;
    this.context_ = context;
};
goog.inherits(aurora.db.schema.LookupScope, aurora.db.schema.TableQueryScope);

/**
 * @param {Array<string|!recoil.structs.table.ColumnKey>} inParts indexes to get the object
 * @return {*}
 */

aurora.db.schema.LookupScope.prototype.get = function(inParts) {
    if (inParts.length === 0) {
        return undefined;
    }
    if (inParts.length == 1 && inParts[0] instanceof recoil.structs.table.ColumnKey) {
        let col = /** @type {!recoil.structs.table.ColumnKey} */ (inParts[0]);
        let tbl = this.schema_.getParentTable(col);
        if (!tbl) {
            return undefined;
        }
        let parts = tbl.info.path.split('/');
        if (this.basePath_.length > parts.length) {
            return undefined;
        }

        // doesn't work with lists
        for (let i = 0; i < this.basePath_.length; i++) {
            if (parts[i] !== this.basePath_[i]) {
                return undefined;
            }
        }

        let res = {};
        let newPath = parts.splice(this.basePath_.length);
        newPath.push(col.getName());
        res[newPath.join('/')] = recoil.db.expr.FIELD;
        return res;

    }
    let res = {};
    res[inParts.join('/')] = recoil.db.expr.FIELD;

    return res;
    // still need to do getting context fields
//    let res = aurora.db.schema.TableQueryScope.superClass_.get.call(this, inParts);
};


