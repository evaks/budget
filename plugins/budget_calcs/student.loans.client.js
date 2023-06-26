goog.provide('budget.widgets.management.calc.StudentLoans');


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
budget.widgets.management.calc.StudentLoans = function(scope, userid) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    const loanT = aurora.db.schema.tables.base.student_loan;
    let loanB = scope.getDb().get(loanT.key);
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

    let loanDisplayB = frp.liftBI(
        function(tbl) {
            let res = tbl.createEmpty();
            let columns = new recoil.ui.widgets.TableMetaData();
            
            res.addMeta({confirmDelete: 5000});
            columns.add(loanT.cols.start, 'Start Date');
            columns.add(loanT.cols.stop, 'End Date');
            columns.add(loanT.cols.rate, 'Rate %');
            columns.add(loanT.cols.weeklyMin, 'Weekly Min');
            res.addColumnMeta(loanT.cols.weeklyMin, {min: 0, max: 10000000, step: 0.01});
            res.addColumnMeta(loanT.cols.rate, {min: 0, max: 100, step: 0.01, displayLength: 6});

            let prev = null;
            tbl.forEachModify(function(row) {
                row.set(loanT.cols.rate, row.get(loanT.cols.rate) / 100);
                row.set(loanT.cols.weeklyMin, row.get(loanT.cols.weeklyMin) / 100);
                row.set(loanT.cols.stop, addDay(row.get(loanT.cols.stop), -1));
                row.setPos(-row.get(loanT.cols.start));
                res.addRow(row);
            });
            return columns.applyMeta(res);
        },
        function(tbl) {
            let res = loanB.get().createEmpty();
            tbl.forEachModify(function(row) {

                if (row.getMeta().doAdd) {
                    let max = null;
                    loanB.get().forEach(function(r) {
                        if (max === null || max.get(loanT.cols.stop) < r.get(loanT.cols.stop)) {
                            max = r;
                        }
                    });

                    if (max) {
                        row.set(loanT.cols.rate, max.get(loanT.cols.rate));
                        row.set(loanT.cols.weeklyMin, max.get(loanT.cols.weeklyMin));
                        row.set(loanT.cols.start, max.get(loanT.cols.stop));
                        row.set(loanT.cols.stop, addYear(max.get(loanT.cols.stop), 1));
                    }
                    else {
                        row.set(loanT.cols.rate, 100);
                        row.set(loanT.cols.weeklyMin, 10000000);
                        row.set(loanT.cols.start, 20000101);
                        row.set(loanT.cols.stop, 20010101);
                    }
                }
                else {
                    row.set(loanT.cols.rate, Math.round(row.get(loanT.cols.rate) * 100));
                    row.set(loanT.cols.weeklyMin, Math.round(row.get(loanT.cols.weeklyMin) * 100));
                    row.set(loanT.cols.stop, addDay(row.get(loanT.cols.stop), 1));
                }
                res.addRow(row);
            });
            loanB.set(res.freeze());
        }, loanB);

    this.table_.attachStruct(aurora.widgets.TableWidget.createSizable(loanDisplayB));

    this.table_.getComponent().render(selDiv);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.management.calc.StudentLoans.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.management.calc.StudentLoans.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

