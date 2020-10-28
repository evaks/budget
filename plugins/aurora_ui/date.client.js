goog.provide('aurora.ui.coverters.LocaleDateConverter');


/**
 * this converter takes any string converter and handles null
 * values by converting them to an empty string
 *
 * @constructor
 * @implements {recoil.converters.StringConverter<string>}
 * @param {!recoil.converters.TypeConverter<?,string>=} opt_subconverter
 */

aurora.ui.coverters.LocaleDateConverter = function(opt_subconverter) {
};

/**
 * @param {string} val
 * @return {string}
 */
aurora.ui.coverters.LocaleDateConverter.prototype.convert = function(val) {
    if (val === null || val === undefined) {
        return '';
    }
    return moment(val).format('l LT');
};

/**
 * @param {string} val
 * @return {{error : recoil.ui.message.Message, value:?(string)}}
 */
aurora.ui.coverters.LocaleDateConverter.prototype.unconvert = function(val) {
    if (val === '') {
        return {error: null, value: null};
    }
    return {error: null, value: moment(val, 'l LT').unix()};
};

