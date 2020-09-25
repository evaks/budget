goog.provide('aurora.widgets.UserManagement');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.messages');
goog.require('aurora.widgets.Selectize');
goog.require('aurora.widgets.TableDialog');
goog.require('budget.WidgetScope');
goog.require('goog.structs.AvlTree');
goog.require('recoil.ui.widgets.InputWidget');
goog.require('recoil.ui.widgets.table.ButtonColumn');
goog.require('recoil.ui.widgets.table.PagedTableWidget');
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
        newRow.set(tblKeys.username, sample ? sample.get(tblKeys.username) : '');
        newRow.set(tblKeys.password, '');
        newRow.set(tblKeys.active, true);
        newRow.set(tblKeys.lockcount, 0);
        newRow.set(tblKeys.lastinvalidtime, null);
        newRow.set(tblKeys.email, '');
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

    let createDialogTable = function(sample, userB) {
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
            let row = makeNewRow(sample, userT.cols);

            mTable.addRow(row);

            mTable.addColumnMeta(confirmPasswordCK, {type: 'string'});

            return columns.applyMeta(mTable.freeze());

        }, userB));

    };


    let tableWidget = aurora.widgets.UserManagement.createPagedTable(scope, userT, PAGE_SIZE, function(scope, sourceB) {
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
                var tableB = createDialogTable(null, sourceB);
                var td = new aurora.widgets.TableDialog(scope, tableB, frp.createCallback(function(e) {
                    let addTable = tableB.get();
                    let res = sourceB.get().unfreeze();
                    addTable.forEach(function(row) {
                        res.addRow(row);
                    });
                    sourceB.set(res.freeze());
                }, sourceB, tableB), 'Add', function() {return null;}, 'Add New User');
                td.show(true);
            }
            else {
                let resetPasswordRow = null;
                tbl.forEach(function(row) {
                    resetPasswordRow = resetPasswordRow || (row.get(userT.cols.password) ? row : false);
                });
                if (resetPasswordRow) {
                    var tableB = createDialogTable(resetPasswordRow, sourceB);
                    var td = new aurora.widgets.TableDialog(scope, tableB, frp.createCallback(function(e) {
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
 * the factory will recieve the scope passed in and the table page that was recieve from the server
 * the header factory recieves scope and a sample table for the search filters, you may modify it in order to make it better
 *
 * @param {!aurora.WidgetScope} scope
 * @param {!aurora.db.schema.TableType} tableT
 * @param {number|!recoil.frp.Behaviour<number>} pageSize
 * @param {function(!aurora.WidgetScope,!recoil.frp.Behaviour<!recoil.structs.table.Table>):!recoil.frp.Behaviour<!recoil.structs.table.Table>} factory
 * @param {function(!aurora.WidgetScope,!recoil.frp.Behaviour<!recoil.structs.table.Table>):!recoil.frp.Behaviour<!recoil.structs.table.Table>} headerFactory
 * @return {!recoil.ui.widgets.table.PagedTableWidget}
 */
aurora.widgets.UserManagement.createPagedTable = function(scope, tableT, pageSize, factory, headerFactory) {
    let frp = scope.getFrp();
    let lastGoodDataTableB = frp.createNotReadyB();
    let sortOrderB = frp.createB([{id: true}]);
    let pageKeyB = frp.createB(/** @type {?Object} */ (null));
    let util = new recoil.frp.Util(frp);
    let pageSizeB = util.toBehaviour(pageSize);
    let ns = aurora.widgets.UserManagement;
    var rowToSortOrder = function(row, order) {
        var res = [];
        order.forEach(function(val) {
            res.push({key: val, val: row.get(tableT.meta[val].key)});
        });
        res.push({key: 'id', val: row.get(tableT.cols.id)});
        return res;
    };

    var pageKeyToServer = function(key, order) {
        if (key) {
            if (key.next) {
                return {next: rowToSortOrder(key.next, order), page: key.page};
            }
            else if (key.prev) {
                return {prev: rowToSortOrder(key.prev, order), page: key.page};
            }
        }
        return key;
    };
    let headerRowB = frp.createB(null);

    let filtersB = frp.liftB(
        function(userFilter) {
            let query = new recoil.db.Query();
            return query.True();
        },
        headerRowB
    );

    let serverDataTableB = ns.createKeyedValue(
        scope, tableT.key, filtersB,
        frp.liftB(function(sortOrder, pageKey, pageSize) {
            return new recoil.db.QueryOptions({
                sortOrder: sortOrder,
                start: pageKeyToServer(pageKey, []),
                size: pageSize
            });
        }, sortOrderB, pageKeyB, pageSizeB));

    let nullFunc = function() {return null;};
    let dataTableB = frp.metaLiftBI(function() {
        if (serverDataTableB.good()) {
            lastGoodDataTableB.set(serverDataTableB.get());
            return serverDataTableB.metaGet();
        }
        return lastGoodDataTableB.metaGet();
    }, function(val) {
        if (serverDataTableB.good()) {
            serverDataTableB.metaSet(val);
        }
    }, serverDataTableB, lastGoodDataTableB);

    let tableSizeB = ns.createKeyedValue(scope, tableT.key, filtersB, new recoil.db.QueryOptions({count: true}));
    let tableB = factory(scope, dataTableB);

    let addCallbackB = frp.createCallback(function() {
        let res = tableB.get().unfreeze();
        res.addMeta({doAdd: true});
        tableB.set(res.freeze());
    }, tableB);


    let addText = goog.dom.createDom('span', {}, 'Add User');
    let removeText = goog.dom.createDom('span', {}, 'Remove User');

    let addB = recoil.frp.struct.extend(
        frp, {text: addText},
        frp.liftB(function(tbl) {
            return tbl.getMeta().add || {};
        }), {action: addCallbackB}
    );




    let tableWidget = new recoil.ui.widgets.table.PagedTableWidget(scope, true);
    let selectedB = tableWidget.createSelected();
    let removeCallbackB = frp.createCallback(function() {
        let res = tableB.get().createEmpty();
        let selected = selectedB.get();
        let toRemove = goog.structs.AvlTree.fromList(selected, recoil.util.object.compare);
        tableB.get().forEach(function(row) {
            if (!toRemove.findFirst(res.getRowKey(row))) {
                res.addRow(row);
            }
        });
        tableB.set(res.freeze());
    }, tableB, selectedB);

    let removeB = recoil.frp.struct.extend(
        frp, {text: removeText},
        frp.liftB(function(tbl) {
            return tbl.getMeta().remove || {};
        }), {action: removeCallbackB}
    );


    let pager = recoil.ui.widgets.table.createNextTablePager(dataTableB, pageKeyB, pageSize, tableSizeB);
    let searchRowDecorator = function() {
        return new recoil.ui.RenderedDecorator(
            searchRowDecorator,
            goog.dom.createDom('tr', {class: 'search-row'}));
        };

    let tableDecorator = function() {
        return new recoil.ui.RenderedDecorator(
            searchRowDecorator,
            goog.dom.createDom('table', {class: 'recoil-table-widget'}));
        };



    let headerTableB = headerFactory(scope, frp.liftBI(function(table, row) {
        let outRow = new recoil.structs.table.MutableTableRow();
        let used = [];
        table.getOtherColumns().forEach(function(col) {
            outRow.set(col, null);
        });

        table.forEachPlacedColumn(function(col) {
            outRow.set(col, null);
            if (row && row.hasColumn(col)) {
                outRow.set(col, row.get(col));
            }
            used.push(col);
        });

        let res = table.createEmpty();
        res.addRow(outRow);
        return res.freeze();
    }, function(val) {
        val.forEach(function(row) {
            headerRowB.set(row);
        });
    },tableB, headerRowB));

    tableWidget.attach(null, frp.liftBI(function(table, header) {
        let tbl = table.createEmpty();
        tbl.addMeta({selectionMode: recoil.ui.widgets.table.TableWidget.SelectionMode.MULTI, tableDecorator: tableDecorator});
        let pos = -header.size();
        header.forEach(function(row) {
            let mrow = row.unfreeze();
            mrow.addRowMeta({rowDecorator: searchRowDecorator});
            mrow.setPos(pos++);
            mrow.addRowMeta({selectable: false});
            tbl.addRow(mrow);
        });
        table.forEach(function(row) {
            tbl.addRow(row);
        });

        return tbl.freeze();
    }, function(val) {
        let hSize = headerTableB.get().size();
        let header = headerTableB.get().createEmpty();
        let table = tableB.get().createEmpty();
        let pos = 0;
        val.forEach(function(row) {
            if (pos < hSize) {
                header.addRow(row);
            }
            else {
                table.addRow(row);
            }
            pos++;
        });

        tableB.set(table.freeze());
        headerTableB.set(header.freeze());
    }, tableB, headerTableB), pager.page, pager.count);

    tableWidget.attachAdd(addB, removeB);

    return tableWidget;
};
/**
 * @param {!aurora.WidgetScope} scope
 * @param {!recoil.db.BasicType} id
 * @param {!recoil.frp.Behaviour<!recoil.db.Query>} query
 * @param {!recoil.db.QueryOptions|recoil.frp.Behaviour<!recoil.db.QueryOptions>} options
 * @return {!recoil.frp.Behaviour}
 */
aurora.widgets.UserManagement.createKeyedValue = function(scope, id, query, options) {
    var frp = scope.getFrp();
    var database = scope.getDb();
    var util = new recoil.frp.Util(frp);
    var mapB = frp.createB(new goog.structs.AvlTree(recoil.util.object.compareKey));
    let queryB = util.toBehaviour(query);
    let optionsB = util.toBehaviour(options);

    var dataTableBB = frp.liftB(
        function(query, options, map) {
            let key = {query: query, options: options};
            var existing = map.findFirst({key: key});

            if (existing) {
                return existing.behaviour;
            }
            var resB = database.get(id, query, options);
            map.add({key: key, behaviour: resB});
            mapB.set(map);

            return resB;

        }, queryB, optionsB, mapB);

    return frp.switchB(dataTableBB);
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


