/**
 * @constructor
 */
var Element = function () {};

Element.prototype.firstChild = {};
Element.prototype.nodeValue = {};
/**
 * @interface
 */
var NoResolvedType = function () {};

/**
 * @param {?=} opt_val
 * @return {?}
 */
var BigInt = function (opt_val) {};

/**
 * @interface
 * @extends {NoResolvedType}
 */
var HTMLElement = function () {};

HTMLElement.prototype.appendChild = function (c) {};


/**
 * @constructor
 * @implements {HTMLElement}
 * @implements {NoResolvedType}
 */var HTMLDocument = function () {};

/**
 * @type {HTMLElement}
 */
HTMLDocument.prototype.head;

HTMLDocument.prototype.nodeType;

HTMLDocument.prototype.readyState = {};

HTMLDocument.prototype.createElement = function (t) {};

/**
 * @type {?}
 */
var document;
var atob;


