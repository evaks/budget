var XlsxPopulate = {};

/**
 * @return {Promise}
 */
XlsxPopulate.fromBlankAsync = function () {};


/**
 * @constructor
 */
XlsxPopulate.Worksheet = function () {};


/**
 * @param {string} addr
 * @return {XlsxPopulate.Cell}
 */
XlsxPopulate.Worksheet.prototype.cell = function (addr) {};


/**
 * @param {string} addr
 * @return {XlsxPopulate.Range}
 */
XlsxPopulate.Worksheet.prototype.range = function (addr) {};

/**
 * @param {string} prop
 * @param {*=} opt_value
 * @return {XlsxPopulate.Worksheet}
 */
XlsxPopulate.Worksheet.prototype.pageMargins = function (prop, opt_value) {};


/**
 * @param {string} prop
 * @param {*=} opt_value
 * @return {XlsxPopulate.Worksheet}
 */
XlsxPopulate.Worksheet.prototype.pageSetup = function (prop, opt_value) {};

/**
 * @param {string} prop
 * @param {*=} opt_value
 * @return {XlsxPopulate.Worksheet}
 */
XlsxPopulate.Worksheet.prototype.printOptions = function (prop, opt_value) {};

/**
 * @constructor
 */
XlsxPopulate.Workbook = function () {};

/**
 * @param {string} name
 * @return {XlsxPopulate.Worksheet}
 */
XlsxPopulate.Worksheet.prototype.addSheet = function (name) {};


/**
 * @param {Object} properties
 * @return {Promise<Blob>}
 */
XlsxPopulate.Worksheet.prototype.outputAsync = function (properties) {};

/**
 * @constructor
 */
XlsxPopulate.RichText = function () {};

/**
 * @param {string} str
 * @param {Object=} opt_props
 */
XlsxPopulate.RichText.prototype.add = function (str, opt_props) {};

/**
 * @param {string} col
 * @return {XlsxPopulate.Column}
 */
XlsxPopulate.Workbook.prototype.column = function (col) {};



/**
 * @constructor
 */
XlsxPopulate.Cell = function () {};

/**
 * @param {string=} opt_formula
 * @param {(number|string)=} opt_value
 * @return {XlsxPopulate.Cell|string}
 */
XlsxPopulate.Cell.prototype.formula = function (opt_formula, opt_value) {};

/**
 * @param {Object} object
 * @return {XlsxPopulate.Cell|string}
 */
XlsxPopulate.Cell.prototype.dataValidation = function (object) {};


/**
 * @constructor
 */
XlsxPopulate.Range = function () {};


/**
 * @param {Object} object
 * @return {XlsxPopulate.Range}
 */
XlsxPopulate.Range.prototype.dataValidation = function (object) {};

/**
 * @param {boolean=} opt_merged
 * @return {XlsxPopulate.Range|boolean}
 */
XlsxPopulate.Range.prototype.merged = function (opt_merged) {};


/**
 * @constructor
 */
XlsxPopulate.Column = function () {};


/**
 * @param {number=} opt_width
 * @return {XlsxPopulate.Column|number}
 */
XlsxPopulate.Column.prototype.width = function (opt_width) {};

