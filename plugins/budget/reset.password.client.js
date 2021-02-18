goog.provide('budget.widgets.DoResetPassword');
goog.provide('budget.widgets.ResetPassword');


goog.require('aurora.db.schema.tables.base.user');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('recoil.frp.logic');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');
goog.require('recoil.ui.widgets.InputWidget');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number=} opt_userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.ResetPassword = function(scope, opt_userid) {
    this.scope_ = scope;
    let createClient = opt_userid && opt_userid.createClient;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;

    let resetDiv = cd('div');
    let resetButton = new recoil.ui.widgets.ButtonWidget(scope);

    let html = new recoil.ui.HtmlHelper(scope);
    let emailWidget = new recoil.ui.widgets.InputWidget(scope);
    let emailB = frp.createB('');
    emailWidget.attachStruct({value: emailB, immediate: true});
    let emailDiv = cd('div');
    emailWidget.getComponent().render(emailDiv);
    let busyB = frp.createB(false);
    let BWE = recoil.ui.BoolWithExplanation;

    let message = cd('div', {class: 'budget-reset-message'});
    let errorDiv = cd('div', {class: 'budget-reset-message-error'});

    let resetActionB = scope.getDb().get(aurora.db.schema.actions.base.account.request_reset.key);
    let actionB = recoil.frp.struct.get('action', resetActionB);

    html.innerText(message, frp.liftB(function(action) {
        if (action && action.output) {
            if (action.output.error) {
                return '';
            }
            else {
                return 'Check your email to reset your password';
            }
        }
        return '';
    }, resetActionB));
    console.log('cd2');


    html.innerText(errorDiv, frp.liftB(function(action) {
        if (action && action.output) {
            if (action.output.error) {
                return action.output.error;
            }

        }
        return '';
    }, resetActionB));

    let validEmailB = frp.liftB(function(email) {
        if (!email || email.indexOf('@') === -1 || email.indexOf('@') > email.length - 2) {
            return new BWE(false, undefined, mess.INVALID_EMAIL);
        }

        return BWE.TRUE;
    }, emailB);

    resetButton.attachStruct(recoil.frp.struct.extend(frp, resetActionB, {
        action: frp.liftBI(
            function(v) {return v;},
            function(v) {
                let res = goog.object.clone(v);
                let inputs = [emailB.get()];
                actionB.set(inputs);
            }, actionB, emailB),
        text: aurora.messages.RESET_PASSWORD.toString(),
        enabled: recoil.ui.BoolWithExplanation.and(frp, recoil.frp.struct.get('enabled', resetActionB), validEmailB)
    }));


    resetButton.getComponent().render(resetDiv);


    let container =
        cd('div', {},
           cd('table', {},
              cd('tr', {}, cd('th', {class: 'field-name'}, aurora.messages.EMAIL_ADDRESS.toString()), cd('td', {}, emailDiv), cd('td', {}, resetDiv)),
             ), message, errorDiv);

    let alreadyLoggedIn = cd('div', {}, 'You are already logged in');
    let loggedIn = goog.net.cookies.get('username');
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(loggedIn ? alreadyLoggedIn : container);
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.ResetPassword.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.ResetPassword.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.DoResetPassword = function(scope) {
    this.scope_ = scope;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let idStr = budget.widgets.BudgetList.getSearchParams()['id'][0];

    let idParts = idStr.split('_');
    let id = parseInt(idParts[1], 10);
    let secret = idParts[0];

    let resetDiv = cd('div');
    let resetButton = new recoil.ui.widgets.ButtonWidget(scope);

    let html = new recoil.ui.HtmlHelper(scope);
    let passwordWidget = new recoil.ui.widgets.PasswordWidget(scope);
    let confirmWidget = new recoil.ui.widgets.PasswordWidget(scope);
    let passwordStrengthWidget = new recoil.ui.widgets.PasswordStrengthWidget(scope);
    let passwordB = frp.createB('');
    let confirmB = frp.createB('');
    passwordWidget.attachStruct({value: passwordB, immediate: true});
    confirmWidget.attachStruct({value: confirmB, immediate: true});
    passwordStrengthWidget.attachStruct({value: passwordB});

    let passwordDiv = cd('div');

    let confirmDiv = cd('div');
    let passwordStrengthDiv = cd('div');
    confirmWidget.getComponent().render(confirmDiv);
    passwordWidget.getComponent().render(passwordDiv);
    passwordStrengthWidget.getComponent().render(passwordStrengthDiv);
    let BWE = recoil.ui.BoolWithExplanation;

    let message = cd('div', {class: 'budget-reset-message'});
    let errorDiv = cd('div', {class: 'budget-reset-message-error'});

    let resetActionB = scope.getDb().get(aurora.db.schema.actions.base.account.do_reset.key);
    let actionB = recoil.frp.struct.get('action', resetActionB);

    html.innerText(errorDiv, frp.liftB(function(action) {
        if (action && action.output) {
            if (action.output.error) {
                return action.output.error;
            }
            else {
                window.location.replace('/account/login');
            }
        }
        return '';
    }, resetActionB));

    let validPasswordB = frp.liftB(function(password, confirm) {
        if (password.length == 0) {
            return new BWE(false, undefined, mess.MUST_SPECIFY.resolve({field: mess.PASSWORD.toString()}));
        }

        if (password !== confirm) {
            return new BWE(false, undefined, aurora.messages.PASSWORDS_DO_NOT_MATCH);
        }

        return BWE.TRUE;
    }, passwordB, confirmB);


    resetButton.attachStruct(recoil.frp.struct.extend(frp, resetActionB, {
        action: frp.liftBI(
            function(v) {return v;},
            function(v) {
                let res = goog.object.clone(v);
                let inputs = {
                    user: id,
                    password: passwordB.get(),
                    secret: secret
                };
                actionB.set(inputs);
            }, actionB, passwordB),
        text: aurora.messages.RESET_PASSWORD.toString(),
        enabled: recoil.ui.BoolWithExplanation.and(frp, recoil.frp.struct.get('enabled', resetActionB), validPasswordB)
    }));


    resetButton.getComponent().render(resetDiv);


    let container =
        cd('div', {},
           cd('table', {},
              cd('tr', {}, cd('th', {class: 'group-header', colspan: 4}, mess.RESET_PASSWORD.toString())),
              cd('tr', {}, cd('th', {class: 'field-name'}, mess.NEW_PASSWORD.toString()), cd('td', {}, passwordDiv)),
              cd('tr', {}, cd('th', {class: 'field-name'}, mess.CONFIRM_PASSWORD.toString()), cd('td', {}, confirmDiv)),
              cd('tr', {}, cd('th', {class: 'field-name'}, mess.PASSWORD_STRENGTH.toString()), cd('td', {colspan: 1}, passwordStrengthDiv)),
              cd('tr', {}, cd('th'), cd('td', {class: 'login-button'}, resetDiv))
             ), errorDiv);

    let alreadyLoggedIn = cd('div', {}, 'You are already logged in');
    let loggedIn = goog.net.cookies.get('username');
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(loggedIn ? alreadyLoggedIn : container);
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.DoResetPassword.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.DoResetPassword.prototype.flatten = recoil.frp.struct.NO_FLATTEN;



