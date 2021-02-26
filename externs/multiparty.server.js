var multiparty = {};

/**
 * @constructor
 */
multiparty.Form = function () {};

/**
 * @param {string} evt
 * @param {function(multiparty.Part)} cb
 */
multiparty.Form.prototype.on = function (evt, cb) {};

/**
 * @constructor
 */
multiparty.Part = function () {};

multiparty.Part.prototype.filename = {};

multiparty.Part.prototype.resume = function () {}; 


/**
 * @param {string} evt
 * @param {function(?)} cb
 */
multiparty.Part.prototype.on = function (evt, cb) {};
