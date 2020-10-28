goog.provide('aurora.db.Pool');
goog.provide('aurora.db.type');

goog.require('recoil.db.Escaper');

/**
 * @typedef {{unique:(boolean|undefined),columns: Array<string>}}
 */
aurora.db.type.IndexDef;

/**
 * @typedef {{temp:(boolean|undefined),exists:(boolean|undefined)}}
 */
aurora.db.type.TableOptions;

/**
 * @enum
 */
aurora.db.type.types = {
    bigint: 0,
    boolean: 1,
    varchar: 2,
    password: 3,
    int: 4, // 32 bit integer
    json: 5,

};
/**
 * @typedef {{insertId:number}}
 */
aurora.db.type.InsertDef;

/**
 * @typedef {!Object<string,{type:aurora.db.type.types,length:(number|undefined),default:(?|undefined)}>}
 */
aurora.db.type.ColumnDef;

/**
 * @interface
 * @extends {recoil.db.Escaper}
 */

aurora.db.Pool = function() {};

/**
 * @param {string} name
 * @param {function(?,?number)} callback
 */

aurora.db.Pool.prototype.nextSequence = function(name, callback) {};

/**
 * @param {function(?,...)} func
 * @param {...?} var_args
 * @return {function(!aurora.db.Pool,function(?))}
 */
aurora.db.Pool.mkSeqFunc = function(func, var_args) {
    let args = [];
    for (let i = 1; i < arguments.length - 1; i++) {
        args.push(arguments[i]);
    }
    let cb = arguments[arguments.length - 1];

    return function(con, outerCb) {
        let myArgs = [...args];
        myArgs.push(function() {
            let args = [];
            for (let i = 0; i < arguments.length; i++) {
                args.push(arguments[i]);
            }
            let error = args[0];
            try {
                cb.apply(this, args);
            }
            catch (e) {
                if (!error) {
                    error = e;
                }
            }
            outerCb(error);

        });

        func.apply(con, myArgs);
    };
};

/**
 * @param {string} query
 * @param {function(?,(Array|!aurora.db.type.InsertDef),?)|!Object<string,?>} params (error, results, fields)
 * @param {function(?,(Array|aurora.db.type.InsertDef),?)=} opt_callback not optional, but can be suplied in params argument
 */
aurora.db.Pool.prototype.query = function(query, params, opt_callback) {};


/**
 * @param {string} table
 * @param {!Object<string,?>} values
 * @param {function(?,?aurora.db.type.InsertDef)} callback (error, results)
 */
aurora.db.Pool.prototype.insert = function(table, values, callback) {};


/**
 * @param {string} table
 * @param {!Object<string,?>} values
 * @param {function(?,?)} callback (error, results)
 * @return {function(!aurora.db.Pool,function(?))}
 */
aurora.db.Pool.prototype.insertSeq = function(table, values, callback) {};


/**
 * @param {string} select
 * @param {recoil.db.QueryOptions|undefined} options
 * @return {string}
 */

aurora.db.Pool.prototype.addOptions = function(select, options) {};

/**
 * hashes the passwords first before
 * @param {!aurora.db.Pool} pool
 * @param {string} table
 * @param {!Object<string,?>} passwords
 * @param {!Object<string,?>} fields
 * @param {function(?,?)} callback (error, results)
 */

aurora.db.Pool.passwordInsert = function(pool, table, passwords, fields, callback) {
    let values = Object.assign({}, fields);
    let count = 0;
    let seenPassword = false;
    for (let field in passwords) {
        seenPassword = true;
        (function(field) {
            count++;
            aurora.db.Pool.hashPassword(passwords[field], function(err, hash) {
                if (err) {
                    count = 0;
                    callback(err, null);
                    return;
                }
                values[field] = hash;
                count--;
                if (count === 0) {
                    pool.insert(table, values, callback);
                }
            });
        })(field);
    }
    // deal with no passwords given
    if (!seenPassword) {
        pool.insert(table, values, callback);
    }
};

