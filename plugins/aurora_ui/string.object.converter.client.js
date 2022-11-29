goog.provide('aurora.converters.ObjectStringConverter');
goog.require('recoil.converters.StringConverter');
goog.require('recoil.ui.message.Message');

/**
 * @constructor
 * @implements {recoil.converters.StringConverter<Object>}
 */

aurora.converters.ObjectStringConverter = function() {

};
/**
 * @param {Object} val
 * @return {string}
 */
aurora.converters.ObjectStringConverter.prototype.convert = function(val) {
    try {
        return JSON.stringify(val);
    }
    catch (e) {
        console.error('ObjectStringConverter Unable to stringify object');
        return e + '';
    }
};

/**
 * @param {string} val
 * @return {{error : recoil.ui.message.Message, value : Object}}
 */
aurora.converters.ObjectStringConverter.prototype.unconvert = function(val) {
    try {
        return {error: null, value: /** @type {Object} */ (JSON.parse(val))};
    }
    catch (e) {
        return {error: recoil.ui.message.toMessage(e + ''), value: null};
    }

};
