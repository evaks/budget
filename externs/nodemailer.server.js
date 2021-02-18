var nodemailer  = {};

/**
 * @typedef {{messageId:?}}
 */
nodemailer.MessageInfo;

/**
 * @constructor
 */
nodemailer.Transport = function () {};

nodemailer.Transport.prototype.sendMail = function (options) {};

nodemailer.createTestAccount = function () {};
/**
 * @param {?} options
 * @return {nodemailer.Transport}
 */
nodemailer.createTransport = function (options) {};
nodemailer.getTestMessageUrl = function (info) {};
