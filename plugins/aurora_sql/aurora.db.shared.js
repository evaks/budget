goog.provide('aurora.db');
goog.provide('aurora.db.PrimaryKey');

goog.require('aurora.string');
goog.require('recoil.structs.table.ColumnKey');
goog.require('recoil.util');
goog.require('recoil.util.Sequence');

/**
 * @param {string} name
 * @return {!recoil.structs.table.ColumnKey}
 */
aurora.db.createId = function(name) {
    // on the server
    let seq = new recoil.util.Sequence();
    /**
     * @type {function():!aurora.db.PrimaryKey}
     */
    let defFunc = function() {
        return new aurora.db.PrimaryKey(null, seq.next());
    };
    return new recoil.structs.table.ColumnKey(name, aurora.db.comparePk, undefined, undefined, defFunc);
};

/**
 * @constructor
 * @param {?}  db the primary key on the database this can be null if created on the client
 * @param {?=} opt_mem the memory primary key this is used to compare if the database is not there
 *                     then uses databases key
 */
aurora.db.PrimaryKey = function(db, opt_mem) {
    this.db = aurora.db.PrimaryKey.toBigInt(db);
    this.mem = opt_mem === undefined ? this.db : aurora.db.PrimaryKey.toBigInt(opt_mem);
};

/**
 * @param {?} v
 * @return {?}
 */
aurora.db.PrimaryKey.toBigInt = function(v) {
    return v == null || typeof(v) === 'big' + 'int' ? v : BigInt(v);
};

/**
 * @param {?} other
 * @return {boolean}
 */
aurora.db.PrimaryKey.prototype.equals = function(other) {
    return other instanceof aurora.db.PrimaryKey && aurora.db.comparePk(this, other) === 0;
};

/**
 * @param {?} other
 * @return {number}
 */
aurora.db.PrimaryKey.prototype.compare = function(other) {
    return other instanceof aurora.db.PrimaryKey ? aurora.db.comparePk(this, other) : -1;
};
/**
 * @return {string}
 */
aurora.db.PrimaryKey.prototype.toString = function() {
    return JSON.stringify([this.mem, this.db]);
};

/**
 * compares two primary keys
 * @param {(!aurora.db.PrimaryKey|undefined)} x
 * @param {(!aurora.db.PrimaryKey|undefined)} y
 * @return {number}
 */
aurora.db.comparePk = function(x, y) {
    if (x === null && y === null) {
        return 0;
    }
    if (x === null) {
        return -1;
    }
    if (y === null) {
        return 1;
    }
    if (x.db === null && y.db === null) {
        return recoil.util.compare(x.mem, y.mem);
    }
    return recoil.util.compare(x.db, y.db);
};
