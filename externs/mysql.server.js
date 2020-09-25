var mysql = {};


/**
 * @typedef {?|{fieldCount:number,affectedRows:number,insertId:number,serverStatus:number,warningCount:number,message:string,changedRows:number}}
 */
mysql.Results;

/**
 * @typedef {?}
 */
mysql.Fields;


/**
 * @constructor
 */
mysql.Connection = function () {};
mysql.Connection.prototype.beginTransaction = function (callback) {};

/**
 * @param {function(?)} callback
 */
mysql.Connection.prototype.rollback = function (callback) {};

/**
 * @param {function(?)} callback
 */
mysql.Connection.prototype.commit = function (callback) {};


/**
 * @param {string} sql
 * @param {...(?|function(?, mysql.Results, mysql.Fields))} var_args
 */
mysql.Connection.prototype.query = function (sql, var_args) {};

/**
 * @constructor
 */
mysql.Pool = function () {};
/**
 * @param {function(?,!mysql.Connection)} callback
 */
mysql.Pool.prototype.getConnection = function (callback) {};

/**
 * @param {string} sql
 * @param {...(?|function(?, mysql.Results, mysql.Fields))} var_args
 */
mysql.Pool.prototype.query = function (sql, var_args) {};

/**
 * @return {!mysql.Pool}
 */
mysql.createPool = function (options) {};

/**
 * @param {string} id
 * @return {string}
 */
mysql.escapeId = function (id) {};
