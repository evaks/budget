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

goog.require('recoil.ui.widgets.LabelWidget');

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
    let budgetImportBodyDiv = cd('div', {class: 'budget-body-div'});
    let profileBodyDiv = cd('div', {class: 'profile-body-div'});
    let notesBodyDiv = cd('div', {class: 'notes-body-div'});
    let documentsBodyDiv = cd('div', {class: 'documents-body-div'});
    let appointmentDiv = cd('div', {class: 'appointment-div'});
    let appointmentBodyDiv = cd('div', {class: 'appointment-body-div'});
    let mess = budget.messages;
    let bodyDiv = cd('div', {class: 'body-div'}, budgetBodyDiv, budgetImportBodyDiv, profileBodyDiv, notesBodyDiv, documentsBodyDiv, appointmentBodyDiv);
    let notLoggedInDiv = cd('div', {class: 'not-logged-in'}, mess.NOT_LOGGED_IN.toString());
    let profileDiv = cd('div', {class: 'budget-edit-profile'}, aurora.messages.VIEW_EDIT_PROFILE.toString());
    let notesDiv = cd('div', {class: 'budget-edit-profile'}, mess.NOTES.toString());
    let documentsDiv = cd('div', {class: 'budget-edit-profile'}, mess.DOCUMENTS.toString());

    let appointmentListWidget = new budget.widgets.AppointmentList(scope);
    let budgetListWidget = new budget.widgets.BudgetList(scope);
    let budgetWidget = new budget.widgets.Budget(scope);
    let budgetImportWidget = new budget.widgets.import.Wizard(scope);
    let screenB = recoil.ui.frp.LocalBehaviour.create(frp, '1', 'budget.client.menu.screen', 'profile', localStorage);
    let importCompleteE = budgetImportWidget.getFinishedE().debug('import complete ********************************');

    let logic = recoil.frp.logic;
    let html = new recoil.ui.HtmlHelper(scope);
    let showProfileB = logic.equal('profile', screenB);
    let showNotesB = logic.equal('notes', screenB);
    let showDocumentsB = logic.equal('documents', screenB);
    let showAppointmentsB = logic.equal('appointment', screenB);

    let arrow = cd('span', {},'«');
    let secContextB = aurora.permissions.getContext(scope);
    let collapsedB = recoil.ui.frp.LocalBehaviour.create(frp, '1', 'budget.client.menu.collapsed', false, localStorage);
    let usernameDiv = cd('div', {});
    let sideBarControl = cd('div', {class: 'side-bar-control goog-css3-toggle-button'}, arrow);
    let slideMenuControl = cd('div', {class: 'slide-menu-control'}, usernameDiv, sideBarControl);

    html.innerText(arrow, frp.liftB(function(v) { return v ? '»' : '«';}, collapsedB));
    html.show(usernameDiv, logic.not(collapsedB));
    html.class(slideMenuControl, recoil.frp.Chooser.if(collapsedB, 'slide-menu-control-collapse', 'slide-menu-control'));

    html.show(profileBodyDiv, showProfileB);
    html.show(notesBodyDiv, showNotesB);
    html.show(documentsBodyDiv, showDocumentsB);
    html.show(appointmentBodyDiv, showAppointmentsB);

    html.class(profileDiv, recoil.frp.Chooser.if(showProfileB, 'recoil_table_selected budget-edit-profile', 'budget-edit-profile'));
    html.class(notesDiv, recoil.frp.Chooser.if(showNotesB, 'recoil_table_selected budget-edit-profile', 'budget-edit-profile'));
    html.class(documentsDiv, recoil.frp.Chooser.if(showDocumentsB, 'recoil_table_selected budget-edit-profile', 'budget-edit-profile'));

    appointmentListWidget.getComponent().render(appointmentDiv);
    budgetListWidget.getComponent().render(budgetDiv);
    budgetWidget.getComponent().render(budgetBodyDiv);
    budgetImportWidget.getComponent().render(budgetImportBodyDiv);


    let idStr = budget.widgets.BudgetList.getUserId();
    let userId = budget.widgets.BudgetList.getUserId();

    let sideControlEnable = new goog.ui.ToggleButton('');

    sideControlEnable.decorate(sideBarControl);

    let profileWidget = new budget.widgets.SignUp(scope, userId);
    profileWidget.getComponent().render(profileBodyDiv);

    let notesWidget = new budget.widgets.Notes(scope, userId);
    let documentsWidget = new budget.widgets.Documents(scope, userId);
    notesWidget.getComponent().render(notesBodyDiv);
    documentsWidget.getComponent().render(documentsBodyDiv);

    let appointmentWidget = new budget.widgets.BusinessHours(scope, 'client', userId);
    appointmentWidget.getComponent().render(appointmentBodyDiv);

    appointmentListWidget.attachStartDate(appointmentWidget.getStartDateB());

    let sideGroupsContainer =
        cd('div', {class: 'side-groups-container'},
           cd('div', {}, cd('h2', {class: 'group-header'}, aurora.messages.PROFILE.toString()),
              profileDiv, notesDiv, documentsDiv),
           cd('div', {class: 'appointments-list'},
              cd('h2', {class: 'group-header'}, aurora.messages.APPOINTMENTS.toString()), appointmentDiv),
           cd('div', {class: 'budget-budget-list'},
              cd('h2', {class: 'group-header'}, aurora.messages.BUDGETS.toString()),
              budgetDiv));

    let query = new recoil.db.Query();

    let userT = aurora.db.schema.tables.base.user;
    let userTblB = scope.getDb().get(userT.key, query.eq(userT.cols.id, query.val(userId)));

    let nameB = frp.liftB(function(tbl) {
        let name = { name: '', uname: ''};

        tbl.forEach(function(row) {

            if (row.get(userT.cols.firstName) !== null) {
                name.name = row.get(userT.cols.firstName);
            }

            name.uname = row.get(userT.cols.username);
        });
        return name;

    }, userTblB);


    let usernameLabel = new recoil.ui.widgets.LabelWidget(scope);

    usernameLabel.attachStruct({name: nameB, classes: ['slide-menu-name-container'], formatter: function(v) {
        return cd('div', {class: 'slide-menu-firstname truncate'}, v.name, cd('div', {class: 'slide-menu-username truncate'}, v.uname));
    }});

    usernameLabel.getComponent().render(usernameDiv);



    let sidePanel = cd('div', {class: 'side-list-side'},
                       slideMenuControl, sideGroupsContainer);

    html.enableClass(sidePanel, 'side-small', collapsedB);
    let contentPanel = cd('div', {class: 'side-list-body'}, bodyDiv);

    let container = cd('div', {class: 'side-list-page'}, sidePanel,
                       contentPanel, notLoggedInDiv);

    let selectedBudgetB = budgetListWidget.createSelected();
    let selectedApptB = appointmentListWidget.createSelected();
    let importSelectedB = frp.liftB(function(sel) {
        return sel && sel.length === 1 && sel[0] && sel[0][0] === null;
    }, selectedBudgetB);

    let importHelper = new recoil.ui.WidgetHelper(scope, container, null, function() {
        let complete = importCompleteE.get();
        if (selectedBudgetB.good() && complete.length > 0) {
            selectedBudgetB.set([complete[0]]);
            console.log('imported', complete, selectedBudgetB.get());
        }
    });
    importHelper.attach(importCompleteE, selectedBudgetB);
    html.show(budgetBodyDiv, logic.and(logic.equal('budget', screenB), logic.not(importSelectedB)));
    html.show(budgetImportBodyDiv, logic.and(logic.equal('budget', screenB), importSelectedB));
    budgetWidget.attach(selectedBudgetB);
    appointmentWidget.attach(selectedApptB);

    var helper = new recoil.ui.WidgetHelper(scope, container, null, function() {
        let val = selectedBudgetB.get();
        if (val && val.length > 0) {
            screenB.set('budget');
        }
        let hasPerm = secContextB.good() && aurora.permissions.loggedIn(true)(secContextB.get());
        goog.style.setElementShown(sidePanel, hasPerm);
        goog.style.setElementShown(contentPanel, hasPerm);
        goog.style.setElementShown(notLoggedInDiv, secContextB.good() && !hasPerm);

    });
    helper.attach(selectedBudgetB, screenB, secContextB);

    let setScreen = function(screen) {
        return frp.accessTransFunc(function() {
            screenB.set(screen);
            selectedBudgetB.set([]);
            selectedApptB.set([]);
        }, screenB, selectedBudgetB, selectedApptB);
    };
    goog.events.listen(profileDiv, goog.events.EventType.CLICK, setScreen('profile'));
    goog.events.listen(notesDiv, goog.events.EventType.CLICK, setScreen('notes'));
    goog.events.listen(documentsDiv, goog.events.EventType.CLICK, setScreen('documents'));
    goog.events.listen(appointmentDiv, goog.events.EventType.CLICK, setScreen('appointment'));

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



