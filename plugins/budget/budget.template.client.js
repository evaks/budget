goog.provide('budget.widgets.BudgetTemplate');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableWidget');
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
budget.widgets.BudgetTemplate = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let templateT = aurora.db.schema.tables.base.budget_template;

    let html = new recoil.ui.HtmlHelper(scope);
    let srcB = scope.getDb().get(templateT.key);
    let lockB = frp.createB(true);
    let lockButton = new recoil.ui.widgets.ButtonWidget(scope);
    let unlockText = cd('i', {class:'fas fa-lock'});
    let lockText = cd('i', {class:'fas fa-lock-open'});
    
    lockButton.attachStruct({
        action: frp.createCallback(() => lockB.set(!lockB.get()), lockB),
        text: frp.liftB(v => v ?unlockText :  lockText, lockB)
    });
    
    let makePart = function(type) {
        let div = cd('div');
        let incomeWidget = new recoil.ui.widgets.table.TableWidget(scope);
        let filteredB = recoil.structs.table.Filter.createColFilterB(srcB, templateT.cols.type, function(v) {return v === type;});
        var columns = new recoil.ui.widgets.TableMetaData();
        columns.add(templateT.cols.description, '');
        let tableB = frp.liftBI(function(tbl, lock) {
            let res = tbl.unfreeze();
            if (lock) {
                res.addMeta({editable: false});
            }
            res.addMeta({headerRowDecorator: null});
            res.addColumnMeta(templateT.cols.description, {displayLength: 20});
            return columns.applyMeta(res);
        }, function(tbl) {
            let res = filteredB.get().createEmpty();
            let pos = 0;
            tbl.forEach(function(row) {
                let mrow = row.unfreeze();
                mrow.set(templateT.cols.type, type);
                mrow.set(templateT.cols.description, row.get(templateT.cols.description) || '');
                mrow.set(templateT.cols.order, pos++);
                res.addRow(mrow);
            });
            filteredB.set(res.freeze());
        }, filteredB, lockB);
        incomeWidget.attachStruct(aurora.ui.ErrorWidget.createTable(scope, aurora.widgets.TableWidget.createMovableSizable(tableB)));
        incomeWidget.getComponent().render(div);
        return {
            div: div
        };
    };
    let EntryType = aurora.db.schema.getEnum(templateT.cols.type);
    let household = makePart(EntryType.household);
    let debts = makePart(EntryType.debt);
    let income = makePart(EntryType.income);

    let lockDiv = cd('div', 'budget-admin-lock');
    lockButton.getComponent().render(lockDiv);
    
    let container = cd('div', {}, lockDiv, cd(
        'div', {class: 'budget-budget-template'},
        cd('div', {class: 'budget-budget-template-column'},
           cd('div', {class: 'group-header'}, 'Income'),
           cd('div', {class: 'field-name'}, income.div),
           cd('div', {class: 'group-header'}, 'Household Expenses'),
           cd('div', {class: 'field-name'}, household.div)
          ),
        cd('div', {class: 'budget-budget-template-column'},
           cd('div', {class: 'group-header'}, 'Debts Payable'),
           cd('td', {class: 'field-name'}, debts.div))
    ));

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.BudgetTemplate.prototype.getComponent = function() {
    return this.component_;
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.BudgetTemplate.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

