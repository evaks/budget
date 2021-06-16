goog.provide('budget.widgets.Appointments');


goog.require('aurora.db.schema.tables.base.user');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.net.cookies');
goog.require('recoil.frp.logic');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number} userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Appointments = function(scope, userid) {
    this.scope_ = scope;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let cd = goog.dom.createDom;

    this.widget_ = new budget.widgets.BusinessHours(scope);

    let userT = aurora.db.schema.tables.base.user;
    let notesT = userT.notes;
    let container = cd('div', {});
    let query = new recoil.db.Query();

    let userB = scope.getDb().get(userT.key, query.eq(userT.cols.id, userid));

//    this.widget_.attachStruct( xxxxxB);

    this.widget_.getComponent().render(container);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Appointments.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Appointments.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

