goog.provide('budget.widgets.Notes');


goog.require('aurora.db.schema.tables.base.user');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.net.XhrIo');
goog.require('goog.net.cookies');
goog.require('recoil.frp.logic');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');
goog.require('recoil.ui.widgets.CheckboxWidget');
goog.require('recoil.ui.widgets.ComboWidget');
goog.require('recoil.ui.widgets.InputWidget');
goog.require('recoil.ui.widgets.PasswordStrengthWidget');
goog.require('recoil.ui.widgets.PasswordWidget');
goog.require('recoil.ui.widgets.SelectorWidget');
goog.require('recoil.ui.widgets.TextAreaWidget');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number} userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Notes = function(scope, userid) {
    this.scope_ = scope;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;


    this.widget_ = new recoil.ui.widgets.table.TableWidget(scope);

    let userT = aurora.db.schema.tables.base.user;
    let notesT = userT.notes;
    let container = cd('div', {});
    let query = new recoil.db.Query();

    let userB = scope.getDb().get(userT.key, query.eq(userT.cols.id, userid));
    let notesB = budget.Client.instance.createSubTableB(userB, frp.createB(/** @type {Array} */(null)), userT.cols.notes);
    let formattedB = frp.liftBI(function(tbl) {
        let res = tbl.unfreeze();
        if (res.size() === 0) {
            res.addMeta({headerRowDecorator: null});
        }
        res.addColumnMeta(notesT.cols.description, {displayLength: 40});
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(notesT.cols.when, 'Time');
        columns.add(notesT.cols.description, 'Description');
        return columns.applyMeta(res);

    }, function(tbl) {
        let res = notesB.get().createEmpty();

        tbl.forEachModify(function(row) {
            if (row.getMeta().doAdd) {
                row.set(notesT.cols.when, new Date().getTime());
                row.set(notesT.cols.description, '');
            }
            row.setPos(row.get(notesT.cols.when));
            res.addRow(row);
        });
        notesB.set(res.freeze());
    }, notesB);

    this.widget_.attachStruct(aurora.widgets.TableWidget.createSizable(aurora.ui.ErrorWidget.createTable(scope, formattedB)));
    this.widget_.getComponent().render(container);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Notes.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Notes.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

