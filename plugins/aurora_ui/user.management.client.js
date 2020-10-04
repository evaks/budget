goog.provide('aurora.widgets.UserManagement');

goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.messages');
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
 * @param {{groups:!Array<string>}} options
 * @implements {recoil.ui.Widget}
 */
aurora.widgets.UserManagement = function(scope, options) {
    let searchWidget = new recoil.ui.widgets.InputWidget(scope);
    let frp = scope.getFrp();
    this.scope_ = scope;
    const PAGE_SIZE = 20;
    let container = goog.dom.createDom('div', {class: 'flex-display'});
    let userT = aurora.db.schema.tables.base.user;
    let groupT = aurora.db.schema.tables.base.group;
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
    var util = new recoil.frp.Util(frp);
    let usernameB = frp.createB('');
    var confirmPasswordCK = new recoil.structs.table.ColumnKey('confirmPassword');

    let tableHeaderB = this.createHeaderTableB();
    let groupsB = aurora.columns.Selectize.makeFromRefList(
        userT.cols.groups, aurora.messages.GROUPS,
        scope.getRefList(groupT, groupT.cols.name));

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

    let createDialogTable = function(sample, userB, groupCol) {
        return recoil.frp.util.memoryOnlyB(frp.liftB(function(user) {
            var mTable = user.createEmpty([], [confirmPasswordCK]);
            var columns = new recoil.ui.widgets.TableMetaData();
            var changePasswordCol = new recoil.ui.widgets.table.PasswordColumn(userT.cols.password, 'Password');
            var confirmPasswordCol = new recoil.ui.widgets.table.PasswordColumn(confirmPasswordCK, 'Confirm');
            mTable.addColumnMeta(userT.cols.username, {displayLength: 15});
            mTable.addColumnMeta(userT.cols.password, {displayLength: 15, autocomplete: false});
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

        }, userB));

    };
    let userEqual = recoil.util.object.uniq();
    let filterGroups = function(col, val) {
        if (val == undefined || val.length === 0) {
            return null;
        }
        let query = new recoil.db.Query();
        return query.containsAll(query.field(col), val);
    };

    let tableWidget = new aurora.widgets.PagedTable(scope, userT, PAGE_SIZE, function(scope, sourceB) {
        return frp.liftBI(function(tbl, groupCol) {
            let res = tbl.unfreeze();
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.add(userT.cols.username, 'User Name');
            columns.add(userT.cols.email, 'Email');
            columns.addColumn(groupCol);
            columns.addColumn(new recoil.ui.widgets.table.ButtonColumn(userT.cols.password, 'Reset Password', {text: 'Reset'}));
            res.addColumnMeta(userT.cols.username, {displayLength: 10});
            res.addColumnMeta(userT.cols.email, {displayLength: 20});
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

                let userValidatorB = frp.metaLiftB(function(users, rapid, slow) {

                    let ready = users.good() && rapid.good() && slow.good() && rapid.get() === slow.get();
                    let hasUsers = users.good() && users.get().size() !== 0;
                    return new recoil.frp.BStatus(recoil.util.func.makeEqualFunc(function(row) {
                        if (!ready) {
                            return aurora.messages.CHECKING_USER;
                        }
                        else if (hasUsers) {
                            return aurora.messages.DUPLICATE_USER_NAME;
                        }
                        let uname = row.get(userT.cols.username);
                        let p1 = row.get(userT.cols.password);
                        let p2 = row.get(confirmPasswordCK);

                        if (uname == undefined || uname.trim().length === 0) {
                            return aurora.messages.USERNAME_MUST_NOT_BE_BLANK;
                        }
                        if (p1 == undefined || p1 === '') {
                            return aurora.messages.PASSWORD_MUST_NOT_BE_BLANK;
                        }

                        if (p1 !== p2) {
                            return aurora.messages.PASSWORDS_DO_NOT_MATCH;
                        }

                        return null;
                    }, userEqual, {ready, hasUsers}));
                }, matchUsersB, rapidNameB, userNameB);
                var td = new aurora.widgets.TableDialog(scope, userTableB, frp.createCallback(function(e) {
                    let addTable = userTableB.get();
                    let res = sourceB.get().unfreeze();
                    addTable.forEach(function(row) {
                        res.addRow(row);
                    });
                    sourceB.set(res.freeze());
                }, sourceB, userTableB), 'Add', userValidatorB, 'Add New User');
                td.show(true);
            }
            else {
                let resetPasswordRow = null;
                tbl.forEach(function(row) {
                    resetPasswordRow = resetPasswordRow || (row.get(userT.cols.password) ? row : false);
                });
                if (resetPasswordRow) {
                    let tableB = createDialogTable(resetPasswordRow, sourceB, groupsB.get());
                    let td = new aurora.widgets.TableDialog(scope, tableB, frp.createCallback(function(e) {
                        let addTable = tableB.get();

                    }, sourceB, tableB), 'Reset', function() {return null;}, 'Reset Password');
                    td.show(true);
                }
                else {
                    sourceB.set(tbl);
                }
            }
        },sourceB, groupsB);
    }, function(scope, headerB) {
        return frp.liftBI(function(header) {
            let res = header.createEmpty();
            header.forEach(function(row) {
                let mrow = row.unfreeze();
                // where exists (select 1 from user_group where parentid = t0.id and groupid in (1,2))
                mrow.set(userT.cols.groups, row.get(userT.cols.groups) || []);
                mrow.addCellMeta(userT.cols.groups, {queryFactory: filterGroups});
                mrow.addCellMeta(userT.cols.password, {cellWidgetFactory: null});
                res.addRow(mrow);
            });

            return res.freeze();

        }, function(tbl) {
            headerB.set(tbl);
        }, headerB);
    });

    tableWidget.getComponent().render(container);
};

