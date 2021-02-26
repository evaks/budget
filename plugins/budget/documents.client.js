goog.provide('budget.widgets.Documents');


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
budget.widgets.Documents = function(scope, userid) {
    this.scope_ = scope;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let userT = aurora.db.schema.tables.base.user;
    let documentsT = userT.documents;

    this.documents_ = new recoil.ui.widgets.table.TableWidget(scope);

    let query = new recoil.db.Query();
    let userB = scope.getDb().get(userT.key, query.eq(userT.cols.id, userid));
    let documentsB = budget.Client.instance.createSubTableB(userB, frp.createB(/** @type {Array} */(null)), userT.cols.documents);

    let input = cd('input', {type: 'file'}, 'Select a file');
    input.addEventListener('change', function(e) {
        var file = input.files[0];
        let formData = new FormData();

        // I would use fetch but it doesn't give progress
        let request = new XMLHttpRequest();
        request.open('POST', '/system/upload' + documentsT.info.path.split('/').map(encodeURIComponent).join('/') + '/' + encodeURIComponent('[' + userid + ']'));
        request.upload.addEventListener('progress', function(e) {
	    // upload progress as percentage
	    let percent_completed = (e.loaded / e.total) * 100;
	    console.log(percent_completed);
        });

        // request finished event
        request.addEventListener('load', function(e) {
	    // HTTP status message (200, 404 etc)
	    console.log(request.status);

	    // request.response holds response from the server
	    console.log(request.response);
        });

        // send POST request to server
        formData.append('data', file);
        request.send(formData);

    });
    let container = cd('div', {}, input);

        let formattedB = frp.liftBI(function(tbl) {
        let res = tbl.unfreeze();
        if (res.size() === 0) {
            res.addMeta({headerRowDecorator: null});
        }
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.add(documentsT.cols.file, 'file');
        return columns.applyMeta(res);
    }, function(tbl) {

    }, documentsB);

    this.documents_.attachStruct(aurora.ui.ErrorWidget.createTable(scope, formattedB));
    this.documents_.getComponent().render(container);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Documents.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Documents.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

