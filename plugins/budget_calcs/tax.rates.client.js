goog.provide('budget.widgets.management.calc.TaxRates');


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
budget.widgets.management.calc.TaxRates = function(scope, userid) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    const taxT = aurora.db.schema.tables.base.tax;
    const tierT = taxT.tiers;
    const TOCOL = new recoil.structs.table.ColumnKey('to');
    let taxB = scope.getDb().get(taxT.key);
    this.dateSelector_ = new budget.widgets.management.calc.DateSelector(scope, taxT);
    let selDiv = cd('div', {class: 'date-selector-table'});
    let tiersDiv = cd('div');
    let container = cd('div', {class: 'calc-admin'},
                       cd('h2', {}, 'Date Ranges'), selDiv,
                       cd('h2', {},'Tiers'), tiersDiv);


    this.tiersTable_ = new budget.widgets.SelectTable(scope);
    this.dateSelector_.attach(taxB);
    let selected = this.dateSelector_.getFiltered(taxB);
    let tierTableB = budget.Client.instance.createSubTableB(selected.table, frp.createB(/** @type {Array} **/ (null)), taxT.cols.tiers);

    let tierDisplayB = frp.liftBI(
        function(tbl) {
            let res = tbl.createEmpty([], [TOCOL]);
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.add(tierT.cols.amount, 'From');
            columns.add(TOCOL, 'To');
            columns.add(tierT.cols.rate, 'Tax %');

            res.addColumnMeta(tierT.cols.amount, {min: 0, max: 10000000, step: 0.01});
            res.addColumnMeta(TOCOL, {type: 'int', min: 0, max: 10000000, step: 0.01, editable: false, displayLength: -1});
            res.addColumnMeta(tierT.cols.rate, {min: 0, max: 100, step: 0.01, displayLength: 6});

            let sorted = [];

            tbl.forEachModify(function(r) {
                sorted.push(r);
            });

            sorted.sort((x, y) => y.get(tierT.cols.amount) - x.get(tierT.cols.amount));

            let prev = null;
            sorted.forEach(function(row) {
                row.set(TOCOL, prev);
                row.set(tierT.cols.rate, row.get(tierT.cols.rate) / 100);
                prev = row.get(tierT.cols.amount) / 100;
                row.set(tierT.cols.amount, prev);
                row.setPos(prev);
                res.addRow(row);
            });
            return columns.applyMeta(res);
        },
        function(tbl) {
            let res = tierTableB.get().createEmpty();
            tbl.forEachModify(function(row) {
                let max = null;
                if (row.getMeta().doAdd) {

                    tierTableB.get().forEach(function(r) {
                        if (max === null || max.get(tierT.cols.amount) < r.get(tierT.cols.amount)) {
                            max = r;
                        }
                    });
                    row.set(tierT.cols.rate, Math.round(max ? max.get(tierT.cols.rate) : 0));
                    row.set(tierT.cols.amount, Math.round(max ? max.get(tierT.cols.amount) : 0));
                }
                else {
                    row.set(tierT.cols.rate, Math.round(row.get(tierT.cols.rate) * 100));
                    row.set(tierT.cols.amount, Math.round(row.get(tierT.cols.amount) * 100));
                }
                res.addRow(row);
            });
            tierTableB.set(res.freeze());
        }, tierTableB);

    this.tiersTable_.attachStruct({
        value: aurora.widgets.TableWidget.createSizable(tierDisplayB),
        selected: selected.selected,
        message: 'Select a Tax year'
    });

    this.dateSelector_.getComponent().render(selDiv);
    this.tiersTable_.getComponent().render(tiersDiv);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.management.calc.TaxRates.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.management.calc.TaxRates.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