/**
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */
aurora.widgets.UserManagement.prototype.createHeaderTableB = function() {
    var headerTable = recoil.structs.table.Table.create(
        aurora.Client.typeFactories, {}, [], true).unfreeze();
    let userT = aurora.db.schema.tables.base.user;
    let frp = this.scope_.getFrp();
    let scope = this.scope_;
    var headerTableDecorator = function() {
        var myTable = goog.dom.createDom('table', {class: 'user-management'});
        return new recoil.ui.RenderedDecorator(
            headerTableDecorator,
            myTable);
    };

    let textFactory = function() {
        var widget = new recoil.ui.widgets.InputWidget(scope);
        return widget;
    };
    let groupFactory = function() {
        var widget = new recoil.ui.widgets.SelectorWidget(scope);
        return widget;
    };

    let booleanFactory = function() {
        var widget = new recoil.ui.widgets.InputWidget(scope);
        return widget;
    };
    let blankFactory = function() {
        var widget = new recoil.ui.widgets.InputWidget(scope);
        return widget;
    };

    headerTable.addMeta({editable: false});

    // headerTable.addMeta({tableDecorator : tableDecorator});

    var headerRow = new recoil.structs.table.MutableTableRow(-1);

    headerRow.setCell(userT.cols.id, new recoil.structs.table.TableCell(-1));
    headerRow.setCell(userT.cols.username, new recoil.structs.table.TableCell(
        null,
        {cellWidgetFactory: textFactory}));
    headerRow.setCell(userT.cols.email, new recoil.structs.table.TableCell(
        null,
        {cellWidgetFactory: textFactory}));
    headerRow.setCell(userT.cols.lockcount, new recoil.structs.table.TableCell(
        null,
        {cellWidgetFactory: booleanFactory}));
    headerRow.setCell(userT.cols.groups, new recoil.structs.table.TableCell(
        null,
        {cellWidgetFactory: groupFactory}));
    headerRow.setCell(userT.cols.password, new recoil.structs.table.TableCell(
        null,
        {cellWidgetFactory: blankFactory}));

//    addDecorators(headerTable, decs);
    headerTable.addRow(headerRow);
    headerTable.addMeta({selectionMode: recoil.ui.widgets.table.TableWidget.SelectionMode.NONE});

    return frp.createConstB(headerTable.freeze());
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


