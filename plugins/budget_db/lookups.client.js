goog.provide('budget.widgets.admin.Lookup');


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
 * @param {string} tableName
 * @implements {recoil.ui.Widget}
 */
budget.widgets.admin.Lookup = function(scope, tableName) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    const tableT = aurora.db.schema.tables.base[tableName];
    const TOCOL = new recoil.structs.table.ColumnKey('to');
    let tableB = scope.getDb().get(tableT.key);
    let tiersDiv = cd('div');
    let container = cd('div', {class: 'calc-admin'}, tiersDiv);


    this.table_ = new recoil.ui.widgets.table.TableWidget(scope);

    let displayB = frp.liftBI(
        function(tbl) {
            let res = tbl.unfreeze();
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.add(tableT.cols.name, 'Name', {displayLength: 30});
            res.addMeta({confirmDelete: 5000});
            return columns.applyMeta(res);
        },
        function(tbl) {
            let res = tableB.get().createEmpty();
            let nextOrder = 0;
            tbl.forEachModify(r => {
                if (!r.getMeta().doAdd) {
                    nextOrder = Math.max(nextOrder, r.pos() + 1);
                }
            });
            
            tbl.forEachModify(r => {
                if (r.getMeta().doAdd) {
                    r.set(tableT.cols.name, 'Unnamed');
                    r.set(tableT.cols.order, nextOrder++);

                }
                else {
                    r.set(tableT.cols.order, r.pos());
                }
                res.addRow(r);
            });
            tableB.set(res.freeze());
        }, tableB);

    this.table_.attachStruct(aurora.widgets.TableWidget.createMovableSizable(displayB, true));

    this.table_.getComponent().render(tiersDiv);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.admin.Lookup.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.management.calc.TaxRates.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

