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
    let profileBodyDiv = cd('div', {class: 'profile-body-div'});
    let notesBodyDiv = cd('div', {class: 'notes-body-div'});
    let documentsBodyDiv = cd('div', {class: 'documents-body-div'});
    let appointmentBodyDiv = cd('div', {});
    let mess = budget.messages;
    let bodyDiv = cd('div', {class: 'body-div'}, budgetBodyDiv, profileBodyDiv, notesBodyDiv, documentsBodyDiv, appointmentBodyDiv);
    let notLoggedInDiv = cd('div', {class: 'not-logged-in'}, mess.NOT_LOGGED_IN.toString());
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
    let secContextB = aurora.permissions.getContext(scope);
    let collapsedB = recoil.ui.frp.LocalBehaviour.create(frp, '1', 'budget.client.menu.collapsed', false, localStorage);
    let usernameDiv = cd('div', {});
    let sideBarControl = cd('div', {class: 'side-bar-control goog-css3-toggle-button'}, arrow);
    let slideMenuControl = cd('div', {class: 'slide-menu-control'}, usernameDiv, sideBarControl);

    html.innerText(arrow, frp.liftB(function(v) { return v ? '»' : '«';}, collapsedB));
    html.show(usernameDiv, logic.not(collapsedB));
    html.class(slideMenuControl, recoil.frp.Chooser.if(collapsedB, 'slide-menu-control-collapse', 'slide-menu-control'));

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

    let selectedBugdetB = budgetListWidget.createSelected();
    budgetWidget.attach(selectedBugdetB);

    var helper = new recoil.ui.WidgetHelper(scope, container, null, function() {
        let val = selectedBugdetB.get();
        if (val && val.length > 0) {
            screenB.set('budget');
        }
        let hasPerm = secContextB.good() && aurora.permissions.loggedIn(true)(secContextB.get());
        goog.style.setElementShown(sidePanel, hasPerm);
        goog.style.setElementShown(contentPanel, hasPerm);
        goog.style.setElementShown(notLoggedInDiv, secContextB.good() && !hasPerm);

    });
    helper.attach(selectedBugdetB, screenB, secContextB);

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



