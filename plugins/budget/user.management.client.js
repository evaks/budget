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
    options = options || {};
    let userT = aurora.db.schema.tables.base.user;
    let groupT = aurora.db.schema.tables.base.group;
    let permissionT = aurora.db.schema.tables.base.permission;

    var linkCK = new recoil.structs.table.ColumnKey('link');
    let linkCol = new aurora.columns.Link(linkCK, 'Link');
    let frp = scope.getFrp();
    let query = new recoil.db.Query();
    let mentorsB = budget.widgets.UserManagement.getMentorList(scope);
    let mentorRendererB = budget.widgets.UserManagement.getMentorRenderer(scope);
    let extraColsB = frp.liftB(function(mentorList, mentorRenderer) {
        let mentors = [null].concat(mentorList);

        let mentorCol = new recoil.ui.widgets.table.SelectColumn(userT.cols.mentorid, 'Mentor', mentors, {
            renderer: mentorRenderer
        });


        let res = [
            {key: userT.cols.mentorid, name: 'Mentor', col: mentorCol, meta: {editable: true}}
        ];

        if (options.searchOnly) {
            res.push(
                {key: linkCK, col: linkCol, value: function(row) {
                    return '/client?id=' + row.get(userT.cols.id).db;
                }, search: function(row) {
                    row.addCellMeta(linkCK, {cellWidgetFactory: null});
                }});
        }
        return res;
    }, mentorsB, mentorRendererB);

    this.widget_ = new aurora.widgets.UserManagement(scope, options, extraColsB);
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.UserManagement.prototype.flatten = recoil.frp.struct.NO_FLATTEN;



/**
 * @param {!budget.WidgetScope} scope
 * @return {!recoil.frp.Behaviour<!Array<number>>}
 */
budget.widgets.UserManagement.getMentorList = function(scope) {
    return scope.getFrp().liftB(function(tbl) {
        let res = [];

        tbl.forEach(function(row) {
            res.push(row.get(aurora.db.schema.tables.base.mentor.cols.id));
        });
        return res;
    }, budget.widgets.UserManagement.getMentors(scope));
};



/**
 * @param {!budget.WidgetScope} scope
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.UserManagement.getMentorRenderer = function(scope) {
    const userT = aurora.db.schema.tables.base.mentor;
    return scope.getFrp().liftB(function(tbl) {
        let mentors = [];
        tbl.forEach(function(row) {
            mentors.push({name: row.get(userT.cols.firstName) || row.get(userT.cols.username), val: row.get(userT.cols.id)});
        });

        return recoil.ui.renderers.ListRenderer(mentors, recoil.ui.messages.NONE);
    }, budget.widgets.UserManagement.getMentors(scope));
};

/**
 * @param {!budget.WidgetScope} scope
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */
budget.widgets.UserManagement.getMentors = function(scope) {
    let userT = aurora.db.schema.tables.base.mentor;
    let groupT = aurora.db.schema.tables.base.group;
    let permissionT = aurora.db.schema.tables.base.permission;

    let frp = scope.getFrp();
    let query = new recoil.db.Query();

    return scope.getDb().get(userT.key);
};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.UserManagement.prototype.getComponent = function() {
    return this.widget_.getComponent();
};


