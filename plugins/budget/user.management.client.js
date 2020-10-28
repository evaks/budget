goog.provide('budget.widgets.UserManagement');

goog.require('aurora.columns.Link');
goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.messages');
goog.require('aurora.widgets.UserManagement');
goog.require('budget.WidgetScope');
goog.require('goog.structs.AvlTree');
goog.require('recoil.ui.widgets.InputWidget');
goog.require('recoil.ui.widgets.table.ButtonColumn');
goog.require('recoil.ui.widgets.table.TableWidget');
/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {{groups:!Array<string>,searchOnly:(boolean|undefined)}} options
 * @implements {recoil.ui.Widget}
 */
budget.widgets.UserManagement = function(scope, options) {
    let userT = aurora.db.schema.tables.base.user;

    var linkCK = new recoil.structs.table.ColumnKey('link');
    let linkCol = new aurora.columns.Link(linkCK, 'Link');
    this.widget_ = new aurora.widgets.UserManagement(scope, options, [
        {key: userT.cols.mentorid, name: 'Mentor'},
        {key: linkCK, col: linkCol, value: function(row) {
            return '/client?id=' + row.get(userT.cols.id).db;
        }, search: function(row) {
            row.addCellMeta(linkCK, {cellWidgetFactory: null});
        }},
    ]);
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.UserManagement.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.UserManagement.prototype.getComponent = function() {
    return this.widget_.getComponent();
};


