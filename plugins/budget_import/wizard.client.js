goog.provide('budget.widgets.import.Wizard');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableWidget');
goog.require('budget.ImportRow');
goog.require('budget.widgets.Wizard');
goog.require('recoil.frp.logic');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.import.Wizard = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let dateContainer = cd('div', {});
    let posB = frp.createB(0);
    let userId = budget.widgets.BudgetList.getUserId();
    let rows = {};
    let dateRangeBs = [frp.createB(null), frp.createB(null)];
    let overridesB = frp.createB({});
    let html = new recoil.ui.HtmlHelper(scope);
    const budgetT = aurora.db.schema.tables.base.budget;
    const templateT = aurora.db.schema.tables.base.budget_template;

    const makeNewBudget = (template) => {
        let budgetTbl = aurora.db.Helper.createEmptyTable(budgetT).unfreeze();
        budgetTbl.addRow(budget.widgets.BudgetList.createEmptyBudget(userId, null, template));
        return budgetTbl.freeze();
    };
    let toDate = recoil.ui.widgets.DateWidget2.convertLocaleDate;
    let curMappingsB = frp.createB(null);
    let categoryInfoB = frp.createB(null);
    let screensFactories = [
        (function() {
            let validateB;
            let fileWidget = new budget.widgets.import.FileWidget(scope);
            return {
                create: function(container, old) {
                    if (old) {
                        container.appendChild(old);
                    }
                    else {
                        fileWidget.getComponent().render(container);
                        validateB = fileWidget.getValidateB();

                    }
                    return validateB;
                },
                reset() {
                    fileWidget = new budget.widgets.import.FileWidget(scope);
                    rows = {};
                    frp.accessTrans(() => overridesB.set({}), overridesB);
                },
                next() {
                    let info = fileWidget.getRows();
                    rows = info.rows;
                    dateRangeBs[0].set(info.start);
                    dateRangeBs[1].set(info.stop);
                    frp.accessTrans(() => curMappingsB.set(null), curMappingsB);
                },
                dependants: dateRangeBs

            };
        })(),
        (function() {
            let query = new recoil.db.Query();
            let storedT = aurora.db.schema.tables.base.budget_mappings;
            let storedMappingsB = scope.getDb().get(
                storedT.key, query.eq(storedT.cols.userid, query.val(userId)));
            let templateB = scope.getDb().get(templateT.key);
            let doneCallbackB;
            let allBudgetsB = scope.getDb().get(budgetT.key, query.eq(query.val(userId), budgetT.cols.userid));
            let mappingsB = null;


            let mappingsSourceB = frp.liftBI((store, mappings) =>  {

                if (store) {
                    return store;
                }
                return budget.widgets.BudgetImportCategory.createDefaultMappings(rows, storedMappingsB.get());
            }, (v) => curMappingsB.set(v), curMappingsB, storedMappingsB);
                                             


            
            return {
                create: function(container, old, finishedB) {

                    let budgetStoreB = frp.createB(null);
                    
                    let budgetB = frp.liftBI(function(store, template) {
                        if (store) {
                            return store;
                        }
                         return makeNewBudget(template);
                     }, function(v) {
                         budgetStoreB.set(v);
                     }, budgetStoreB, templateB);
                    
                    let widget = new budget.widgets.BudgetImportCategory(scope);
                    
                    widget.getComponent().render(container);
                    widget.attach(mappingsSourceB, budgetB, storedMappingsB, dateRangeBs);
                    mappingsB = widget.getCategories();

                    doneCallbackB = widget.createCallbackB(storedMappingsB, allBudgetsB, finishedB);
                    // make validate depend on done callback because it is needed to be done
                    return frp.liftB(x => x, widget.createValidateB(), doneCallbackB);
                },reset() {

                },  
                next: function() {
                    return {mappings: mappingsB, doneCallbackB};
                },
                dependants: [storedMappingsB, templateB, categoryInfoB, curMappingsB]

            };

        })(), (function () {
            let doneCallbackB = null;
            let templateB = scope.getDb().get(templateT.key);            
            let validateB = frp.createB(recoil.ui.BoolWithExplanation.TRUE);
            const ReviewBudget = budget.widgets.import.ReviewBudget;
            let categoriesB;
            return {
                create: function (container, old, finishedB, lastScreen) {
                    doneCallbackB = lastScreen.doneCallbackB;
                    let widget = new ReviewBudget(scope);


                    widget.getComponent().render(container);

                    widget.attach(lastScreen.mappings, overridesB, dateRangeBs[0], dateRangeBs[1]);
                    categoriesB = lastScreen.mappings;
                    return frp.liftB(x => x, validateB, doneCallbackB, categoriesB, dateRangeBs[0], dateRangeBs[1], templateB, overridesB);
                },
                next: function () {
                    frp.accessTrans(function() {
                        let start = dateRangeBs[0].get();
                        let end =  dateRangeBs[1].get();
                        let budget = makeNewBudget(templateB.get());

                        let days = Math.abs(moment(toDate(end)).diff(toDate(start), 'd')) + 1; // range is inclusive s
                        let entries = ReviewBudget.createBudgetEntries(budget, categoriesB.get(), days, overridesB.get());
                        doneCallbackB.set(entries);
                    }, doneCallbackB, categoriesB, dateRangeBs[0], dateRangeBs[1], templateB, overridesB);
                    
                },
                dependants: [templateB, overridesB]                    
            };
            
        })()

    ];
    this.wizard_ = new budget.widgets.Wizard(scope, screensFactories);

};

/**
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.import.Wizard.prototype.getFinishedE = function() {
    return this.wizard_.getFinishedE();
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.import.Wizard.prototype.getComponent = function() {
    return this.wizard_.getComponent();
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.import.Wizard.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

