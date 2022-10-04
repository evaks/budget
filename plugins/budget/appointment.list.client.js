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
    this.scope_ = scope;
    let userId = budget.widgets.BudgetList.getUserId();
    let query = new recoil.db.Query();
    let startOfWeek = new Date().setHours(0, 0, 0, 0);
    let userB = scope.getDb().get(userT.key, query.eq(userT.cols.id, userId));
    let todayStart = new Date().setHours(0, 0, 0, 0);
    let appointmentsB = scope.getDb().get(
        appointmentsT.key,
            query.eq(query.val(userId), appointmentsT.cols.userid));

    const pastRowDecorator = function() {
        return new recoil.ui.RenderedDecorator(
            pastRowDecorator,
            goog.dom.createDom('tr', {class: 'budget-appointment-past'}));
    };
    let addAppointmentDecorator = function() {
        return new recoil.ui.RenderedDecorator(
            addAppointmentDecorator,
            goog.dom.createDom('tr', {}, cd('td', {class: 'budget-add-appointment-label'}, budget.messages.ADD_APPOINTMENT.toString())), null);
    };
    let tblB = frp.liftB(function(tbl) {
        let res = tbl.createEmpty();
        let fakeRow = new recoil.structs.table.MutableTableRow();
        tbl.getOtherColumns().forEach(function(c) {
            fakeRow.set(c, null);
        });
        fakeRow.addRowMeta({rowDecorator: addAppointmentDecorator});

        let max = 0;
        tbl.forEachModify((row) => {
            let stop = row.get(appointmentsT.cols.stop);
            max = Math.max(max, row.get(appointmentsT.cols.start));
            row.setPos(-row.get(appointmentsT.cols.start));
            if (stop < todayStart) {
                row.addRowMeta({rowDecorator: pastRowDecorator});
            }
            res.addRow(row);
        });
        fakeRow.setPos(-(max + 1));
        res.addRow(fakeRow);
        res.addMeta({editable: false, headerRowDecorator: null});
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(appointmentsT.cols.start, 'Start');

        return columns.applyMeta(res);

    }, appointmentsB);

    this.tableB_ = tblB;
    this.widget_ = new recoil.ui.widgets.table.TableWidget(scope);
    let me = this;
    this.widget_.attachStruct(tblB);
    this.widget_.getComponent().render(container);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
    this.selectHelper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, function() {
        me.selectedMondayE_.get().forEach(function(e) {
            if (e !== null) {
                me.startDateB_.set(recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(e)));
            }
        });

    });

};

/**
 * @param {!recoil.frp.Behaviour<number>} startDateB
 */
budget.widgets.AppointmentList.prototype.attachStartDate = function(startDateB) {

    const appointmentsT = aurora.db.schema.tables.base.appointments;
    let frp = this.scope_.getFrp();
    let selectedStartDateB = frp.liftB(function(selected, tbl) {
        let time = null;
        selected.forEach(function(pks) {
            let row = tbl.getRow(pks);
            if (row) {
                time = row.get(appointmentsT.cols.start);
                if (time === null) {
                    time = budget.widgets.BusinessHours.lastMonday().getTime();
                }
            }
        });
        if (time === null) {
            return null;
        }
        return budget.widgets.BusinessHours.lastMonday(new Date(time)).getTime();
    }, this.widget_.createSelected(), this.tableB_);
    this.startDateB_ = startDateB;
    this.selectedMondayE_ = frp.changesE(selectedStartDateB);
    this.selectHelper_.attach(this.selectedMondayE_, this.startDateB_);
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
