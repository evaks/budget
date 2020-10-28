goog.provide('budget.widgets.Budget');


goog.require('aurora.db.schema.tables.base.user');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('recoil.frp.logic');
goog.require('recoil.structs.table.Filter');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');
goog.require('recoil.ui.widgets.table.TableWidget');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Budget = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;

    let html = new recoil.ui.HtmlHelper(scope);

    let makePart = function() {
        let div = cd('div');
        let incomeWidget = new recoil.ui.widgets.table.TableWidget(scope);
        incomeWidget.getComponent().render(div);
        return {
            widget: incomeWidget,
            div: div
        };
    };
    let household = makePart();
    let debts = makePart();
    let income = makePart();
    let periodDiv = cd('div', 'goog-inline-block');
    this.incomeWidget_ = income.widget;
    this.householdWidget_ = household.widget;
    this.debtWidget_ = debts.widget;
    this.periodWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.periodWidget_.getComponent().render(periodDiv);

    let container = cd(
        'div', {class: 'budget-budget'},
        cd('div', {class: 'budget-header'}, 'Hutt City Budget and Advocacy Service'),
        cd('div', {class: 'budget-subheader'}, 'Ph: 04 5666357'),

        cd('div', {class: 'budget-subheader'}, periodDiv, ' Budget'),
        cd('div', {class: 'budget-budget-template'},
           cd('div', {class: 'budget-budget-template-column'},
              cd('div', {class: 'group-header'}, 'Income'),
              cd('div', {class: 'field-name'}, income.div),
              cd('div', {class: 'group-header'}, 'Household Expenses'),
              cd('div', {class: 'field-name'}, household.div)
             ),
           cd('div', {class: 'budget-budget-template-column'},
              cd('div', {class: 'group-header'}, 'Debts Payable'),
              cd('td', {class: 'field-name'}, debts.div))
          )
    );

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};



/**
 * @param {!recoil.frp.Behaviour<number>} idB
 */
budget.widgets.Budget.prototype.attach = function(idB) {
    let frp = this.scope_.getFrp();
    let scope = this.scope_;
    let budgetT = aurora.db.schema.tables.base.budget;
    let entryT = budgetT.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let notReady = frp.createNotReadyB();
    let budgetB = frp.switchB(frp.liftB(function(id) {
        if (id.length < 1) {
            return notReady;
        }
        let query = new recoil.db.Query();
        return scope.getDb().get(budgetT.key, query.eq(budgetT.cols.id, query.val(id[0][0].db)));
    }, idB));
    let periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);
    let CALC = new recoil.structs.table.ColumnKey('calc');
    let periodB = frp.liftBI(function(budget) {
        let res = goog.object.clone(budget.getColumnMeta(budgetT.cols.period));
        budget.forEach(function(row) {
            res.value = row.get(budgetT.cols.period);
        });
        return res;
    }, function(period) {
        let res = budgetB.get().createEmpty();
        budgetB.get().forEachModify(function(row) {
            row.set(budgetT.cols.period, period.value);
            res.addRow(row);
        });

        budgetB.set(res.freeze());
    }, budgetB);
    this.periodWidget_.attachStruct(periodB);

    let partTable = function(srcB, type) {
        let filteredB = recoil.structs.table.Filter.createColFilterB(srcB, entryT.cols.type, function(v) {return v === type;});

        let tableB = frp.liftBI(function(tbl, period) {
            var columns = new recoil.ui.widgets.TableMetaData();
            columns.add(entryT.cols.description, '');
            if (type === EntryType.debt) {
                columns.add(entryT.cols.notes, 'Notes');

            }
            columns.add(entryT.cols.value, 'Value');
            columns.add(entryT.cols.period, 'Payment Period');
            columns.add(CALC, periodMeta.enumDisplay.resolve(period.value));

            let res = tbl.createEmpty([], [CALC]);
            res.addColumnMeta(entryT.cols.description, {displayLength: 20});
            res.addColumnMeta(entryT.cols.notes, {displayLength: 15});
            res.addColumnMeta(entryT.cols.value, {displayLength: 5});
            res.addColumnMeta(CALC, {editable: false, type: 'number', displayLength: 5, step: 0.01});
            tbl.forEach(function(row) {
                let mrow = row.unfreeze();
                let value = row.get(entryT.cols.value);
                let period = row.get(entryT.cols.period);
                if (value && value.trim().length > 0) {
                    mrow.set(CALC, 10);
                }
                else {
                    mrow.set(CALC, null);
                }
                res.addRow(mrow);
            });
            return columns.applyMeta(res);
        }, function(tbl) {
            let res = filteredB.get().createEmpty();
            let pos = 0;
            tbl.forEach(function(row) {
                let mrow = row.unfreeze();
                mrow.set(entryT.cols.type, type);
                mrow.set(entryT.cols.description, row.get(entryT.cols.description) || '');
                mrow.set(entryT.cols.order, pos++);
                res.addRow(mrow);
            });
            filteredB.set(res.freeze());
        }, filteredB, periodB);
        return aurora.ui.ErrorWidget.createTable(scope, budget.widgets.BudgetTemplate.createMovableSizable(tableB));
    };
    let entriesB = budget.Client.instance.createSubTableB(budgetB, frp.createB(/** @type{Array} */(null)), budgetT.cols.entries);

    this.incomeWidget_.attachStruct(partTable(entriesB, EntryType.income));
    this.householdWidget_.attachStruct(partTable(entriesB, EntryType.household));
    this.debtWidget_.attachStruct(partTable(entriesB, EntryType.debt));
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Budget.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Budget.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

