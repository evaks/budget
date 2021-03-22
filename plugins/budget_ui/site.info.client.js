goog.provide('budget.widgets.SiteInfo');

goog.require('aurora.Client');
goog.require('aurora.db.schema.tables.base.user');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.dom.classlist');
goog.require('goog.object');
goog.require('goog.positioning.Corner');
goog.require('goog.ui.MenuItem');
goog.require('goog.ui.PopupMenu');
goog.require('recoil.frp.logic');
goog.require('recoil.structs.table.Filter');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.columns.Expr');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.table.TableWidget');
goog.require('recoil.ui.widgets.table.TextAreaColumn');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.SiteInfo = function(scope) {
    this.scope_ = scope;
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let amess = aurora.messages;
    let cd = goog.dom.createDom;
    let siteT = aurora.db.schema.tables.base.site;

    this.siteB_ = scope.getDb().get(siteT.key);

    this.containerDiv_ = cd('div', {class: 'budget-table'});
    this.container_ = budget.widgets.BusinessHours.createWidgetDom('div', {class: 'budget-system'}, this.containerDiv_);

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);
    this.tableWidget_ = new recoil.ui.widgets.table.TableWidget(scope);

    let tableB = frp.liftBI(function(site) {
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(siteT.cols.name, 'Name', {displayLength: 20});
        columns.add(siteT.cols.phone, mess.PHONE);
        columns.add(siteT.cols.email, amess.EMAIL_ADDRESS, {displayLength: 20});
        columns.addColumn(new recoil.ui.widgets.table.TextAreaColumn(siteT.cols.address, mess.ADDRESS));
        columns.addColumn(new recoil.ui.widgets.table.TextAreaColumn(siteT.cols.mapAddress, mess.MAP_ADDRESS));
        return columns.applyMeta(site);

    }, function(site) {
        me.siteB_.set(site);
    }, this.siteB_);
    this.tableWidget_.attachStruct(aurora.widgets.TableWidget.createRotated(tableB));
    this.tableWidget_.getComponent().render(this.containerDiv_);

};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.SiteInfo.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.SiteInfo.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

