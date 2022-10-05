goog.provide('budget.widgets.import.Wizard');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableWidget');
goog.require('budget.ImportRow');
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
    this.finishedB_ = frp.createE();
    let bodyContainer = cd('div', {class: 'budget-import-wizard-body'});
    let prevContainer = cd('div', {});
    let messageContainer = cd('div', {class: 'budget-import-wizard-message'});
    let buttonContainer = cd('div', {class: 'budget-import-wizard-buttons'}, prevContainer);
    let dateContainer = cd('div', {});
    let container = cd('div', {}, dateContainer, bodyContainer, buttonContainer);
    let posB = frp.createB(0);
    let nextEnabledBB = frp.createNotReadyB();
    let userId = budget.widgets.BudgetList.getUserId();
    let rows = {};
    let dateRangeBs = [frp.createB(null), frp.createB(null)];
    let html = new recoil.ui.HtmlHelper(scope);

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
                        fileWidget.getComponent().render(bodyContainer);
                        validateB = fileWidget.getValidateB();

                    }
                    return validateB;
                },
                reset() {
                    fileWidget = new budget.widgets.import.FileWidget(scope);
                    rows = {};
                },
                next() {
                    let info = fileWidget.getRows();
                    rows = info.rows;
                    dateRangeBs[0].set(info.start);
                    dateRangeBs[1].set(info.stop);
                },
                dependants: dateRangeBs

            };
        })(),
        (function() {
            let query = new recoil.db.Query();
            let storedT = aurora.db.schema.tables.base.budget_mappings;
            const budgetT = aurora.db.schema.tables.base.budget;
            const templateT = aurora.db.schema.tables.base.budget_template;
            let storedMappingsB = scope.getDb().get(
                storedT.key, query.eq(storedT.cols.userid, query.val(userId))).debug("stored");
            let templateB = scope.getDb().get(templateT.key);
            let doneCallbackB;
            let allBudgetsB = scope.getDb().get(budgetT.key, query.eq(query.val(userId), budgetT.cols.userid));

            return {
                create: function(container, old, finishedB) {


                    let budgetStoreB = frp.createB(null);

                    let budgetB = frp.liftBI(function(store, template) {
                        if (store) {
                            return store;
                        }
                        let budgetTbl = aurora.db.Helper.createEmptyTable(budgetT).unfreeze();
                        budgetTbl.addRow(budget.widgets.BudgetList.createEmptyBudget(userId, null, template));
                        return budgetTbl.freeze();
                    }, function(v) {
                        budgetStoreB.set(v);
                    }, budgetStoreB, templateB);

                    let widget = new budget.widgets.BudgetImportCategory(scope);
                    let mappingsSourceB = widget.createDefaultMappings(rows, storedMappingsB.get());

                    widget.getComponent().render(container);
                    widget.attach(mappingsSourceB, budgetB, storedMappingsB, dateRangeBs);
                    doneCallbackB = widget.createCallbackB(storedMappingsB, allBudgetsB, finishedB);
                    // make validate depend on done callback because it is needed to be done
                    return frp.liftB(x => x, widget.createValidateB(), doneCallbackB);
                },
                next: function() {
                    frp.accessTrans(function() {
                        doneCallbackB.set(true);
                    }, doneCallbackB);
                },
                dependants: [storedMappingsB, templateB]

            };

        })()

    ];
    let nextTextB = frp.liftB(function(pos) {
        if (pos + 1 < screensFactories.length) {
            return recoil.ui.messages.NEXT.toString();
        }
        return recoil.ui.messages.FINISH.toString();
    }, posB);
    html.show(prevContainer, recoil.frp.logic.gt(posB, 0));
    let hiddenScreens = screensFactories.map(x => null);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
    let screenHelper = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, function() {});
    let dependants = screensFactories.reduce((a, v) => a.concat(v.dependants || []), []);
    let me = this;
    let moveScreen = function(dir) {
        return function() {
            let pos = posB.get();
            let next = pos + dir;
            if (next <= screensFactories.length && next >= 0) {

                if (dir > 0) {
                    frp.accessTrans.apply(frp, [function() {
                        screensFactories[pos].next();
                    }].concat(dependants));
                }
                if (next === screensFactories.length) {
                    // finish action next is the start, however we need to inform
                    screensFactories.forEach(f => f.reset && f.reset());
                    hiddenScreens = screensFactories.map(x => null);
                    next = 0;
                }
                hiddenScreens[pos] = bodyContainer.firstChild;
                goog.dom.removeChildren(bodyContainer);

                pos = next;
                nextEnabledBB.set(screensFactories[pos].create(bodyContainer, hiddenScreens[pos], me.finishedB_));
                hiddenScreens[pos] = null;
                posB.set(pos);
            }
        };
    };
    let nextActionB = frp.createCallback.apply(frp, [moveScreen(1), posB, nextEnabledBB, me.finishedB_].concat(dependants));
    let prevActionB = frp.createCallback(moveScreen(-1), posB, nextEnabledBB);

    frp.accessTrans(function() {
        nextEnabledBB.set(screensFactories[0].create(bodyContainer, null, me.finishedB_));
    }, posB, nextEnabledBB);

    let nextEnabledB = frp.switchB(nextEnabledBB);
    this.nextWidget_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.previousWidget_ = new recoil.ui.widgets.ButtonWidget(scope);

    this.nextWidget_.attachStruct({
        action: nextActionB,
        enabled: nextEnabledB,
        text: nextTextB});
    this.previousWidget_.attachStruct({
        action: prevActionB,
        text: recoil.ui.messages.PREVIOUS.toString()});

    html.enableClass(messageContainer, 'error',
                     recoil.frp.logic.not(recoil.ui.BoolWithExplanation.toBool(nextEnabledB)));
    html.innerText(messageContainer, recoil.ui.BoolWithExplanation.toString(nextEnabledB));
    this.previousWidget_.getComponent().render(prevContainer);
    buttonContainer.appendChild(messageContainer);
    this.nextWidget_.getComponent().render(buttonContainer);

};

/**
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.import.Wizard.prototype.getFinishedE = function() {
    return this.finishedB_;
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.import.Wizard.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.import.Wizard.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

