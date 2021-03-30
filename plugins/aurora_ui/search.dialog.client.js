goog.provide('aurora.widgets.SearchDialog');

goog.require('aurora.dialog.Dialog');
goog.require('aurora.ui.DialogErrorWidget');
goog.require('goog.ui.Dialog');
goog.require('recoil.frp.Behaviour');
goog.require('recoil.structs.table.Rotate');
goog.require('recoil.ui.WidgetHelper');
goog.require('recoil.ui.widgets.ButtonWidget');
/**
 *
 * @param {!aurora.WidgetScope} scope
 * @param {!aurora.db.schema.TableType} tableT
 * @param {number|!recoil.frp.Behaviour<number>} pageSizeB
 * @param {function(!aurora.WidgetScope,!recoil.frp.Behaviour<!recoil.structs.table.Table>):!recoil.frp.Behaviour<!recoil.structs.table.Table>} factory
 * @param {function(!aurora.WidgetScope,!recoil.frp.Behaviour<!recoil.structs.table.Table>):!recoil.frp.Behaviour<!recoil.structs.table.Table>} headerFactory
 * @param {!recoil.frp.Behaviour} callbackB
 * @param {!recoil.frp.Behaviour<string>|string|!Element} buttonName
 * @param {string} headerName
 * @param {string=} opt_footerText
 * @param {!recoil.frp.Behaviour<recoil.db.Query>=} opt_userQueryB
 * @constructor
 * @implements {recoil.ui.Widget}
 * @extends {goog.ui.ModalPopup}
 * @suppress {deprecated}
 */
aurora.widgets.SearchDialog = function(scope, tableT, pageSizeB, factory, headerFactory, callbackB, buttonName, headerName, opt_footerText, opt_userQueryB) {
    this.frp_ = scope.getFrp();
    var util = new recoil.frp.Util(this.frp_);
    this.scope_ = scope;
    var buttonNameB = util.toBehaviour(buttonName);
    this.tableWidget_ = new aurora.widgets.PagedTable(scope, tableT, pageSizeB, factory, headerFactory, undefined, opt_userQueryB);
    this.okButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    var frp = this.frp_;
    let selectedB = this.tableWidget_.createSelected();

    var container = goog.dom.createDom('div', {class: 'dialog-table'});


    let tableB = this.tableWidget_.getTableB();
    let selectedRowB = frp.liftB(function() {
        let row = null;
        if (selectedB.get().length === 1) {
            return tableB.get().getRow(selectedB.get()[0]);
        }
        return null;

    }, selectedB, tableB);

    var doSelectB = frp.createCallback(function() {

        let row = selectedRowB.get();
        if (row) {
            callbackB.set(row);
        }

    }, callbackB, selectedRowB);

    var selectEnabledB = frp.liftB(function(selectedRow) {
        return selectedRow ? recoil.ui.BoolWithExplanation.TRUE : recoil.ui.BoolWithExplanation.FALSE;
    }, selectedRowB);

    var options = {
        hasCloseX: true,
        overlay: true,
        body: container,
        isModal: true,
        clickToClose: true,
        heading: {message: headerName, className: 'table-dialog-header'},
        hasDefault: true,
        finish: function(e) {
            frp.accessTrans(function() {
                if (selectEnabledB.good() && selectEnabledB.get().val()) {
                    doSelectB.set(e);
                }
            }, doSelectB, selectEnabledB);
        }
    };

    if (opt_footerText) {
        options.subHeading = {message: opt_footerText, className: 'table-dialog-header-subtext'};
    }

    this.dialog_ = new goog.ui.Dialog();
    this.dialog_.setTitle(headerName);
    goog.dom.setFocusableTabIndex(this.dialog_.getTitleCloseElement(), false);

    new recoil.ui.ComponentWidgetHelper(scope, this.dialog_, this, function(helper) {
        let buttonSet = new goog.ui.Dialog.ButtonSet();
        if (helper.isGood()) {
            buttonSet.addButton({key: 'ok', caption: buttonNameB.get()}, true);
            this.dialog_.setButtonSet(buttonSet);
            buttonSet.setButtonEnabled('ok', helper.isGood() && selectEnabledB.get().val());

        }

    }).attach(buttonNameB, selectEnabledB);


    var me = this;

    new recoil.ui.ComponentWidgetHelper(scope, this.dialog_, this, function(helper) {
    }).attach(doSelectB);

    let bgEscapeListener = function(e) {
        if (me.dialog_.isEscapeToCancel() && e.keyCode == goog.events.KeyCodes.ESC) {
            e.stopPropagation();
            e.preventDefault();
            me.dialog_.setVisible(false);
        }
    };
    goog.events.listen(document, goog.events.EventType.KEYDOWN, bgEscapeListener);

    goog.events.listen(this.dialog_, goog.ui.PopupBase.EventType.HIDE, function() {
        me.dialog_.dispose();
        goog.events.unlisten(document, goog.events.EventType.KEYDOWN, bgEscapeListener);
    });

    goog.events.listen(this.dialog_, goog.ui.Dialog.EventType.SELECT, function(e) {

        frp.accessTrans(function() {
            if (selectEnabledB.good() && selectEnabledB.get().val()) {
                doSelectB.set(e);
            }
        }, doSelectB, selectEnabledB);

    });
    var errorDiv = goog.dom.createDom('div', {class: 'table-dialog-error'});


    this.tableWidget_.getComponent().render(this.dialog_.getContentElement());
    this.dialog_.getContentElement().appendChild(errorDiv);

};
/**
 * @param {?} pk
 * @param {?} col
 * @param {?} widgetFactory
 * @param {?=} opt_val
 * @return {{key:?,value:?}}
 */
aurora.widgets.SearchDialog.mkCellError = function(pk, col, widgetFactory, opt_val) {
    return {key: {pk: pk, col: col}, fact: widgetFactory, value: opt_val || []};
};


/**
 *
 * @return {!goog.ui.Component}
 */
aurora.widgets.SearchDialog.prototype.getComponent = function() {
    return this.tableWidget_.getComponent();
};

/**
 *
 * @param {boolean} show
 */
aurora.widgets.SearchDialog.prototype.show = function(show) {
    this.dialog_.setVisible(show);
    if (show) {
        goog.Timer.callOnce(function() {
            let nodes = goog.dom.findNodes(this.dialog_.getContentElement(), function(node) {
                return node instanceof Element && goog.dom.isFocusable(node);
            });


            if (nodes.length > 0) {
                nodes[0].focus();
            }
        }, 0, this);
    }
};

/**
 * all widgets should not allow themselves to be flattened
 *
 */
aurora.widgets.SearchDialog.prototype.flatten = recoil.frp.struct.NO_FLATTEN;
