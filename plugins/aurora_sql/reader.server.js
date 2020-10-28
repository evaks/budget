goog.provide('aurora.db.Reader');

goog.require('aurora.db.Pool');
goog.require('aurora.db.Schema');

/**
 * @interface
 * abstraction to allow to read objects from a database
 */

aurora.db.Reader = function() {};

/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {!Array<{col:!recoil.structs.table.ColumnKey,value:?}>} keys
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,Object)} callback
 */
aurora.db.Reader.prototype.readObjectByKey = function(context, table, keys, securityFilter, callback) {};



/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,number)} callback
 */
aurora.db.Reader.prototype.deleteObjects = function(context, table, query, securityFilter, callback) {};

/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,number)} callback
 */
aurora.db.Reader.prototype.deleteOneLevel = function(context, table, query, securityFilter, callback) {};

/**
 * @param {string} query
 * @param {function(?,(Array|!aurora.db.type.InsertDef),?)|!Object<string,?>} params (error, results, fields)
 * @param {function(?,(Array|!aurora.db.type.InsertDef),?)=} opt_callback not optional, but can be suplied in params argument
 */
aurora.db.Reader.prototype.query = function(query, params, opt_callback) {};


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
aurora.db.Reader.prototype.updateOneLevel = function(context, table, object, query, callback) {};


/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {!Array<{field: !recoil.structs.table.ColumnKey, value: ?}>} fields
 * @param {?recoil.db.Query} query
 * @param {?recoil.db.Query} securityFilter
 * @param {function(?,number)} callback
 */
aurora.db.Reader.prototype.updateObjects = function(context, table, fields, query, securityFilter, callback) {};

/**
 * @param {!Object} context
 * @param {!aurora.db.schema.TableType} table
 * @param {!Object} object
 * @param {function(?,?aurora.db.type.InsertDef)} callback
 */
aurora.db.Reader.prototype.insert = function(context, table, object, callback) {};


/**
 * @param {string} name
 * @param {function(?,?number)} callback
 */
aurora.db.Reader.prototype.sequence = function(name, callback) {};


/**
 * @param {function(!aurora.db.Reader,function(?,...))} callback first argument reader, second callback when done transaction
 * @param {function(?,...)} doneFunc
 */
aurora.db.Reader.prototype.transaction = function(callback, doneFunc) {};

/**
 * @param {string} exp
 * @return {?}
 */

aurora.db.Reader.prototype.expression = function(exp) {};

