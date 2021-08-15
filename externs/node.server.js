/**
 * @constructor
 */
var Buffer = function (arg) {};

/**
 * @param {number} size
 * @return {Buffer}
 */
Buffer.alloc = function (size) {};

/**
 * @param {buffer.Buffer} targetBuffer
 * @param {number=} targetStart
 * @param {number=} sourceStart
 * @param {number=} sourceEnd
 * @return {buffer.Buffer}
 */
Buffer.prototype.copy = function(targetBuffer, targetStart, sourceStart, sourceEnd) {};




var ConfdCursor = function () {};
ConfdCursor.prototype.getNext = function (cb) {};
/**
 * @constructor
 */
var AsyncQueue = function () {};
AsyncQueue.prototype.push = function (cb) {};
AsyncQueue.prototype.waterfall = function (list, cb) {};
AsyncQueue.prototype.eachSeries = function (list, cb, done) {};
AsyncQueue.prototype.series = function (list, cb, done) {};
AsyncQueue.prototype.each = function (list, cb, done) {};
AsyncQueue.queue = function (cb) {};


var LibConfd = function () {};
LibConfd.prototype.readStream = function (ip, port, streamid, x, cb) {};
LibConfd.prototype.initLibrary = function (int, traceLevel) {};
LibConfd.prototype.openCdbSubscriber = function (cb) {};

/**
 * @constructor
 */
LibConfd.CdbConnection = function () {};

LibConfd.CdbConnection.prototype.setListener = function (cb) {};

/**
 * @constructor
 */
LibConfd.MaapiConnection = function () {};

LibConfd.MaapiConnection.prototype.setDelayedWhen = function (tid, val, cb) {};
LibConfd.MaapiConnection.prototype.getRollbackList = function (cb) {};
LibConfd.MaapiConnection.prototype.finishTrans = function (tid, cb) {};
LibConfd.MaapiConnection.prototype.loadSchema = function (cb) {};
/**
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.getObjectByTemplate = function (var_args) {};

/**
 * @typedef {{errcode:string}}
 */
LibConfd.Error;

/**
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.setLeafAsString = function (var_args) {};
/**
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.setLeaf = function (var_args) {};


/**
 * @param {*} tid
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.move = function (tid, var_args) {};


/**
 * @param {*} tid
 * @param {Array} keys
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.moveAfter = function (tid, keys, var_args) {};


/**
 * @param {*} tid
 * @param {Array} keys
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.moveBefore = function (tid, keys, var_args) {};

/**
 * @param {*} tid
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.moveFirst = function (tid, var_args) {};

/**
 * @param {*} tid
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.moveLast = function (tid, var_args) {};



/**
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.newCursor = function (var_args) {};


/**
 * @typedef {{path:Array,newval:?,action:string}}
 */
LibConfd.Change;


/**
 * @typedef {{value:?,type:string}}
 */
LibConfd.Value;

/**
 * @typedef {{tag:!string,value:?}}
 */
LibConfd.ActionParam;

/**
 * @param {string} tid
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.getLeaf = function (tid, var_args) {};

LibConfd.MaapiConnection.prototype.startUserSession = function (user, system, x, ip, port, protocol, cb) {};
LibConfd.MaapiConnection.prototype.copyTransChanges = function (toId, fromId, cb) {};
LibConfd.MaapiConnection.prototype.unlockDB = function (name, cb) {};
LibConfd.MaapiConnection.prototype.candidateCommit = function (cb) {};
LibConfd.MaapiConnection.prototype.candidateAbort = function (cb) {};
LibConfd.MaapiConnection.prototype.rollback = function (tid, id, cb) {};
LibConfd.MaapiConnection.prototype.getRollback = function (id, cb) {};
LibConfd.MaapiConnection.prototype.startTransaction = function (db, perm, cb) {};
LibConfd.MaapiConnection.prototype.getMySessionId = function (cb) {};
LibConfd.MaapiConnection.prototype.loadConfig = function (tid, flags, path, cb) {};
LibConfd.MaapiConnection.prototype.saveConfig = function (tid, flags, path, cb) {};
LibConfd.MaapiConnection.prototype.hasTransactionChanges = function (tid, cb) {};
LibConfd.MaapiConnection.prototype.authenticate = function (username, password, app, srcAddr, srcPort, protocol, cb) {};
LibConfd.MaapiConnection.prototype.connected = {};
/**
 * @param {number} tid
 * @param {function(?, Array<!LibConfd.Change>)} cb
 */
LibConfd.MaapiConnection.prototype.getTransactionChanges = function (tid, cb) {};
                                         
/**
 * @param {?string} tid
 * @param {...?} var_args
 */
LibConfd.MaapiConnection.prototype.requestAction = function (tid, var_args) {};




/**
 * @constructor
 */
LibConfd.EventConnection = function () {};

/**
 * @param {string} host
 * @param {number} port
 * @param {Array} type
 * @param {function (?, {usid:number})} callback
 */

LibConfd.EventConnection.prototype.connect = function (host, port, type, callback) {};

/**
 * @constructor
 * @param {?} v
 */
var BigDecimal = function (v) {};

/**
 * @param {!number}  scale
 * @param {?=} round
 * @return {!BigDecimal}
 */
BigDecimal.prototype.setScale = function (scale, round) {};
BigDecimal.prototype.floatValue = function () {};

/**
 * @param {!BigDecimal}  other
 * @return {!number}
 */
BigDecimal.prototype.compareTo = function (other) {};

/**
 * @return {!number}
 */
BigDecimal.prototype.doubleValue = function () {};

/**
 * @param {!BigDecimal} v
 * @return {!BigDecimal}
 */
BigDecimal.prototype.subtract = function (v) {};

/**
 * @param {!BigDecimal} v
 * @return {!BigDecimal}
 */
BigDecimal.prototype.add = function (v) {};

/**
 * @param {!number} p
 * @return {!BigDecimal}
 */
BigDecimal.prototype.pow = function (p) {};

/**
 * @return {!number}
 */
BigDecimal.prototype.intValue = function () {};
/**
 * @param {!number} scale
 * @return {!BigDecimal}
 */
BigDecimal.prototype.scaleByPowerOfTen = function (scale) {};
/**
 * @return {!BigDecimal}
 */
BigDecimal.prototype.stripTrailingZeros = function () {};

BigDecimal.ZERO = function () {};
BigDecimal.ROUND_DOWN = {};
BigDecimal.ROUND_HALF_DOWN = {};
BigDecimal.ROUND_HALF_UP = {};


String.prototype.matchAll = function (regExp) {};
