goog.provide('budget.widgets.ClientView');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.messages');
goog.require('budget.WidgetScope');
goog.require('budget.widgets.Budget');
goog.require('budget.widgets.BudgetList');

goog.require('goog.ui.Css3ButtonRenderer');
goog.require('goog.ui.CustomButton');
goog.require('goog.ui.ToggleButton');
goog.require('goog.ui.decorate');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.ClientView = function(scope) {
    let frp = scope.getFrp();
    let cd = goog.dom.createDom;
    let budgetDiv = cd('div', {class: 'budget-div'});
    let budgetBodyDiv = cd('div', {class: 'budget-body-div'});
    let profileBodyDiv = cd('div', {class: 'profile-body-div'});
    let notesBodyDiv = cd('div', {class: 'notes-body-div'});
    let documentsBodyDiv = cd('div', {class: 'documents-body-div'});
    let appointmentBodyDiv = cd('div', {});
    let mess = budget.messages;
    let bodyDiv = cd('div', {class: 'body-div'}, budgetBodyDiv, profileBodyDiv, notesBodyDiv, documentsBodyDiv, appointmentBodyDiv);
    let profileDiv = cd('div', {class: 'budget-edit-profile'}, aurora.messages.VIEW_EDIT_PROFILE.toString());
    let notesDiv = cd('div', {class: 'budget-edit-profile'}, mess.NOTES.toString());
    let documentsDiv = cd('div', {class: 'budget-edit-profile'}, mess.DOCUMENTS.toString());
    let budgetListWidget = new budget.widgets.BudgetList(scope);
    let budgetWidget = new budget.widgets.Budget(scope);
    let screenB = recoil.ui.frp.LocalBehaviour.create(frp, '1', 'budget.client.menu.screen', 'profile', localStorage);
    let logic = recoil.frp.logic;
    let html = new recoil.ui.HtmlHelper(scope);
    let showProfileB = logic.equal('profile', screenB);
    let showNotesB = logic.equal('notes', screenB);
    let showDocumentsB = logic.equal('documents', screenB);
    let arrow = cd('span', {},'«');

    let collapsedB = recoil.ui.frp.LocalBehaviour.create(frp, '1', 'budget.client.menu.collapsed', false, localStorage);

    html.innerText(arrow, frp.liftB(function(v) { return v ? '»' : '«';}, collapsedB));
    html.show(budgetBodyDiv, logic.equal('budget', screenB));
    html.show(profileBodyDiv, showProfileB);
    html.show(notesBodyDiv, showNotesB);
    html.show(documentsBodyDiv, showDocumentsB);
    html.class(profileDiv, recoil.frp.Chooser.if(showProfileB, 'recoil_table_selected budget-edit-profile', 'budget-edit-profile'));
    html.class(notesDiv, recoil.frp.Chooser.if(showNotesB, 'recoil_table_selected budget-edit-profile', 'budget-edit-profile'));
    html.class(documentsDiv, recoil.frp.Chooser.if(showDocumentsB, 'recoil_table_selected budget-edit-profile', 'budget-edit-profile'));
    budgetListWidget.getComponent().render(budgetDiv);
    budgetWidget.getComponent().render(budgetBodyDiv);
    let idStr = budget.widgets.BudgetList.getUserId();
    let userId = budget.widgets.BudgetList.getUserId();

    let sideControlEnable = new goog.ui.ToggleButton('');
    let sideBarControl = cd('div', {class: 'side-bar-control goog-css3-toggle-button'}, arrow);
    sideControlEnable.decorate(sideBarControl);

    let profileWidget = new budget.widgets.SignUp(scope, userId);
    profileWidget.getComponent().render(profileBodyDiv);

    let notesWidget = new budget.widgets.Notes(scope, userId);
    let documentsWidget = new budget.widgets.Documents(scope, userId);
    notesWidget.getComponent().render(notesBodyDiv);
    documentsWidget.getComponent().render(documentsBodyDiv);

    let sideGroupsContainer =
        cd('div', {class: 'side-groups-container'},
           cd('div', {}, cd('h2', {class: 'group-header'}, aurora.messages.PROFILE.toString()), profileDiv, notesDiv, documentsDiv),
           cd('div', {}, cd('h2', {class: 'group-header'}, aurora.messages.APPOINTMENTS.toString())),
           cd('div', {class: 'budget-budget-list'},
              cd('h2', {class: 'group-header'}, aurora.messages.BUDGETS.toString()),
              budgetDiv));

    let sidePanel = cd('div', {class: 'side-list-side'},
                       cd('div', {class: 'slide-menu-control'},
                          sideBarControl), sideGroupsContainer);

    html.enableClass(sidePanel, 'side-small', collapsedB);

    let container = cd('div', {class: 'side-list-page'}, sidePanel,
                       cd('div', {class: 'side-list-body'}, bodyDiv));

    let selectedBugdetB = budgetListWidget.createSelected();
    budgetWidget.attach(selectedBugdetB);

    var helper = new recoil.ui.WidgetHelper(scope, container, null, function() {
        let val = selectedBugdetB.get();
        if (val && val.length > 0) {
            screenB.set('budget');
        }
    });
    helper.attach(selectedBugdetB, screenB);

    let setScreen = function(screen) {
        return frp.accessTransFunc(function() {
            screenB.set(screen);
            selectedBugdetB.set([]);
        }, screenB, selectedBugdetB);
    };
    goog.events.listen(profileDiv, goog.events.EventType.CLICK, setScreen('profile'));
    goog.events.listen(notesDiv, goog.events.EventType.CLICK, setScreen('notes'));
    goog.events.listen(documentsDiv, goog.events.EventType.CLICK, setScreen('documents'));

    sideControlEnable.setDispatchTransitionEvents(goog.ui.Component.State.ALL, true);
    goog.events.listen(
        sideControlEnable, goog.ui.Component.EventType.ACTION,
        frp.accessTransFunc(function() {
            collapsedB.set(!collapsedB.get());
        }, collapsedB)
    );

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



