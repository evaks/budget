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
    let createClient = opt_userid && opt_userid.createClient;
    let userid = opt_userid && opt_userid.createClient ? undefined : opt_userid;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;

    let login = cd('div');
    let loginButton = new recoil.ui.widgets.ButtonWidget(scope);
    let suggestUsernameButton = new recoil.ui.widgets.ButtonWidget(scope);

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
    let childrenT = userT.children;
    let data = {id: 0};
    for (let k in userT.meta) {
        let col = userT.meta[k].key;
        let meta = userT.meta[col.getName()];
        if (meta.type === 'enum') {
            data[col.getName()] = null;
        }
        else if (meta.type === 'number' && col.getDefault() == undefined) {

        }
        else if (meta.type === 'boolean') {
            data[col.getName()] = null;
        }
        else if (meta.isList) {
            data[col.getName()] = [];
        }
        else if (col.getDefault() != undefined) {

            data[col.getName()] = col.getDefault();
        }
        else if (meta.type === 'password') {
            data[col.getName()] = '';
        }
        else if (meta.hasOwnProperty('defaultVal')) {
            data[col.getName()] = meta.defaultVal;
        }
        else {
            data[col.getName()] = '';
        }
    }
    let query = new recoil.db.Query();
    let table = /** @type {!recoil.structs.table.Table} */ (aurora.db.Helper.createTable(recoil.db.ChangeSet.Path.fromString(userT.info.path), [data]));

    let addMentor = function(tableB) {
        if (!createClient) {
            return tableB;
        }

        return frp.liftBI(function(table, context) {
            let res = table.createEmpty();
            table.forEachModify(function(row) {
                if (aurora.permissions.has('mentor')(context)) {
                    row.set(userT.cols.mentorid, context.userid);
                }
                res.addRow(row);

            });
            return res.freeze();
        }, function(tbl) {
            console.log('setting table', tbl.toDebugObj());
            tableB.set(tbl);
        }, tableB, aurora.permissions.getContext(scope));
    };

    let tableB = userid === undefined ?
        addMentor(frp.createB(table).debug('table')) : scope.getDb().get(userT.key, query.eq(userT.cols.id, userid));


    let keysB = frp.liftB(function(t) {
        let res = [];
        t.forEach(function(row, pks) {
            res = pks;
        });
        return res;
    }, tableB);

    let createValue = function(col) {
        return recoil.frp.table.TableCell.getValue(frp, /** @type {!recoil.frp.Behaviour<?(!recoil.structs.table.TableCell)>} */(recoil.frp.table.TableCell.create(frp, tableB, keysB, col)));
    };
    let tableWidget = function(col, options) {
        let div = cd('div', {class: 'goog-inline-block'});


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

    let userSuggest = cd('div', {class: 'goog-inline-block'});
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

    let children = {
        widget: new recoil.ui.widgets.table.TableWidget(scope),
        div: cd('div', {class: 'goog-inline-block'})
    };
    let AGE = new recoil.structs.table.ColumnKey('age');
    let childrenB = budget.Client.instance.createSubTableB(tableB, frp.createB(/** @type {Array} */(null)), userT.cols.children);


    let todayB = budget.widgets.SignUp.getToday(frp);

    let formattedChildrenB = frp.liftBI(function(tbl, today) {
        let res = tbl.createEmpty([], [AGE]);
        res.addColumnMeta(AGE, {type: 'number', editable: false, displayLength: 3});
        tbl.forEachModify(function(row) {
            let bd = row.get(childrenT.cols.dateOfBirth);
            if (bd === null) {

                row.set(AGE, null);
            }
            else {
                let dob = budget.widgets.SignUp.toDate(bd);
                let yearDiff = today.getFullYear() - dob.getFullYear();

                if (today.getMonth() < dob.getMonth() || (today.getMonth() == dob.getMonth() && today.getDate() < dob.getDate())) {
                    yearDiff--;
                }


                row.set(AGE, yearDiff);
            }
            res.addRow(row);
        });
        var columns = new recoil.ui.widgets.TableMetaData();
        columns.add(userT.children.cols.name, budget.messages.NAME);
        columns.add(userT.children.cols.gender, budget.messages.GENDER);
        columns.add(userT.children.cols.dateOfBirth, budget.messages.DATE_OF_BIRTH);
        columns.add(AGE, budget.messages.AGE);

        return columns.applyMeta(res);
    }, function(tbl) {
        let res = childrenB.get().createEmpty();
        tbl.forEachModify(function(row) {
            if (row.getRowMeta().doAdd) {
                row.set(childrenT.cols.name, '');
                row.set(childrenT.cols.gender, null);
                row.set(childrenT.cols.dateOfBirth, null);
            }
            res.addRow(row);
        });
        childrenB.set(res.freeze());
        console.log('inv', tbl);

    }, childrenB, todayB);

    children.widget.attachStruct(aurora.widgets.TableWidget.createSizable(aurora.ui.ErrorWidget.createTable(scope, formattedChildrenB)));
    children.widget.getComponent().render(children.div);

    let gender = tableWidget(userT.cols.gender, {});
    let incomeSource = tableWidget(userT.cols.incomeSource, {});
    let housing = tableWidget(userT.cols.housing, {});
    let maritalStatus = tableWidget(userT.cols.maritalStatus, {});
    let dob = tableWidget(userT.cols.dateOfBirth, {});
    let newClient = tableWidget(userT.cols.newClient, {});
    let createCombo = function(col, list) {

        let widget = new recoil.ui.widgets.InputWidget(scope);
        let valueB = createValue(col);
        widget.attachStruct({value: valueB});
        return createWidget(new recoil.ui.widgets.ComboWidget(scope, widget), {
            immediate: true, list: list,
            value: valueB}, '');
    };

    let country = createCombo(userT.cols.countryOfBirth, budget.widgets.SignUp.COUNTRIES);
    let ethnicity = createCombo(userT.cols.ethnicity, ['Maori', 'Pacific Island', 'Asian', 'NZ European']);
    html.show(tick, recoil.frp.logic.equal(password.value, confirmPassword.value));
    html.show(cross, recoil.frp.logic.notEqual(password.value, confirmPassword.value));
    let busyB = frp.createB(false);
    let BWE = recoil.ui.BoolWithExplanation;

    let loginEnabledB = frp.liftB(function(busy, username, password, confirm) {
        if (busy) {
            return new BWE(false, undefined, mess.LOGGING_IN);
        }
        if (!username.trim() && !createClient) {
            return new BWE(false, undefined, mess.MUST_SPECIFY.resolve({field: mess.USERNAME.toString()}));
        }
        if (!password && !createClient) {
            return new BWE(false, undefined, mess.MUST_SPECIFY.resolve({field: mess.PASSWORD.toString()}));
        }

        if (password !== confirm) {
            return new BWE(false, undefined, aurora.messages.PASSWORDS_DO_NOT_MATCH);
        }

        return BWE.TRUE;
    }, busyB, username.value, password.value, confirmPassword.value);
    let message = cd('div', {class: 'budget-login-message'});

    let loginActionB = scope.getDb().get(aurora.db.schema.actions.base.account.register.key);
    let suggestActionB = scope.getDb().get(aurora.db.schema.actions.base.account.suggestUsername.key);
    let checkActionB = scope.getDb().get(aurora.db.schema.actions.base.account.checkUsername.key);
    let actionB = recoil.frp.struct.get('action', loginActionB);

    html.innerText(message, frp.liftB(function(action) {
        if (action && action.output) {
            if (action.output.error) {
                return '' + action.output.error;
            }
            else if (createClient) {
                console.log('action result', action);
                window.location = '/client?id=' + action.output.value;
            }
            else {
                // we don't want them going back to signin page
                window.location.replace('/account/login');
            }
        }
        return '';
    }, loginActionB));

    suggestUsernameButton.attachStruct(recoil.frp.struct.extend(frp, loginActionB, {
        action: frp.liftBI(
            function(v) {
                if (v.output && v.output.value) {
                    let res = tableB.get().createEmpty();
                    tableB.get().forEachModify(function(row) {
                        console.log('action value', v, row);
                        row.set(userT.cols.username, v.output.value);
                        res.addRow(row);
                    });

                    let newOutput = goog.object.clone(v);
                    newOutput.output = null;
                    suggestActionB.set(newOutput);

                    tableB.set(res.freeze());
                }
                return v.action;
            },
            function(v) {
                let res = goog.object.clone(suggestActionB.get());
                let inputs = [];
                tableB.get().forEach(function(row) {
                    tableB.get().forEachColumn(function(col) {
                        let val = {};
                        val[col.getName()] = row.get(col);
                        inputs.push(val);
                    });

                });
                res.action = inputs;

                suggestActionB.set(res);
            }, suggestActionB, tableB),
        text: 'Suggest'
    }));

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
    suggestUsernameButton.getComponent().render(userSuggest);
    let fields = ['table', {class: 'budget-register goog-inline-block'}];

    let addLoginFields = function() {
        fields = fields.concat([
            cd('tr', {}, cd('th', {class: 'group-header', colspan: 4}, newClient ? mess.REQUIRED_FOR_CLIENT_LOGIN.toString() : mess.REQUIRED.toString())),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.USERNAME.toString()), cd('td', {colspan: 3}, username.cont, userSuggest)),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.PASSWORD.toString()), cd('td', {colspan: 3}, password.cont)),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.CONFIRM_PASSWORD.toString()), cd('td', {colspan: 3}, confirmPassword.cont, tick, cross)),
            cd('tr', {}, cd('th', {class: 'field-name'}, mess.PASSWORD_STRENGTH.toString()), cd('td', {colspan: 3}, passwordStrength.cont))]);
    };
    if (userid === undefined && !createClient) {
        addLoginFields();

    }

    fields = fields.concat([
        cd('tr', {class: 'first-item'}, cd('th', {class: 'group-header', colspan: 4}, mess.SUGGESTED.toString())),
        cd('tr', {}, cd('th', {class: 'field-name'}, aurora.messages.EMAIL_ADDRESS.toString()), cd('td', {colspan: 4}, email.cont)),
        cd('tr', {}, cd('th', {class: 'group-header', colspan: 4}, mess.OPTIONAL.toString())),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.NEW_CLIENT.toString()), cd('td', {colspan: 3}, newClient.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.FIRST_NAME.toString()), cd('td', {}, firstName.cont), cd('th', {class: 'field-name'}, mess.LAST_NAME.toString()), cd('td', {}, lastName.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.ADDRESS.toString()), cd('td', {colspan: 3}, address.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.PHONE.toString()), cd('td', {colspan: 3}, phone.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.GENDER.toString()), cd('td', {colspan: 3}, gender.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.INCOME_SOURCE.toString()), cd('td', {colspan: 3}, incomeSource.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.HOUSING.toString()), cd('td', {colspan: 3}, housing.cont)),

        cd('tr', {}, cd('th', {class: 'field-name'}, mess.MARITAL_STATUS.toString()), cd('td', {colspan: 3}, maritalStatus.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.ETHICITY.toString()), cd('td', {colspan: 3}, ethnicity.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.COUNTRY_OF_BIRTH.toString()), cd('td', {colspan: 3}, country.cont)),
        cd('tr', {}, cd('th', {class: 'field-name'}, mess.DATE_OF_BIRTH.toString()), cd('td', {colspan: 3}, dob.cont)),
        cd('tr', {}, cd('th', {class: 'group-header', colspan: 4}, mess.CHILDREN.toString())),
        cd('tr', {}, cd('td', {colspan: 4}, children.div))
    ]);
    if (userid === undefined && createClient) {
        addLoginFields();

    }

    fields.push(cd('tr', {}, cd('td', {colspan: 3}, message), cd('td', {class: 'login-button'}, login)));

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
 * @final
 */
