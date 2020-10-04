goog.provide('aurora.widgets.PagedTable');

goog.require('recoil.ui.widgets.table.PagedTableWidget');

/**
 * the factory will recieve the scope passed in and the table page that was recieve from the server
 * the header factory recieves scope and a sample table for the search filters, you may modify it in order to make it better
 * @constructor
 * @param {!aurora.WidgetScope} scope
 * @param {!aurora.db.schema.TableType} tableT
 * @param {number|!recoil.frp.Behaviour<number>} pageSize
 * @param {function(!aurora.WidgetScope,!recoil.frp.Behaviour<!recoil.structs.table.Table>):!recoil.frp.Behaviour<!recoil.structs.table.Table>} factory
 * @param {function(!aurora.WidgetScope,!recoil.frp.Behaviour<!recoil.structs.table.Table>):!recoil.frp.Behaviour<!recoil.structs.table.Table>} headerFactory
 */
aurora.widgets.PagedTable = function(scope, tableT, pageSize, factory, headerFactory) {
    let frp = scope.getFrp();
    let lastGoodDataTableB = frp.createNotReadyB();
    let sortOrderB = frp.createB([{id: true}]);
    let pageKeyB = frp.createB(/** @type {?Object} */ (null));
    let util = new recoil.frp.Util(frp);
    let pageSizeB = util.toBehaviour(pageSize);
    let ns = aurora.widgets.PagedTable;
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
    let filterTableB = frp.createB(null);

    /**
     * @param {string} prop
     * @param {?} def
     * @param {...Object} var_metas
     * @return {?}
     */
    let getMeta = function(prop, def, var_metas) {
        for (let i = arguments.length - 1; i >= 2; i--) {
            if (arguments[i].hasOwnProperty(prop)) {
                return arguments[i][prop];
            }
        }
        return def;
    };
    let equalFactory = function(col, val) {
        if (val == undefined) {
            return null;
        }
        let query = new recoil.db.Query();
        return query.eq(query.field(col), query.val(val));
    };

    let likeFactory = function(col, val) {
        if (val == undefined || val.trim() === '') {
            return null;
        }
        let query = new recoil.db.Query();
        return query.startsWith(query.field(col), val);
    };

    let filtersB = frp.liftB(
        function(userFilter) {
            let query = new recoil.db.Query();
            if (!userFilter) {
                return query.True();
            }
            let parts = [];
            let tableMeta = userFilter.getMeta();
            userFilter.forEach(function(row) {
                userFilter.forEachPlacedColumn(function(col) {
                    let colMeta = userFilter.getColumnMeta(col);
                    let cellMeta = row.getCellMeta(col);
                    if (getMeta('visible', true, tableMeta, colMeta, cellMeta)) {
                        let queryFactory = getMeta('queryFactory', null, tableMeta, colMeta, cellMeta);
                        if (!queryFactory) {
                            let type = getMeta('type', null, tableMeta, colMeta, cellMeta);
                            if (type === 'string') {
                                queryFactory = likeFactory;
                            }
                            else {
                                queryFactory = equalFactory;
                            }
                        }
                        let query = queryFactory(col, row.get(col));
                        if (query) {
                            parts.push(query);
                        }

                    }

                });
            });
            if (parts.length > 0) {
                return query.and.apply(query, parts);
            }
            return query.True();
        },
        filterTableB
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


    let pks = {};
    let headerTableB = headerFactory(scope, frp.liftBI(function(table, header) {
        let outRow = new recoil.structs.table.MutableTableRow();
        let used = [];
        table.getOtherColumns().forEach(function(col) {
            outRow.set(col, null);
        });

        table.getPrimaryColumns().forEach(function(col) {
            if (!pks.hasOwnProperty(col.getId())) {
                pks[col.getId()] = col.getDefault();
            }
            outRow.set(col, pks[col.getId()]);
        });


        table.forEachPlacedColumn(function(col) {
            outRow.set(col, null);
            if (header) {
                header.forEach(function(row) {
                    if (row && row.hasColumn(col)) {
                        outRow.set(col, row.get(col));
                        outRow.addCellMeta(col, row.getCellMeta(col));
                    }
                });
            }
            used.push(col);
        });

        let res = table.createEmpty();
        res.addRow(outRow);
        return res.freeze();
    }, function(val) {
        filterTableB.set(val);
    },tableB, filterTableB));

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

    this.tableWidget_ = tableWidget;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

aurora.widgets.PagedTable.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @return {!goog.ui.Component}
 */
aurora.widgets.PagedTable.prototype.getComponent = function() {
    return this.tableWidget_.getComponent();
};

/**
 * @param {!aurora.WidgetScope} scope
 * @param {!recoil.db.BasicType} id
 * @param {!recoil.frp.Behaviour<!recoil.db.Query>} query
 * @param {!recoil.db.QueryOptions|recoil.frp.Behaviour<!recoil.db.QueryOptions>} options
 * @return {!recoil.frp.Behaviour}
 */
aurora.widgets.PagedTable.createKeyedValue = function(scope, id, query, options) {
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
