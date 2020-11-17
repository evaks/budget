goog.provide('budget.widgets.ClientView');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.messages');
goog.require('budget.WidgetScope');
goog.require('budget.widgets.Budget');
goog.require('budget.widgets.BudgetList');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.ClientView = function(scope) {
    let frp = scope.getFrp();
    let cd = goog.dom.createDom;
    let budgetDiv = cd('div');
    let budgetBodyDiv = cd('div', {});
    let profileBodyDiv = cd('div', {});
    let appointmentBodyDiv = cd('div', {}, 'Appointment');
    let bodyDiv = cd('div', {}, budgetBodyDiv, profileBodyDiv, appointmentBodyDiv);
    let profileDiv = cd('div', {}, 'View/Edit Profile');
    let budgetListWidget = new budget.widgets.BudgetList(scope);
    let budgetWidget = new budget.widgets.Budget(scope);
    let screenB = frp.createB('profile');
    let logic = recoil.frp.logic;
    let html = new recoil.ui.HtmlHelper(scope);
    let showProfileB = logic.equal('profile', screenB);
    html.show(budgetBodyDiv, logic.equal('budget', screenB));
    html.show(profileBodyDiv, showProfileB);
    html.class(profileDiv, recoil.frp.Chooser.if(showProfileB, 'recoil_table_selected', ''));
    budgetListWidget.getComponent().render(budgetDiv);
    budgetWidget.getComponent().render(budgetBodyDiv);
    let userId = parseInt(budget.widgets.BudgetList.getSearchParams()['id'][0], 10);

    let profileWidget = new budget.widgets.SignUp(scope, userId);
    profileWidget.getComponent().render(profileBodyDiv);
    let container = cd(
        'div', {class: 'side-list-page'},
        cd('div', {class: 'side-list-side'},
           cd('div', {}, cd('h2', {class: 'group-header'}, 'Profile'), profileDiv),
           cd('div', {}, cd('h2', {class: 'group-header'}, 'Appointments')),
           cd('div', {class: 'budget-budget-list'},
               cd('h2', {class: 'group-header'}, 'Budgets'),
               budgetDiv)
           ),
        cd('div', {class: 'side-list-body'}, bodyDiv),
    );

    let selectedBugdetB = budgetListWidget.createSelected();
    budgetWidget.attach(selectedBugdetB);

    var helper = new recoil.ui.WidgetHelper(scope, container, null, function() {
        let val = selectedBugdetB.get();
        if (val && val.length > 0) {
            screenB.set('budget');
        }
    });
    helper.attach(selectedBugdetB);

    goog.events.listen(profileDiv, goog.events.EventType.CLICK, frp.accessTransFunc(function() {
        screenB.set('profile');
        selectedBugdetB.set([]);
    }, screenB, selectedBugdetB));





    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.ClientView.prototype.getComponent = function() {
    return this.component_;
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.ClientView.prototype.flatten = recoil.frp.struct.NO_FLATTEN;



