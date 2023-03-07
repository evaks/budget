goog.provide('aurora.db.schema.init');


/**
 * @param {Array<{table: string, action: function(function(?))}>} dependants
 * @param {Object<string,Object<boolean>>} depMap
 * @param {function(?)} done
 */
aurora.db.schema.init.processDependants = function(dependants, depMap, done) {

    if (dependants.length === 0) {
        done(null);
        return;
    }
    // remove everything from dependants and put it in curDependants
    let curDependants = dependants.splice(0);
    let comparator = function(x, y) {
        if (x.table === y.table) {
            return 0;
        }
        if (depMap[x.table] && depMap[x.table][y.table]) {
            return 1;
        }
        if (depMap[y.table] && depMap[y.table][x.table]) {
            return -1;
        }
        return x.table.localeCompare(y.table);
    };

    curDependants.sort(comparator);

    const async = require('async');

    async.eachSeries(curDependants, function(item, cb) {
        item.action(cb);
    }, function(err) {
        if (err) {
            done(err);
        }
        else {
            aurora.db.schema.init.processDependants(dependants, depMap, done);
        }
    });

};

/**
 * @param {!aurora.db.Pool} pool
 * @param {string} table
 * @param {!Object<string,?>} row
 * @param {!Array<{col:string, table:string, key: string, fields: !Array<{name:string, value:?}>}>} lookups
 * @param {function(?,?aurora.db.type.InsertDef)} cb (error, results)
 */
aurora.db.schema.init.insert = function (pool, table, row,  lookups, cb) {
    let doInsert = function () {
        if (lookups.length == 0) {
            pool.insert(table, row , cb);
        }
        else {
            let lookup = lookups.pop();
            let query = 'SELECT ' + pool.escapeId(lookup.key) +  '  FROM ' + pool.escapeId(lookup.table) +
                ' WHERE ' + lookup.fields.map(v => pool.escapeId(v.name) + ' = ' + pool.escape(v.value)).join (' AND ');
            pool.query(query,
                function (err, data) {
                    if (err) {
                        cb(err);
                    }
                    else if (data.length != 1) {
                        cb('expected only 1 result from ' + query);
                    }
                    else {
                        row[lookup.col] = data[0][lookup.key];
                        doInsert();
                    }
                }
            );
        }
    };
    doInsert();

};
/**
 * @param {!aurora.db.Pool} pool
 * @param {function(!aurora.db.Pool,function(?))} updateFunc
 * @param {function(?)} done
 */
aurora.db.schema.init.doUpdateDb = function(pool, updateFunc, done) {
    let tableVersions = {};
    let getVersionsAndUpdateAsync = async function (pool)  {
        await pool.createTableAsync('table_versions', {
            'id' : {type: aurora.db.type.types.bigint, pk: true},
            'name': {type: aurora.db.type.types.varchar,length: 1024},
            'version': {type: aurora.db.type.types.bigint}
        }, [], {exists: true});
        let {results, fields} = await pool.queryAsync('SELECT id, name, version FROM `table_versions`');
        let versions = {};
        results.forEach(val => {
            versions[val.name] = BigInt(val.version);
        });
        return versions;
    };

    let updateVersions = async (pool, versions) => {
        await pool.deleteAsync('table_versions', {});
        for (let name in versions) {
            await pool.insertAsync('table_versions', {'name': name, 'version' : versions[name]});
        }
    };
    let getVersionsAndUpdate = function (pool, cb)  {
        getVersionsAndUpdateAsync(pool).then((versions) => {
            updateFunc(pool, versions, (err) => {
                if (err) {
                    cb(err);
                }
                else {
                    updateVersions(pool, versions).then(() => cb()).catch(cb);
                }
            });
        }).catch(cb);
    };

    
    let log = aurora.log.createModule('DBINIT-BASE');
    log.info('Backing up database');
    pool.backup(function(err, fname) {
        if (err) {
            log.error('Backing failed', err);
            done(err);
            return;
        }
        if (fname) {
            // the database existed do restore if failed
            log.info('Backed up to ', fname);
            getVersionsAndUpdate(pool, function(err) {
                if (err && fname) {
                    pool.restore(fname, function(rbError) {
                        done(rbError || err);
                    });
                }
                else {
                    done(null);
                }
            });

        }
        else {
            pool.createDb(function(err) {
                if (err) {
                    done(err);
                }
                else {
                    getVersionsAndUpdate(pool, function(rbError) {
                        if (err) {
                            pool.dropDb(function() {
                                done(rbError);
                            });
                        }
                        else {
                            done(null);
                        }
                    });
                }
            });
        }
    });


};
