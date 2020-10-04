goog.provide('aurora.messages');

goog.require('recoil.ui.message');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
aurora.messages.GROUPS = recoil.ui.message.getParamMsg('Groups');

/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
aurora.messages.CHECKING_USER = recoil.ui.message.getParamMsg('Checking User Name');

/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
aurora.messages.DUPLICATE_USER_NAME = recoil.ui.message.getParamMsg('Duplicate User Name');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
aurora.messages.USERNAME_MUST_NOT_BE_BLANK = recoil.ui.message.getParamMsg('Username must not be blank');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
aurora.messages.PASSWORD_MUST_NOT_BE_BLANK = recoil.ui.message.getParamMsg('Password must not be blank');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
aurora.messages.PASSWORDS_DO_NOT_MATCH = recoil.ui.message.getParamMsg('Passwords do not match');
