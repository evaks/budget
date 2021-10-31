goog.provide('budget.widgets.management.calc.AccRates');


goog.require('aurora.db.schema.tables.base.tax');
goog.require('aurora.download');
goog.require('budget.messages');
goog.require('budget.widgets.SelectTable');
goog.require('goog.dom');
goog.require('recoil.ui.ComponentWidgetHelper');


/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number} userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.management.calc.AccRates = function(scope, userid) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    const accT = aurora.db.schema.tables.base.acc;
    let accB = scope.getDb().get(accT.key);
    let selDiv = cd('div', {class: 'date-selector-table'});
    let container = cd('div', {class: 'calc-admin'},selDiv);

    this.table_ = new recoil.ui.widgets.table.TableWidget(scope);

    const dw = recoil.ui.widgets.DateWidget2;

    let addDay = function(date, amount) {
        let d = dw.convertLocaleDate(date);
        d.setDate(d.getDate() + amount);
        return dw.convertDateToLocal(d);
    };
    const addYear = budget.widgets.management.calc.DateSelector.addYear;

    let accDisplayB = frp.liftBI(
        function(tbl) {
            let res = tbl.createEmpty();
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.add(accT.cols.start, 'Start Date');
            columns.add(accT.cols.stop, 'End Date');
            columns.add(accT.cols.rate, 'Rate %');
            columns.add(accT.cols.limit, 'Max Income');
            res.addColumnMeta(accT.cols.limit, {min: 0, max: 10000000, step: 0.01});
            res.addColumnMeta(accT.cols.rate, {min: 0, max: 100, step: 0.01, displayLength: 6});

            let prev = null;
            tbl.forEachModify(function(row) {
                row.set(accT.cols.rate, row.get(accT.cols.rate) / 100);
                row.set(accT.cols.limit, row.get(accT.cols.limit) / 100);
                row.set(accT.cols.stop, addDay(row.get(accT.cols.stop), -1));
                row.setPos(-row.get(accT.cols.start));
                res.addRow(row);
            });
            return columns.applyMeta(res);
        },
        function(tbl) {
            let res = accB.get().createEmpty();
            tbl.forEachModify(function(row) {

                if (row.getMeta().doAdd) {
                    let max = null;
                    accB.get().forEach(function(r) {
                        if (max === null || max.get(accT.cols.stop) < r.get(accT.cols.stop)) {
                            max = r;
                        }
                    });

                    if (max) {
                        row.set(accT.cols.rate, max.get(accT.cols.rate));
                        row.set(accT.cols.limit, max.get(accT.cols.limit));
                        row.set(accT.cols.start, max.get(accT.cols.stop));
                        row.set(accT.cols.stop, addYear(max.get(accT.cols.stop), 1));
                    }
                    else {
                        row.set(accT.cols.rate, 100);
                        row.set(accT.cols.limit, 10000000);
                        row.set(accT.cols.start, 20000101);
                        row.set(accT.cols.stop, 20010101);
                    }
                }
                else {
                    row.set(accT.cols.rate, Math.round(row.get(accT.cols.rate) * 100));
                    row.set(accT.cols.limit, Math.round(row.get(accT.cols.limit) * 100));
                    row.set(accT.cols.stop, addDay(row.get(accT.cols.stop), 1));
                }
                res.addRow(row);
            });
            accB.set(res.freeze());
        }, accB);

    this.table_.attachStruct(aurora.widgets.TableWidget.createSizable(accDisplayB));

    this.table_.getComponent().render(selDiv);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.management.calc.AccRates.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.management.calc.AccRates.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

