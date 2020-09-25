goog.provide('budget.messages');

goog.require('recoil.ui.message');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.USERNAME = recoil.ui.message.getParamMsg('Username');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.PASSWORD = recoil.ui.message.getParamMsg('Password');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.LOGIN = recoil.ui.message.getParamMsg('Login');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.SIGNUP = recoil.ui.message.getParamMsg('Signup');

/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.FORGOT_PASSWORD = recoil.ui.message.getParamMsg('Forgot Password');

/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.REMEMBER_ME = recoil.ui.message.getParamMsg('Remember Me');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.LOGGING_IN = recoil.ui.message.getParamMsg('Logging In...');


/**
 * @type {!recoil.ui.message.Message}
 * @final
 */
budget.messages.MUST_SPECIFY = recoil.ui.message.getParamMsg('You must specify the ', ['field']);