/**
 * hashes the passwords first before inserting
 * @param {string} table
 * @param {!Object<string,?>} passwords
 * @param {!Object<string,?>} fields
 * @param {function(?,?)} callback (error, results)
 * @return {function(!aurora.db.Pool,function(?))}
 */

aurora.db.Pool.passwordInsertSeq = function(table, passwords, fields, callback) {
    return aurora.db.Pool.mkSeqFunc(aurora.db.Pool.passwordInsert, table, passwords, fields, callback);
};
/**
 * @param {string} table
 * @param {!Object<string,?>} keys
 * @param {function(?,number)} callback first arg error second number of row effected
 */
aurora.db.Pool.prototype.delete = function(table, keys, callback) {};


/**
 * @param {string} table
 * @param {!Object<string,?>} keys
 * @param {function(?,number)} callback first arg error second number of row effected
 * @return {function(!aurora.db.Pool,function(?))}
 */
aurora.db.Pool.prototype.deleteSeq = function(table, keys, callback) {};

/**
 * @param {string} table
 * @param {!Object<string,?>} keys
 * @param {!Object<string,?>} values
 * @param {function(?)} callback (error)
 */
aurora.db.Pool.prototype.update = function(table, keys, values, callback) {};



/**
 * @param {string} table
 * @param {!Object<string,aurora.db.type.ColumnDef>} fields
 * @param {!Array<aurora.db.type.IndexDef>} indexes
 * @param {!aurora.db.type.TableOptions} options
 * @param {function(?)} callback (error)
 */

aurora.db.Pool.prototype.createTable = function(table, fields, indexes, options, callback) {};

/**
 * @param {string} table
 * @param {!Object<string,?>} fields
 * @param {!Array<aurora.db.type.IndexDef>} indexes
 * @param {!aurora.db.type.TableOptions} options
 * @param {function(?)} callback (error)
 * @return {function(!aurora.db.Pool,function(?))}
 */

aurora.db.Pool.prototype.createTableSeq = function(table, fields, indexes, options, callback) {};


/**
 * @param {string} fromTable
 * @param {!Array<string>} fromFields
 * @param {string} toTable
 * @param {!Array<string>} toFields
 * @param {function(?)} callback (error)
 */
aurora.db.Pool.prototype.createForeignKey = function(fromTable, fromFields, toTable, toFields, callback) {};

/**
 * @param {string} fromTable
 * @param {!Array<string>} fromFields
 * @param {string} toTable
 * @param {!Array<string>} toFields
 * @param {function(?)} callback (error)
 * @return {function(!aurora.db.Pool,function(?))}
 */
aurora.db.Pool.prototype.createForeignKeySeq = function(fromTable, fromFields, toTable, toFields, callback) {};



/**
 * similar to transaction but does not start a transaction
 * @param {!Array<function(!aurora.db.mysql.Pool,function(!aurora.db.Pool,?))>} actions a sequence of actions to perfom, if an error occurs
 * and following actions are stopped and the transaction is rolled back
 * @param {function(?)} callback
 */
aurora.db.Pool.prototype.sequence = function(actions, callback) {};

/**
 * starts and ends the transaction, calls doneFunc is called, the callback inside callback must be called when done
 * @param {function(!aurora.db.mysql.Pool,function(?,...))} callback no error here we go directly to doneFuncif we have an error opening the pool
 * @param {function(?,...)} doneFunc first arg is error
 */
aurora.db.Pool.prototype.transaction = function(callback, doneFunc) {};

/**
 * @const
 * @type {Object<number,{alg:string,length:number,salt:number,itr:number}>}
 */
aurora.db.Pool.passwordVersions = {
    0: {alg: 'sha512', length: 64, salt: 32, itr: 10}
};

/**
 * returns the size needed to store the password in the database
 *
 * @return {number}
 */
