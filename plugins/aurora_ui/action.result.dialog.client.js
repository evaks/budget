goog.provide('aurora.widgets.ActionResultDialog');

goog.require('aurora.dialog.Dialog');
goog.require('aurora.ui.DialogErrorWidget');
goog.require('goog.ui.Dialog');
goog.require('recoil.frp.Behaviour');
goog.require('recoil.structs.table.Rotate');
goog.require('recoil.ui.WidgetHelper');
goog.require('recoil.ui.widgets.ButtonWidget');
/**
 *
 * @param {!recoil.ui.WidgetScope} scope
 * @param {string} headerName
 * @param {!recoil.frp.Behaviour} actionB
 * @param {{hasDefault:(boolean|undefined),blockErrors:(boolean|undefined)}=} opt_options
 * @constructor
 * @implements {recoil.ui.Widget}
 * @extends {goog.ui.ModalPopup}
 * @suppress {deprecated}
 */
aurora.widgets.ActionResultDialog = function(scope, headerName, actionB, opt_options) {
    this.frp_ = scope.getFrp();
    var util = new recoil.frp.Util(this.frp_);
    this.scope_ = scope;
    this.okButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.labelWidget_ = new recoil.ui.widgets.LabelWidget(scope);
    var frp = this.frp_;
    var tableB = this.tableB_;
    var container = goog.dom.createDom('div', {class: 'dialog-table'});
    let doOkB = frp.createB(null);
    let okEnabledB = frp.liftB(function(action) {

        if (action && action.output && action.output.error) {
            return recoil.ui.BoolWithExplanation.TRUE;
        }
        return new recoil.ui.BoolWithExplanation(false); 

    }, actionB);


    var options = {
        hasCloseX: false,
        overlay: true,
        body: container,
        isModal: true,
        clickToClose: false,
        heading: {message: headerName, className: 'table-dialog-header'},
        hasDefault: (opt_options || {}).hasDefault === false ? false : true,
        finish: function(e) {}

    };

    this.dialog_ = new goog.ui.Dialog();
    this.dialog_.setTitle(headerName);

    goog.dom.setFocusableTabIndex(this.dialog_.getTitleCloseElement(), false);
    
    aurora.widgets.TableDialog.setupButton(scope, this.dialog_, frp.createB('Ok'), okEnabledB, doOkB);
    var me = this;


    var showErrorB = frp.liftB(function(action) {

        console.log('action', action);
        if (action && action.output) {
            if (action.output.error) {
                return goog.dom.createDom('div', {class: 'recoil-error'},goog.dom.createTextNode(action.output.error));
            }
            else {
                me.dialog_.dispose();
                return goog.dom.createTextNode('');
            }
        }
        return goog.dom.createTextNode('Working');

    }, actionB);
    this.labelWidget_.attach(showErrorB);
    
    var errorDiv = goog.dom.createDom('div');

    this.labelWidget_.getComponent().render(errorDiv);
    this.behaviourB_ = frp.liftB(function () {}, showErrorB, okEnabledB);
        

    this.dialog_.getContentElement().appendChild(errorDiv);

};

/**
 *
 * @param {boolean} show
 */
aurora.widgets.ActionResultDialog.prototype.show = function(show) {
    aurora.widgets.TableDialog.show(this.frp_, this.dialog_, this.behaviourB_, show);
};

