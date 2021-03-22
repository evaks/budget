function BigInt(s) {};

/**
 * @constructor
 */
function ResizeObserverEntry() {}

/**
 * @type {?}
 */
ResizeObserverEntry.prototype.contentRect = {};


/**
 * @constructor
 * @param {function(Array<ResizeObserverEntry>,ResizeObserver)} s
 */
function ResizeObserver(s) {};

/**
 * @param {Element} el
 */
ResizeObserver.prototype.observe = function (el) {};

/**
 * @param {Element} el
 */
ResizeObserver.prototype.unobserve = function (el) {};

/**
 * 
 */
ResizeObserver.prototype.disconnect = function () {};
