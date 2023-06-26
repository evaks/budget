goog.provide('budget.widgets.management.calc.DateSelector');


goog.require('budget.messages');
goog.require('goog.dom');


/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {aurora.db.schema.TableType} tableT
 * @implements {recoil.ui.Widget}
 */
budget.widgets.management.calc.DateSelector = function(scope, tableT) {
    this.scope_ = scope;
    this.tableT_ = tableT;
    this.tableWidget_ = new recoil.ui.widgets.table.TableWidget(scope);
};

/**
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tableB
 */
budget.widgets.management.calc.DateSelector.prototype.attach = function(tableB) {
    let frp = this.scope_.getFrp();
    let tableT = this.tableT_;
    const dw = recoil.ui.widgets.DateWidget2;

    let addDay = function(date, amount) {
        let d = dw.convertLocaleDate(date);
        d.setDate(d.getDate() + amount);
        return dw.convertDateToLocal(d);
    };
    const addYear = budget.widgets.management.calc.DateSelector.addYear;
    let displayTableB = frp.liftBI(
        function(tbl) {
            let res = tbl.createEmpty();
            res.addMeta({confirmDelete: 5000});
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.add(tableT.cols.start, 'Start Date');
            columns.add(tableT.cols.stop, 'End Date');



            tbl.forEachModify(function(row) {
                row.set(tableT.cols.stop, addDay(row.get(tableT.cols.stop), -1));
                row.setPos(-row.get(tableT.cols.start));
                res.addRow(row);
            });
            return columns.applyMeta(res);
        },
        function(tbl) {
            let res = tableB.get().createEmpty();

            tbl.forEachModify(function(row) {
                row.set(tableT.cols.stop, addDay(row.get(tableT.cols.stop), 1));
                if (row.getMeta().doAdd) {
                    let max = 20000101;
                    tableB.get().forEach(function(r) {
                        max = Math.max(max, r.get(tableT.cols.stop));
                    });
                    row.set(tableT.cols.start, max);
                    row.set(tableT.cols.stop, addYear(max, 1));
                }
                res.addRow(row);
            });
            tableB.set(res.freeze());
        }, tableB);


    this.tableWidget_.attachStruct(
        aurora.ui.ErrorWidget.createTable(
            this.scope_,
            aurora.widgets.TableWidget.createSizable(displayTableB)));
};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.management.calc.DateSelector.prototype.getComponent = function() {
    return this.tableWidget_.getComponent();
};


/**
 * @param {number} date
 * @param {number} amount
 * @return {number}
 */
budget.widgets.management.calc.DateSelector.addYear = function(date, amount) {
    const dw = recoil.ui.widgets.DateWidget2;

    let d = dw.convertLocaleDate(date);
    d.setFullYear(d.getFullYear() + amount);
    return dw.convertDateToLocal(d);
};

/**
 * @return {!recoil.frp.Behaviour<!Array<!Array<Object>>>}
 */
budget.widgets.management.calc.DateSelector.prototype.getSelected = function() {
    return this.tableWidget_.createSelected();
};


/**
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tableB
 * @return {{table:!recoil.frp.Behaviour<!recoil.structs.table.Table>,selected:!recoil.frp.Behaviour<boolean>}}
 */
budget.widgets.management.calc.DateSelector.prototype.getFiltered = function(tableB) {
    let frp = this.scope_.getFrp();
    let selectedB = this.getSelected();
    let pkB = frp.liftB(function(t) {
        return t.getPrimaryColumns()[0];
    }, tableB);

    return {
        table: recoil.structs.table.Filter.createRowFilterB(tableB, frp.liftB(function(sel, pk) {
            return function(row) {
                if (!sel || sel.length == 0) {
                    return false;
                }
                return sel[0][0].db == row.get(pk).db;
            };
        },selectedB, pkB)),
        selected: frp.liftB(function(sel) {
            return sel && sel.length != 0;
        }, selectedB)
    };
};
/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.management.calc.DateSelector.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

