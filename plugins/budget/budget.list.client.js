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
    let cd = goog.dom.createDom;
    let importDiv = cd('div', {class: 'budget-import-menu'});
    let container = cd('div', {}, importDiv);
    let html = new recoil.ui.HtmlHelper(scope);

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

    let userId = budget.widgets.BudgetList.getUserId();
    let query = new recoil.db.Query();

    this.scope_ = scope;
    let budgetsB = scope.getDb().get(budgetT.key, query.eq(query.val(userId), budgetT.cols.userid));
    let templateB = scope.getDb().get(templateT.key);
    let frp = scope.getFrp();
    let converter = new aurora.ui.coverters.LocaleDateConverter();

    html.show(importDiv, frp.liftB(function (b) {
        return b.getMeta().editable !== false;
    }, budgetsB));
    const COPY = new recoil.structs.table.ColumnKey('copy');
    this.import_ = new recoil.ui.widgets.table.TableWidget(scope);
    this.import_.getComponent().render(importDiv);

    this.widget_ = new recoil.ui.widgets.table.TableWidget(scope);
    this.widget_.getComponent().render(container);

    let importB = frp.liftB(function(tbl) {
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(budgetT.cols.name, 'Name');

        let res = tbl.createEmpty();
        res.addMeta({headerRowDecorator: null, confirmDelete: 5000, editable: false});
        res.addColumnMeta(budgetT.cols.name, {editable: false, displayLength: -1});
        let row = new recoil.structs.table.MutableTableRow();
        tbl.getOtherColumns().forEach(c => row.set(c, null));
        row.set(budgetT.cols.name, 'Import');
        row.set(budgetT.cols.id, null);
        res.addRow(row);

        return columns.applyMeta(res);
    }, budgetsB);
    this.importB_ = importB;
    this.import_.attachStruct(importB);
    let reselect = function(key, row, pks) {
        console.log('existing lookup', key, 'in', pks);
        if (key && key.length === 1 && pks && pks.length === 1) {
            return pks[0].mem === key[0].mem;
        }
        return false;
    };
    let formatedB = frp.liftBI(function(tbl) {
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(budgetT.cols.name, 'Name');
        columns.add(budgetT.cols.createTime, 'Created');
        let res = tbl.createEmpty([], [COPY]);
        res.addMeta({
            headerRowDecorator: null, confirmDelete: 5000,
            reselector: reselect
        });
        res.addColumnMeta(budgetT.cols.createTime, {editable: false, converter: converter, classes: ['small-time']});
        res.addColumnMeta(budgetT.cols.name, {displayLength: 7});
        tbl.forEach(function(row) {
            let mrow = row.unfreeze();
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
                budget.widgets.BudgetList.createEmptyBudget(userId, mrow, templateB.get());
            }
            else if (row.getMeta().doCopy) {
                mrow.set(budgetT.cols.name, row.get(budgetT.cols.name) + '-Copy');
                mrow.set(budgetT.cols.createTime, new Date().getTime());
            }
            res.addRow(mrow);
        });
        budgetsB.set(res.freeze());

    }, budgetsB, templateB);

    this.widget_.attachStruct(aurora.widgets.TableWidget.createSizable(formatedB, true));
};
/**
 * @param {number} userId
 * @param {?recoil.structs.table.MutableTableRow} row
 * @param {!recoil.structs.table.Table} template
 * @return {!recoil.structs.table.MutableTableRow}
 */
budget.widgets.BudgetList.createEmptyBudget = function(userId, row, template) {
    const budgetT = aurora.db.schema.tables.base.budget;
    let templateT = aurora.db.schema.tables.base.budget_template;
    const entryT = budgetT.entries;
    let PeriodType = aurora.db.schema.getEnum(budgetT.cols.period);
    let mrow = row || new recoil.structs.table.MutableTableRow();
    mrow.set(budgetT.cols.name, 'Budget');
    mrow.set(budgetT.cols.createTime, new Date().getTime());
    mrow.set(budgetT.cols.period, PeriodType.weekly);
    mrow.set(budgetT.cols.userid, new aurora.db.PrimaryKey(userId));
    let entries = [];
    let pos = 0;
    template.forEach(function(row) {
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
    return mrow;
};
/**
 * @return {number}
 */
budget.widgets.BudgetList.getUserId = function() {
    let idStr = budget.widgets.BudgetList.getSearchParams()['id'];
    return parseInt(idStr == undefined ? (goog.net.cookies.get('userid') || '0') : idStr[0], 10);
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
    return this.component_;
};

/**
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.BudgetList.prototype.createSelected = function() {
    let selectedBudget = this.widget_.createSelected();
    let selectedImport = this.import_.createSelected();
    let frp = this.scope_.getFrp();
    return frp.liftBI(function(budget, selImport, budgetChanges, importChanges) {
        console.log('changes', budgetChanges, importChanges);
        // we we have non empty selection changes
        let nonEmpty = (a, v) => a || v.length > 0;
        if (budgetChanges.reduce(nonEmpty, false)) {
            selectedImport.set([]);
            return budget;
        }

        // we we have non empty selection changes
        if (importChanges.reduce(nonEmpty, false)) {
            selectedBudget.set([]);
            return selImport;
        }
        return budget.length > 0 ? budget : selImport;
    }, function(v) {
        selectedImport.set(v.filter(x => x === null));
        selectedBudget.set(v.filter(x => x !== null));
    }, selectedBudget, selectedImport, frp.changesE(selectedBudget), frp.changesE(selectedImport));
};

