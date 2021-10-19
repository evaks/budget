goog.provide('aurora.widgets.UserManagement');

goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.messages');
goog.require('aurora.ui.ErrorWidget');
goog.require('aurora.widgets.PagedTable');
goog.require('aurora.widgets.Selectize');
goog.require('aurora.widgets.TableDialog');
goog.require('budget.WidgetScope');
goog.require('goog.structs.AvlTree');
goog.require('recoil.ui.widgets.InputWidget');
goog.require('recoil.ui.widgets.table.ButtonColumn');
goog.require('recoil.ui.widgets.table.TableWidget');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {{groups:!Array<string>, searchOnly:(boolean|undefined)}} options
 * @param {(!Array<{col:!recoil.structs.table.ColumnKey,value:(undefined|function(recoil.structs.table.TableRow):?)}>|!recoil.frp.Behaviour<!Array<{col:!recoil.structs.table.ColumnKey,value:(undefined|function(recoil.structs.table.TableRow):?)}>>)=}  opt_extraCols
 * @implements {recoil.ui.Widget}
 */
aurora.widgets.UserManagement = function(scope, options, opt_extraCols) {
    let frp = scope.getFrp();
    options = options || {};
    var util = new recoil.frp.Util(frp);
    let extraColsB = util.toBehaviour(opt_extraCols || []);
    let extraDataColsB = frp.liftB(function(extraCols) {
        return extraCols.filter(function(v) {return v.hasOwnProperty('value');}).map(function(v) {return v.key;});
    }, extraColsB);
    let searchWidget = new recoil.ui.widgets.InputWidget(scope);
    this.scope_ = scope;
    const PAGE_SIZE = 20;
    let container = goog.dom.createDom('div', {class: 'flex-display'});
    let userT = aurora.db.schema.tables.base.user;
    let groupT = aurora.db.schema.tables.base.group;
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
    let usernameB = frp.createB('');
    var confirmPasswordCK = new recoil.structs.table.ColumnKey('confirmPassword');

    let groupsListB = scope.getRefList(groupT, groupT.cols.name);
    let groupsFilterB = frp.liftB(function(groups) {
        let query = new recoil.db.Query();
        if (options.groups) {
            let list = groups.filter(function(v) {
                return options.groups.indexOf(v.name) !== -1;
            }).map(function(v) {return v.id;});
            return query.containsAll(query.field(userT.cols.groups), list);
        }
        return query.True();
    }, groupsListB);
    let groupsB = aurora.columns.Selectize.makeFromRefList(
        userT.cols.groups, aurora.messages.GROUPS,
        groupsListB);

    var makeNewRow = function(sample, tblKeys) {
        var newRow = new recoil.structs.table.MutableTableRow();
        for (var col in userT.meta) {
            let meta = userT.meta[col];
            if (meta.key === userT.info.pk) {
                continue;
            }
            newRow.set(meta.key, meta.defaultVal == undefined ? null : meta.defaultVal);
        }
        newRow.set(tblKeys.username, sample ? sample.get(tblKeys.username) : '');
        newRow.set(tblKeys.password, '');
        newRow.set(tblKeys.active, true);
        newRow.set(tblKeys.lockcount, 0);
        newRow.set(tblKeys.lastinvalidtime, null);
        newRow.set(tblKeys.groups, []);


        newRow.set(tblKeys.mentorid, null); // todo remove this from here
        newRow.set(confirmPasswordCK, '');

        if (sample) {
            newRow.setCellMeta(tblKeys.username, {enabled: recoil.ui.BoolWithExplanation.FALSE});
//            newRow.setCellMeta(tblKeys.role, {enabled: recoil.ui.BoolWithExplanation.FALSE});
        }
        newRow.addCellMeta(tblKeys.password, {immediate: true});
        newRow.addCellMeta(confirmPasswordCK, {immediate: true});
        return newRow;
    };
    let secContext = aurora.permissions.getContext(scope);
    let createDialogTable = function(sample, userB, groupCol) {
        return recoil.frp.util.memoryOnlyB(frp.liftB(function(user, extraDataCols) {
            var mTable = user.createEmpty([], [confirmPasswordCK].concat(extraDataCols));
            var columns = new recoil.ui.widgets.TableMetaData();
            var changePasswordCol = new recoil.ui.widgets.table.PasswordColumn(userT.cols.password, 'Password');
            var confirmPasswordCol = new recoil.ui.widgets.table.PasswordColumn(confirmPasswordCK, 'Confirm');
            mTable.addColumnMeta(userT.cols.username, {displayLength: 15});
            mTable.addColumnMeta(userT.cols.password, {displayLength: 15, autocomplete: false, editable: true});
            mTable.addColumnMeta(confirmPasswordCK, {displayLength: 15, autocomplete: false});
            columns.add(userT.cols.username, 'User Name');
            columns.addColumn(changePasswordCol);
            columns.addColumn(confirmPasswordCol);
            if (!sample) {
                columns.addColumn(groupCol);
            }
            let row = makeNewRow(sample, userT.cols);

            mTable.addRow(row);

            mTable.addColumnMeta(confirmPasswordCK, {type: 'string'});

            return columns.applyMeta(mTable.freeze());

        }, userB, extraDataColsB));

    };
    let userEqual = recoil.util.object.uniq();
    let filterGroups = function(col, val) {
        if (val == undefined || val.length === 0) {
            return null;
        }
        let query = new recoil.db.Query();
        return query.containsAll(query.field(col), val);
    };
	let changePasswordB = scope.getDb().get(aurora.db.schema.actions.base.account.change_password.key);
    let resetPasswordCol = new recoil.structs.table.ColumnKey('reset-password');
    let tableWidget = new aurora.widgets.PagedTable(scope, userT, PAGE_SIZE, function(scope, sourceB) {
        return aurora.ui.ErrorWidget.createTable(
            scope,
            frp.liftBI(function(tbl, groupCol, extraCols, extraDataCols, secContext) {
                console.log('sec', secContext);
                let res = tbl.createEmpty([], [resetPasswordCol].concat(extraDataCols));
                res.addMeta({remove: {text: budget.messages.REMOVE_USER.toString(), confirm: 5000}});
                let columns = new recoil.ui.widgets.TableMetaData();
                columns.add(userT.cols.username, 'User Name');
                columns.add(userT.cols.firstName, 'First Name');
                columns.add(userT.cols.lastName, 'Last Name');
                columns.add(userT.cols.email, 'Email');
                extraCols.forEach(function(info) {
                    if (info.col) {
                        columns.addColumn(info.col);
                    }
                    else {
                        columns.add(info.key, info.name);
                    }
                });

                if (!options.groups) {
                    columns.addColumn(groupCol);
                }
                else {
                    res.addColumnMeta(groupCol, {hidden: true});
                }

                if (!options.searchOnly) {
                    columns.addColumn(new recoil.ui.widgets.table.ButtonColumn(resetPasswordCol, 'Reset Password', {text: 'Reset'}));
                }
                res.addColumnMeta(userT.cols.username, {displayLength: 10});
                res.addColumnMeta(userT.cols.firstName, {displayLength: 10});
                res.addColumnMeta(userT.cols.lastName, {displayLength: 10});
                res.addColumnMeta(userT.cols.email, {displayLength: 20});

                if (options.searchOnly) {
                    res.addMeta({editable: false});
                }
                extraCols.forEach(function(info) {
                    if (info.hasOwnProperty('meta')) {
                        res.addColumnMeta(info.key, info.meta);
                    }
                });
                tbl.forEach(function(row) {
                    let mrow = row.unfreeze();
                    mrow.set(resetPasswordCol, null);
                    if (row.get(userT.cols.id).db == secContext.userid) {
                        mrow.addRowMeta({removeEnabled: new recoil.ui.BoolWithExplanation(false)});
			mrow.addCellMeta(groupCol.getKey(), {editable: false, enabled: new recoil.ui.BoolWithExplanation(false)});
                    }

                    extraCols.forEach(function(info) {
                        if (info.hasOwnProperty('value')) {
                            mrow.set(info.key, info.value(row));
                        }

                    });
                    res.addRow(mrow);
                });
                return columns.applyMeta(res);
            }, function(tbl) {
                if (tbl.getMeta().doAdd) {
                    let res = sourceB.get().unfreeze();
                    var userTableB = createDialogTable(null, sourceB, groupsB.get());
                    let rapidNameB = frp.liftB(function(tbl) {
                        let uname = null;
                        tbl.forEach(function(r) {
                            uname = r.get(userT.cols.username);
                        });
                        return uname === '' ? null : uname;
                    }, userTableB);

                    let userNameB = recoil.frp.util.calm(rapidNameB, 2000);

                    let matchUsersB = frp.switchB(frp.liftB(function(user) {
                        let query = new recoil.db.Query();
                        return scope.getDb().get(userT.key, query.eq(userT.cols.username, query.val(user)));
                    }, userNameB));

                    let validatedUserTableB = frp.metaLiftBI(function(tbl, users, rapid, slow) {
                        if (!tbl.good()) {
                            return tbl;
                        }
                        let ready = users.good() && rapid.good() && slow.good() && rapid.get() === slow.get();
                        let hasUsers = users.good() && users.get().size() !== 0;
                        let res = tbl.get().createEmpty();
                        tbl.get().forEach(function(row) {
                            let uname = row.get(userT.cols.username);
                            console.log('username', uname, ready, uname, slow);
                            let mrow = row.unfreeze();
                            if (uname == undefined || uname.trim().length === 0) {
                                mrow.addCellMeta(userT.cols.username, {errors: [aurora.messages.USERNAME_MUST_NOT_BE_BLANK]});
                            }
                            else if (!ready) {
                                mrow.addCellMeta(userT.cols.username, {errors: [{warning: aurora.messages.CHECKING_USER}]});
                            }
                            else if (hasUsers) {
                                mrow.addCellMeta(userT.cols.username, {errors: [aurora.messages.DUPLICATE_USER_NAME]});
                            }
                            else {
                                mrow.addCellMeta(userT.cols.username, {errors: []});
                            }
                            let p1 = row.get(userT.cols.password);
                            let p2 = row.get(confirmPasswordCK);

                            if (p1 == undefined || p1 === '') {
                                mrow.addCellMeta(userT.cols.password, {errors: [aurora.messages.PASSWORD_MUST_NOT_BE_BLANK]});
                            }
                            else if (p1 !== p2) {
                                mrow.addCellMeta(userT.cols.password, {errors: []});
                                mrow.addCellMeta(confirmPasswordCK, {errors: [aurora.messages.PASSWORDS_DO_NOT_MATCH]});
                            }
                            else {
                                mrow.addCellMeta(userT.cols.password, {errors: []});
                                mrow.addCellMeta(confirmPasswordCK, {errors: []});
                            }
                            res.addRow(mrow);
                        });

                        return new recoil.frp.BStatus(res.freeze());
                    }, function(tbl) {
                        userTableB.set(tbl.get());
                    }, userTableB, matchUsersB, rapidNameB, userNameB);
                    var td = new aurora.widgets.TableDialog(scope, validatedUserTableB, frp.createCallback(function(e) {
                        let addTable = userTableB.get();
                        let res = sourceB.get().unfreeze();
                        addTable.forEach(function(row) {
                            res.addRow(row);
                        });
                        sourceB.set(res.freeze());
                    }, sourceB, userTableB), 'Add', function() {return null;}, 'Add New User', undefined, {blockErrors: true});
                    td.show(true);
                }
                else {
                    let resetPasswordRow = null;
                    tbl.forEach(function(row) {
                        resetPasswordRow = resetPasswordRow || (row.get(resetPasswordCol) ? row : false);
                    });
                    if (resetPasswordRow) {
                        let tableB = createDialogTable(resetPasswordRow, sourceB, groupsB.get());
                        let td = new aurora.widgets.TableDialog(scope, tableB, frp.createCallback(function(e) {
                            let addTable = tableB.get();
							let password = null;

							addTable.forEach(function(row) {
								password = row.get(userT.cols.password);
							});
							if (password == '') {
								password = null;
							}
							let id = resetPasswordRow.get(userT.cols.id);
							let res = sourceB.get().createEmpty();
							changePasswordB.set({action: {
								password: password,
								oldPassword: '',
								userid: id.db
							}});
                        }, sourceB, tableB, changePasswordB), 'Reset', function(row) {
							if (row.get(confirmPasswordCK) !== row.get(userT.cols.password)) {
								return aurora.messages.PASSWORDS_DO_NOT_MATCH;
							}
							if (row.get(userT.cols.password) == '') {
								return aurora.messages.PASSWORD_MUST_NOT_BE_BLANK;
							}
							console.log('validate', row);
							return null;
						}, 'Reset Password');
                        td.show(true);
                    }
                    else {
                        let res = sourceB.get().createEmpty();
                        tbl.forEach(function(row) {
                            res.addRow(row);
                        });
                        sourceB.set(res.freeze());
                    }
                }
            },sourceB, groupsB, extraColsB, extraDataColsB, secContext));
    }, function(scope, headerB) {
        return frp.liftBI(function(header, extraCols) {
            let res = header.createEmpty();
            header.forEach(function(row) {
                let mrow = row.unfreeze();
                // where exists (select 1 from user_group where parentid = t0.id and groupid in (1,2))
                mrow.set(userT.cols.groups, mrow.get(userT.cols.groups) || []);
                mrow.addCellMeta(userT.cols.groups, {queryFactory: filterGroups});
                mrow.addCellMeta(userT.cols.password, {cellWidgetFactory: null});
                mrow.addCellMeta(resetPasswordCol, {cellWidgetFactory: null});
                extraCols.forEach(function(info) {
                    info.search && info.search(mrow);
                });
                res.addRow(mrow);
            });
            return res.freeze();

        }, function(tbl) {
            headerB.set(tbl);
        }, headerB, extraColsB);
    }, groupsFilterB);

    tableWidget.getComponent().render(container);
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

aurora.widgets.UserManagement.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @return {!goog.ui.Component}
 */
aurora.widgets.UserManagement.prototype.getComponent = function() {
    return this.component_;
};


