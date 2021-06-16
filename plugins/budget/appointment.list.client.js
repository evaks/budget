goog.provide('budget.widgets.AppointmentList');

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
budget.widgets.AppointmentList = function(scope) {
    const userT = aurora.db.schema.tables.base.user;
    const appointmentsT = aurora.db.schema.tables.base.appointments;

    let cd = goog.dom.createDom;
    let container = cd('div', {class: 'budget-appointment'});
    let frp = scope.getFrp();

    let userId = budget.widgets.BudgetList.getUserId();
    let query = new recoil.db.Query();
    let time = new Date().getTime();
    let userB = scope.getDb().get(userT.key, query.eq(userT.cols.id, userId));
    let appointmentsB = scope.getDb().get(appointmentsT.key, query.eq(query.val(userId), appointmentsT.cols.userid));

    let addAppointmentDecorator = function() {
        return new recoil.ui.RenderedDecorator(
            addAppointmentDecorator,
            goog.dom.createDom('tr', {}, cd('td', {class: 'budget-add-appointment-label'}, budget.messages.ADD_APPOINTMENT.toString())), null);
    };
    let tblB = frp.liftB(function(tbl) {
        let res = tbl.unfreeze();
        let fakeRow = new recoil.structs.table.MutableTableRow();
        tbl.getOtherColumns().forEach(function(c) {
            fakeRow.set(c, null);
        });
        fakeRow.addRowMeta({rowDecorator: addAppointmentDecorator});
        res.addRow(fakeRow);

        res.addMeta({editable: false, headerRowDecorator: null});
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(appointmentsT.cols.start, 'Start');

        return columns.applyMeta(res);

    }, appointmentsB);


    this.widget_ = new recoil.ui.widgets.table.TableWidget(scope);

    this.widget_.attachStruct(tblB);
    this.widget_.getComponent().render(container);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};

/**
 * @return {number}
 */
budget.widgets.AppointmentList.getUserId = function() {
    let idStr = budget.widgets.AppointmentList.getSearchParams()['id'];
    return parseInt(idStr == undefined ? (goog.net.cookies.get('userid') || '0') : idStr[0], 10);
};


/**
 * @return {Object<string,!Array<string>>}
 */
budget.widgets.AppointmentList.getSearchParams = function() {
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
budget.widgets.AppointmentList.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.AppointmentList.prototype.getComponent = function() {
    //    return this.widget_.getComponent();
    return this.component_;
};

/**
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.AppointmentList.prototype.createSelected = function() {
    return this.widget_.createSelected();
};