budget.widgets.SignUp.COUNTRIES = [
    'Afghanistan', 'Åland Islands', 'Albania', 'Algeria', 'American Samoa', 'AndorrA', 'Angola', 'Anguilla', 'Antarctica', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Aruba', 'Australia', 'Austria',
    'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bermuda', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Bouvet Island', 'Brazil',
    'British Indian Ocean Territory', 'Brunei Darussalam', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Cayman Islands', 'Central African Republic', 'Chad', 'Chile',
    'China', 'Christmas Island', 'Cocos (Keeling) Islands', 'Colombia', 'Comoros', 'Congo', 'Congo, The Democratic Republic of the', 'Cook Islands', 'Costa Rica', 'Cote D\'Ivoire', 'Croatia', 'Cuba', 'Cyprus',
    'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Ethiopia', 'Falkland Islands (Malvinas)',
    'Faroe Islands', 'Fiji', 'Finland', 'France', 'French Guiana', 'French Polynesia', 'French Southern Territories', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Gibraltar', 'Greece', 'Greenland',
    'Grenada', 'Guadeloupe', 'Guam', 'Guatemala', 'Guernsey', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Heard Island and Mcdonald Islands', 'Holy See (Vatican City State)', 'Honduras', 'Hong Kong',
    'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Isle of Man', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jersey', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
    'Korea, North', 'Korea, South', 'Kuwait', 'Kyrgyzstan', 'Lao People\'S Democratic Republic', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libyan Arab Jamahiriya',
    'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macao', 'Macedonia', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Martinique', 'Mauritania', 'Mauritius', 'Mayotte',
    'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montserrat', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'Netherlands Antilles', 'New Caledonia',
    'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'Niue', 'Norfolk Island', 'Northern Mariana Islands', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestinian Territory', 'Panama', 'Papua New Guinea',
    'Paraguay', 'Peru', 'Philippines', 'Pitcairn', 'Poland', 'Portugal', 'Puerto Rico', 'Qatar', 'Reunion', 'Romania', 'Russian Federation', 'RWANDA', 'Saint Helena', 'Saint Kitts and Nevis', 'Saint Lucia',
    'Saint Pierre and Miquelon', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia and Montenegro', 'Seychelles', 'Sierra Leone',
    'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Georgia and the South Sandwich Islands', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Svalbard and Jan Mayen',
    'Swaziland', 'Sweden', 'Switzerland', 'Syrian Arab Republic', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tokelau', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
    'Turkey', 'Turkmenistan', 'Turks and Caicos Islands', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'United States Minor Outlying Islands', 'Uruguay',
    'Uzbekistan', 'Vanuatu', 'Venezuela', 'Viet Nam', 'Virgin Islands, British', 'Virgin Islands, U.S.', 'Wallis and Futuna', 'Western Sahara', 'Yemen', 'Zambia', 'Zimbabwe'];

/**
 * converts a date in yyyymmdd format to a javascript date
 * @param {number} d
 * @return {!Date}
 */
budget.widgets.SignUp.toDate = function(d) {
    return new Date(Math.round(d / 10000), Math.round(d / 100) % 100 - 1, d % 100);
};

/**
 * return behaviour has the current date in millisconds
 * @param {!recoil.frp.Frp} frp
 * @return {!recoil.frp.Behaviour<!Date>} current date updates every day
 */
budget.widgets.SignUp.getToday = function(frp) {
    let mkDate = function(d) {
        return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    };
    let resB = frp.createB(new Date(0));
    let doit = function() {
        let now = new Date();
        let today = mkDate(now);
        let tomorrow = budget.widgets.SignUp.toDate(today);
        tomorrow.setHours(24);
        frp.accessTrans(function() {
            resB.set(budget.widgets.SignUp.toDate(today));
        });

        setTimeout(doit, tomorrow.getTime() - now.getTime());
    };
    doit();
    return resB;

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