aurora.db.Pool.passwordColSize = function() {
    let size = 2;
    for (let k in aurora.db.Pool.passwordVersions) {
        let info = aurora.db.Pool.passwordVersions[Number.parseInt(k, 10)];
        size = Math.max(size, 2 + info.length + info.salt);
    }
    return size;
};

/**
 * hashes a password and returns a buffer of length
 * note the first 34 bytes of the buffer is the salt and the version
 *
 * @param {string} password
 * @param {function(?, buffer.Buffer)} callback to store in the database, includes salt
 */
aurora.db.Pool.hashPassword = function(password, callback) {
    const crypto = require('crypto');
    const buffer = require('buffer');
    let version = 0;
    for (let k in aurora.db.Pool.passwordVersions) {
        version = Math.max(Number.parseInt(k, 10), version);
    }
    const algInfo = aurora.db.Pool.passwordVersions[version];
    let plen = algInfo.length;
    let salt = crypto.randomBytes(algInfo.salt);
    crypto.pbkdf2(password, salt, algInfo.itr, plen, algInfo.alg, function(err, hash) {
        if (err) {
            callback(err, null);
        }
        const versionBuff = buffer.Buffer.alloc(2);
        versionBuff.writeUInt16BE(version, 0);
        callback(null, buffer.Buffer.concat([versionBuff, salt, hash]));
    });
};
/**
 * @param {string} password
 * @return {Promise}
 */
aurora.db.Pool.hashPasswordPromise = function(password) {
    return new Promise(function(resolve, reject) {
        aurora.db.Pool.hashPassword(password, function(err, pword) {
            if (err) {
                reject(err);
            }
            else {
                resolve(pword);
            }
        });
    });
};

/**
 * @param {string} password
 * @param {buffer.Buffer} hash the whole hash read from the database should include version an salt
 * @param {function(boolean)} callback true if password matches
 */
aurora.db.Pool.checkPassword = function(password, hash, callback) {
    const crypto = require('crypto');
    let version = hash.readUInt16BE(0);
    const algInfo = aurora.db.Pool.passwordVersions[version];
    if (algInfo == undefined) {
        callback(false);
        return;
    }
    let plen = hash.length - algInfo.salt - 2;
    crypto.pbkdf2(password, hash.slice(2, algInfo.salt + 2), algInfo.itr, plen, algInfo.alg, function(err, phash) {
        if (err) {
            callback(false);
        }
        else {
            callback(hash.slice(algInfo.salt + 2).equals(phash));
        }
    });

};


/**
 * @param {string} str
 * @return {string}
 */
aurora.db.Pool.prototype.escapeId = function(str) {};

/**
 * @param {?} str
 * @return {string}
 */
aurora.db.Pool.prototype.escape = function(str) {};

/**
 * @final
 * @private
 * @type {!Object<string,!aurora.db.Pool>}
 */
aurora.db.Pool.pools_ = {};

/**
 * @param {string} name
 * @return {!aurora.db.Pool}
 */
aurora.db.Pool.get = function(name) {
    return aurora.db.Pool.pools_[name];
};


/**
 * @return {!aurora.db.Pool}
 */
aurora.db.Pool.getDefault = function() {
    return aurora.db.Pool.pools_[''];
};

/**
 * @param {?string} name
 * @param {!aurora.db.Pool} pool
 */
aurora.db.Pool.addPool = function(name, pool) {
    aurora.db.Pool.pools_[name || ''] = pool;
};


/**
 * @param {?} str
 * @return {string}
 */
aurora.db.Pool.prototype.toJson = function(str) {};


/**
 * @param {?} str
 * @return {?}
 */
aurora.db.Pool.prototype.fromJson = function(str) {};



/**
 * @param {string} exp
 * @return {?}
 */

aurora.db.Pool.prototype.expression = function(exp) {};


/**
 * backs up the database
 * @param {function(?, ?string)} cb
 */
aurora.db.Pool.prototype.backup = function(cb) {};
