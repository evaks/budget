goog.provide('budget.widgets.BudgetList');

goog.require('aurora.columns.Link');
goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.messages');
goog.require('aurora.ui.coverters.LocaleDateConverter');
goog.require('budget.WidgetScope');
goog.require('goog.structs.AvlTree');
goog.require('recoil.ui.widgets.InputWidget');
goog.require('recoil.ui.widgets.table.ButtonColumn');
goog.require('recoil.ui.widgets.table.TableWidget');
/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.BudgetList = function(scope) {
    const userT = aurora.db.schema.tables.base.user;
    const budgetT = aurora.db.schema.tables.base.budget;
    let templateT = aurora.db.schema.tables.base.budget_template;
    const entryT = budgetT.entries;
    let PeriodType = aurora.db.schema.getEnum(budgetT.cols.period);

    let budgetsB = scope.getDb().get(budgetT.key);
    let templateB = scope.getDb().get(templateT.key);
    let frp = scope.getFrp();
    let converter = new aurora.ui.coverters.LocaleDateConverter();

    const COPY = new recoil.structs.table.ColumnKey('copy');
    this.widget_ = new recoil.ui.widgets.table.TableWidget(scope);
    let userId = parseInt(budget.widgets.BudgetList.getSearchParams()['id'][0], 10);
    let formatedB = frp.liftBI(function(tbl) {
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(budgetT.cols.name, 'Name');
        columns.add(budgetT.cols.createTime, 'Created');
        let res = tbl.createEmpty([], [COPY]);
        res.addMeta({headerRowDecorator: null});
        res.addColumnMeta(budgetT.cols.createTime, {editable: false, converter: converter, classes: ['small-time']});
        res.addColumnMeta(budgetT.cols.name, {displayLength: 7});
        tbl.forEach(function(row) {
            let mrow = row.unfreeze();
            console.log('row', row);
            mrow.set(COPY, null);
            res.addRow(mrow);
        });

        return columns.applyMeta(res);
    }, function(tbl) {
        console.log('TODO check permissions on setting someones budget, when creating and updating');
        let res = budgetsB.get().createEmpty();
        tbl.forEach(function(row) {
            let mrow = row.unfreeze();
            if (row.getMeta().doAdd) {
                mrow.set(budgetT.cols.name, 'Budget');
                mrow.set(budgetT.cols.createTime, new Date().getTime());
                mrow.set(budgetT.cols.period, PeriodType.weekly);
                mrow.set(budgetT.cols.userid, new aurora.db.PrimaryKey(userId));
                let entries = [];
                let pos = 0;
                templateB.get().forEach(function(row) {
                    let entry = {};
                    entry[entryT.cols.arrears.getName()] = '';
                    entry[entryT.cols.notes.getName()] = '';
                    entry[entryT.cols.owing.getName()] = '';
                    entry[entryT.cols.value.getName()] = '';
                    entry[entryT.cols.order.getName()] = pos++;
                    entry[entryT.cols.period.getName()] = null;
                    entry[entryT.cols.type.getName()] = row.get(templateT.cols.type);
                    entry[entryT.cols.description.getName()] = row.get(templateT.cols.description);
                    entries.push(entry);
                });
                mrow.set(budgetT.cols.entries, entries);

            }
            res.addRow(mrow);
        });
        budgetsB.set(res.freeze());

    }, budgetsB, templateB);

    this.widget_.attachStruct(budget.widgets.BudgetTemplate.createMovableSizable(formatedB, false));


};

/**
 * @return {Object<string,!Array<string>>}
 */
budget.widgets.BudgetList.getSearchParams = function() {
    let res = {};
    window.location.search.substring(1).split('&').forEach(function(item) {
        let parts = item.split('=');
        if (parts.length > 0) {
            let key = decodeURIComponent(parts[0]);
            res[key] = res[key] || [];
            res[key].push(decodeURIComponent(parts.slice(1).join('=')));
        }

    });
    return res;
};
/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.BudgetList.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.BudgetList.prototype.getComponent = function() {
    return this.widget_.getComponent();
};

/**
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.BudgetList.prototype.createSelected = function() {
    return this.widget_.createSelected();
};

