goog.provide('budget.widgets.SignUp');


goog.require('aurora.db.schema.tables.base.user');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.net.XhrIo');
goog.require('goog.net.cookies');
goog.require('recoil.frp.logic');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');
goog.require('recoil.ui.widgets.CheckboxWidget');
goog.require('recoil.ui.widgets.ComboWidget');
goog.require('recoil.ui.widgets.InputWidget');
goog.require('recoil.ui.widgets.PasswordStrengthWidget');
goog.require('recoil.ui.widgets.PasswordWidget');
goog.require('recoil.ui.widgets.SelectorWidget');
goog.require('recoil.ui.widgets.TextAreaWidget');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number=} opt_userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.SignUp = function(scope, opt_userid) {
    this.scope_ = scope;
    let createClient =  opt_userid && opt_userid.createClient;
    let userid = opt_userid && opt_userid.createClient ? undefined : opt_userid;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;

    let login = cd('div');
    let loginButton = new recoil.ui.widgets.ButtonWidget(scope);

    let createWidget = function(widget, options, val) {
        let div = cd('div');
        let valueB = frp.createB(val);
        let opts = goog.object.clone(options);
        if (!opts.value) {
            opts.value = valueB;
        }

        widget.getComponent().render(div);
        widget.attachStruct(opts);

        return {
            cont: div,
            widget: widget,
            value: valueB
        };
    };
    let userT = aurora.db.schema.tables.base.user;
    let data = {id: 0};
    for (let k in userT.meta) {
        let col = userT.meta[k].key;
        let meta = userT.meta[col.getName()];
        if (meta.type === 'enum') {
            data[col.getName()] = null;
        }
        else if (meta.type === 'boolean') {
            data[col.getName()] = null;
        }
        else {
            data[col.getName()] = col.getDefault() == undefined ? '' : col.getDefault();
        }
    }
    let query = new recoil.db.Query();
    let table = /** @type {!recoil.structs.table.Table} */ (aurora.db.Helper.createTable(recoil.db.ChangeSet.Path.fromString(userT.info.path), [data]));

    let addMentor = function (tableB) {
        if (!createClient) {
            return tableB;
        }
        
        return frp.liftBI(function (table, context) {
            let res = table.createEmpty();
            table.forEachModify(function (row) {
                if (aurora.permissions.has('mentor')(context)) {
                    row.set(userT.cols.mentorid, context.userid);
                }
                res.addRow(row);
                
            });
            return res.freeze();
        }, function (tbl) {
            tableB.set(tbl);
        }, tableB, aurora.permissions.getContext(scope));
    };

    let tableB = userid === undefined ?
        addMentor(frp.createB(table)) : scope.getDb().get(userT.key, query.eq(userT.cols.id, userid));
    let tableWidget = function(col, options) {
        let div = cd('div', {class: 'goog-inline-block'});
        let keysB = frp.liftB(function(t) {
            let res = [];
            t.forEach(function(row, pks) {
                res = pks;
            });
            return res;
        }, tableB);

        let meta = table.getColumnMeta(col);
        let type = meta.type;
        let column = table.getMeta().typeFactories[type](col, '', meta);
        let cellWidgetFactory = column.getMeta(meta).cellWidgetFactory;
        let tableCellB = recoil.frp.table.TableCell.create(frp, tableB, keysB, col);

        let cellB = frp.liftBI(function(cell) {
            let m = {};
            goog.object.extend(m, meta, cell.getMeta(), options);
            return cell.setMeta(m);
        }, function(cell) {
            tableCellB.set(tableCellB.get().setValue(cell.getValue()));
        }, tableCellB);

        let widget = cellWidgetFactory(scope, cellB);
        let value = recoil.frp.table.TableCell.getValue(frp, cellB);
        widget.getComponent().render(div);
        return {
            cont: div,
            widget: widget,
            value: value
        };

    };

    let html = new recoil.ui.HtmlHelper(scope);

    let tick = cd('div', {class: 'signup-password-ok'});
    let cross = cd('div', {class: 'signup-password-not-ok'});
    let username = tableWidget(userT.cols.username, {immediate: true, displayLength: 20});
    let password = tableWidget(userT.cols.password, {immediate: true});
    let passwordStrength = createWidget(new recoil.ui.widgets.PasswordStrengthWidget(scope), {value: password.value}, '');
    let confirmPassword = createWidget(new recoil.ui.widgets.PasswordWidget(scope, false), {immediate: true}, '');
    confirmPassword.cont.className = 'goog-inline-block';
    let email = tableWidget(userT.cols.email, {immediate: true, displayLength: 25});
    let firstName = tableWidget(userT.cols.firstName, {displayLength: 15});
    let lastName = tableWidget(userT.cols.lastName, {displayLength: 15});
    let address = tableWidget(userT.cols.address, {});
    let phone = tableWidget(userT.cols.phone, {displayLength: 9, charValidator: function(c) {
        return c >= '0' && c <= '9';
    }});
    let gender = tableWidget(userT.cols.gender, {});
    let incomeSource = tableWidget(userT.cols.incomeSource, {});
    let housing = tableWidget(userT.cols.housing, {});
    let maritalStatus = tableWidget(userT.cols.maritalStatus, {});
    let newClient = tableWidget(userT.cols.newClient, {});
    let countryWidget = new recoil.ui.widgets.InputWidget(scope);
    let country = createWidget(new recoil.ui.widgets.ComboWidget(scope, countryWidget), {immediate: true, list: ['New Zealand']}, '');
    countryWidget.attachStruct({value: country.value});
    html.show(tick, recoil.frp.logic.equal(password.value, confirmPassword.value));
    html.show(cross, recoil.frp.logic.notEqual(password.value, confirmPassword.value));
    let busyB = frp.createB(false);
    let BWE = recoil.ui.BoolWithExplanation;

    let loginEnabledB = frp.liftB(function(busy, username, password, confirm) {
        if (busy) {
            return new BWE(false, undefined, mess.LOGGING_IN);
        }
        if (!username.trim()) {
            return new BWE(false, undefined, mess.MUST_SPECIFY.resolve({field: mess.USERNAME.toString()}));
        }
        if (!password) {
            return new BWE(false, undefined, mess.MUST_SPECIFY.resolve({field: mess.PASSWORD.toString()}));
        }
        if (!password) {
            return new BWE(false, undefined, mess.MUST_SPECIFY.resolve({field: mess.PASSWORD.toString()}));
        }

        if (password !== confirm) {
            return new BWE(false, undefined, aurora.messages.PASSWORDS_DO_NOT_MATCH);
        }

        return BWE.TRUE;
    }, busyB, username.value, password.value, confirmPassword.value);
    let message = cd('div', {class: 'budget-login-message'});

    let loginActionB = scope.getDb().get(aurora.db.schema.actions.base.account.register.key);
    let actionB = recoil.frp.struct.get('action', loginActionB);

    html.innerText(message, frp.liftB(function(action) {
        if (action && action.output) {
            if (action.output.error) {
                return '' + action.output.error;
            }
            else if (createClient) {
                console.log("action result", action);
                window.location = '/client?id=' + action.output.value;
            }
            else {
                // we don't want them going back to signin page
                window.location.replace('/account/login');
            }
        }
        return '';
    }, loginActionB));


    loginButton.attachStruct(recoil.frp.struct.extend(frp, loginActionB, {
        action: frp.liftBI(
            function(v) {return v;},
            function(v) {
                let res = goog.object.clone(v);
                let inputs = [];
                tableB.get().forEach(function(row) {
                    tableB.get().forEachColumn(function(col) {
                        let val = {};
                        val[col.getName()] = row.get(col);
                        inputs.push(val);
                    });

                });
                actionB.set(inputs);
            }, actionB, tableB),
        text: mess.SIGNUP,
        enabled: recoil.ui.BoolWithExplanation.and(frp, recoil.frp.struct.get('enabled', loginActionB) , loginEnabledB)
    }));


    if (userid === undefined) {
        loginButton.getComponent().render(login);
    }
    let fields = ['table', {class: 'budget-register'}];

    if (userid === undefined) {
        fields = fields.concat([
            cd('tr', {}, cd('th', {class: 'group-header', colspan: 4}, mess.REQUIRED.toString())),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.USERNAME.toString()), cd('td', {colspan: 3}, username.cont)),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.PASSWORD.toString()), cd('td', {colspan: 3}, password.cont)),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.CONFIRM_PASSWORD.toString()), cd('td', {colspan: 3}, confirmPassword.cont, tick, cross)),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.PASSWORD_STRENGTH.toString()), cd('td', {colspan: 3}, passwordStrength.cont))]);
    }
    fields = fields.concat([
        cd('tr', {class: 'first-item'}, cd('th', {class: 'group-header', colspan: 4}, mess.SUGGESTED.toString())),
        cd('tr', {}, cd('th', {class: 'field-name'}, aurora.messages.EMAIL_ADDRESS.toString()), cd('td', {colspan: 3}, email.cont)),
        cd('tr', {}, cd('th', {class: 'group-header', colspan: 4}, mess.OPTIONAL.toString())),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.NEW_CLIENT.toString()), cd('td', {colspan: 3}, newClient.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.FIRST_NAME.toString()), cd('td', {}, firstName.cont), cd('th', {class: 'field-name'}, mess.LAST_NAME.toString()), cd('td', {}, lastName.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.ADDRESS.toString()), cd('td', {colspan: 3}, address.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.PHONE.toString()), cd('td', {colspan: 3}, phone.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.GENDER.toString()), cd('td', {colspan: 3}, gender.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.INCOME_SOURCE.toString()), cd('td', {colspan: 3}, incomeSource.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.HOUSING.toString()), cd('td', {colspan: 3}, housing.cont)),

        cd('tr', {}, cd('th', {class: 'field-name'}, mess.MARITAL_STATUS.toString()), cd('td', {colspan: 3}, maritalStatus.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.ETHICITY.toString()), cd('td', {colspan: 3})),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.COUNTRY_OF_BIRTH.toString()), cd('td', {colspan: 3}, country.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.DATE_OF_BIRTH.toString()), cd('td', {colspan: 3})),
        cd('tr', {}, cd('td', {colspan: 3}, message), cd('td', {class: 'login-button'}, login))
    ]);

    let container = cd(
        'div', {},
        cd('div', {},
           cd.apply(null, fields))
    );
    let alreadyLoggedIn = cd('div', {}, 'You are already logged in');
    let loggedIn = goog.net.cookies.get('username');
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(opt_userid === undefined && loggedIn ? alreadyLoggedIn : container);
};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.SignUp.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.SignUp.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

