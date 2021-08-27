goog.provide('aurora.widgets.TableDialog');

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
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>|!recoil.structs.table.Table} table a table to display in the dialog, you should construct a new one
 * each time the dialog is open if you want new data
 * @param {!recoil.frp.Behaviour} callbackB
 * @param {!recoil.frp.Behaviour<string>|string|!Element} buttonName
 * @param {function(!recoil.structs.table.TableRow):recoil.ui.message.Message|!recoil.frp.Behaviour<function(!recoil.structs.table.TableRow, !recoil.structs.table.TableInterface):recoil.ui.message.Message>} validator
 * @param {string} headerName
 * @param {string=} opt_footerText
 * @param {{hasDefault:(boolean|undefined),blockErrors:(boolean|undefined)}=} opt_options
 * @constructor
 * @implements {recoil.ui.Widget}
 * @extends {goog.ui.ModalPopup}
 * @suppress {deprecated}
 */
aurora.widgets.TableDialog = function(scope, table, callbackB, buttonName, validator, headerName, opt_footerText, opt_options) {
    this.frp_ = scope.getFrp();
    var util = new recoil.frp.Util(this.frp_);
    this.scope_ = scope;
    this.tableB_ = util.toBehaviour(table);
    var buttonNameB = util.toBehaviour(buttonName);
    this.validatorB_ = util.toBehaviour(validator, function() {return null;});
    this.tableWidget_ = new recoil.ui.widgets.table.TableWidget(scope);
    this.okButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.labelWidget_ = new recoil.ui.widgets.LabelWidget(scope);
    var frp = this.frp_;
    let outErrorsB = frp.createB(new goog.structs.AvlTree(recoil.util.object.compareKey));

    var tableB = this.tableB_;
    var container = goog.dom.createDom('div', {class: 'dialog-table'});

    var addEnabledB = frp.liftB(function(validator, tbl, errors) {
        var myRow;
        tbl.forEach(function(row) {
            myRow = row;
        });
        let errorCount = 0;
        errors.inOrderTraverse(function(entry) {
            errorCount += entry.value.length;
        });
        if (opt_options && opt_options.blockErrors) {
            tbl.forEachPlacedColumn(function(col) {
                errorCount += (myRow.getCellMeta(col).errors || []).length;
            });
        }
        if (errorCount > 0) {
            return recoil.ui.BoolWithExplanation.FALSE;
        }
        var mesg = validator ? validator(myRow, tbl) : null;

        return mesg ? new recoil.ui.BoolWithExplanation(false, mesg) : recoil.ui.BoolWithExplanation.TRUE;

    }, this.validatorB_, tableB, outErrorsB);

    var doAddB = frp.createCallback(function() {
        var row = null;
        tableB.get().forEach(function(r) {
            row = r;
        });
        callbackB.set(row);

    }, callbackB, tableB);

    var options = {
        hasCloseX: true,
        overlay: true,
        body: container,
        isModal: true,
        clickToClose: true,
        heading: {message: headerName, className: 'table-dialog-header'},
        hasDefault: (opt_options || {}).hasDefault === false ? false : true,
        finish: function(e) {
            frp.accessTrans(function() {
                if (addEnabledB.good() && addEnabledB.get().val()) {
                    doAddB.set(e);
                }
            }, doAddB, addEnabledB);
        }//,
//        headerIcon: jQuery('<img' +
  //          ' src=\"../../../resources/images/connection-lost.png\">')[0]
        // footerText: opt_footerText


    };

    if (opt_footerText) {
        options.subHeading = {message: opt_footerText, className: 'table-dialog-header-subtext'};
    }

    this.dialog_ = new goog.ui.Dialog();
    this.dialog_.setTitle(headerName);

    goog.dom.setFocusableTabIndex(this.dialog_.getTitleCloseElement(), false);
    aurora.widgets.TableDialog.setupButton(scope, this.dialog_, buttonNameB, addEnabledB, doAddB);
    var me = this;


    var showErrorB = frp.liftB(function(validator, tbl) {
        var myRow;
        tbl.forEach(function(row) {
            myRow = row;
        });

        var valid = validator(myRow, tbl);
        return goog.dom.createTextNode(valid ? valid : '');

    }, this.validatorB_, tableB);
    this.labelWidget_.attach(showErrorB);
    let mkCellError = aurora.widgets.TableDialog.mkCellError;
    var rotate = new recoil.structs.table.Rotate(false);
    var tableWidget = new recoil.ui.widgets.table.TableWidget(scope);
    let dataB = recoil.frp.Inversable.create(frp, rotate, {table: tableB});
    let errorColCache = [];

    let metaTableB = frp.liftBI(function(tbl, outErrors) {

        let errorCols = [];
        let pos = 0;
        tbl.forEachPlacedColumn(function(col) {
            let existing = errorColCache[pos++];
            if (!existing) {
                existing = new recoil.structs.table.ColumnKey('error-' + pos);
                errorColCache.push(existing);
            }
            errorCols.push(existing);
        });
        let res = tbl.createEmpty([], errorCols);
        pos = 0;
        tbl.forEachPlacedColumn(function(col) {
            res.addColumnMeta(errorCols[pos], {position: pos * 2 + 1, cellWidgetFactory: aurora.ui.DialogErrorWidget.factory});
            res.addColumnMeta(col, {position: pos * 2});
            pos++;
        });

        let idx = 0;
        tbl.forEach(function(row, pks) {
            let mrow = row.unfreeze();
            let pos = 0;
            tbl.forEachPlacedColumn(function(colKey, colMeta) {
                let cellMeta = row.getCellMeta(colKey);

                var cellOutErrors = outErrors.findFirst(mkCellError(pks, colKey, null));
                cellOutErrors = cellOutErrors ? cellOutErrors.value : [];

                var cellErrors = mrow.getCellMeta(colKey).errors || [];
                mrow.set(errorCols[pos++], cellOutErrors.concat(cellErrors));

                mrow.addCellMeta(colKey, {outErrors: cellOutErrors, immediate: true});
            });
            res.addRow(mrow);
        });
        return res.freeze();
    }, function(tbl) {
        let res = dataB.get().createEmpty();
        var unsetErrors = new goog.structs.AvlTree(recoil.util.object.compareKey);

        tbl.forEach(function(row, pks) {
            let mrow = row.unfreeze();

            dataB.get().forEachPlacedColumn(function(col) {
                mrow.setCellMeta(col, dataB.get().getCell(pks, col).getMeta());
                var cellMeta = row.getCellMeta(col);
                unsetErrors.add(mkCellError(pks, col, null, cellMeta.outErrors));

            });
            res.addRow(mrow);
        });
        dataB.set(res.freeze());
        outErrorsB.set(unsetErrors);

    }, dataB, outErrorsB);
    tableWidget.attachStruct(metaTableB);
    this.behaviourB_ = metaTableB;

    var errorDiv = goog.dom.createDom('div', {class: 'table-dialog-error'});

    this.labelWidget_.getComponent().render(errorDiv);

    tableWidget.getComponent().render(this.dialog_.getContentElement());
    this.dialog_.getContentElement().appendChild(errorDiv);

};
/**
 * @param {?} pk
 * @param {?} col
 * @param {?} widgetFactory
 * @param {?=} opt_val
 * @return {{key:?,value:?}}
 */
aurora.widgets.TableDialog.mkCellError = function(pk, col, widgetFactory, opt_val) {
    return {key: {pk: pk, col: col}, fact: widgetFactory, value: opt_val || []};
};

/**
 * @param {!recoil.ui.WidgetScope} scope
 * @param {!goog.ui.Dialog} dialog
 * @param {!recoil.frp.Behaviour<string>|string} buttonName
 * @param {!recoil.frp.Behaviour<!recoil.ui.BoolWithExplanation>|!recoil.ui.BoolWithExplanation} okEnabled
 * @param {!recoil.frp.Behaviour} actionB called when button pressed
 */
aurora.widgets.TableDialog.setupButton = function(scope, dialog, buttonName, okEnabled, actionB) {
    let util = new recoil.frp.Util(scope.getFrp());
    let buttonNameB = util.toBehaviour(buttonName);
    let addEnabledB = util.toBehaviour(okEnabled);
    let frp = scope.getFrp();

    new recoil.ui.ComponentWidgetHelper(
        scope, dialog, this,
        /** @suppress {deprecated} */
        function(helper) {
            let buttonSet = new goog.ui.Dialog.ButtonSet();
            if (helper.isGood()) {
                buttonSet.addButton({key: 'ok', caption: buttonNameB.get()}, true);
                dialog.setButtonSet(buttonSet);
                buttonSet.setButtonEnabled('ok', addEnabledB.get().val());
            }

        }).attach(buttonNameB, addEnabledB);

    new recoil.ui.ComponentWidgetHelper(scope, dialog, null, function(helper) {
    }).attach(actionB);


    let bgEscapeListener = function(e) {
        if (dialog.isEscapeToCancel() && e.keyCode == goog.events.KeyCodes.ESC) {
            e.stopPropagation();
            e.preventDefault();
            dialog.setVisible(false);
        }
    };
    goog.events.listen(document, goog.events.EventType.KEYDOWN, bgEscapeListener);

    goog.events.listen(dialog, goog.ui.PopupBase.EventType.HIDE, function() {
        dialog.dispose();
        goog.events.unlisten(document, goog.events.EventType.KEYDOWN, bgEscapeListener);
    });

    goog.events.listen(dialog, goog.ui.Dialog.EventType.SELECT, function(e) {

        frp.accessTrans(function() {
            if (addEnabledB.good() && addEnabledB.get().val()) {
                actionB.set(e);
            }
        }, actionB, addEnabledB);

    });

};

/**
 *
 * @return {!goog.ui.Component}
 */
aurora.widgets.TableDialog.prototype.getComponent = function() {
    return this.tableWidget_.getComponent();
};


/**
 * @param {!recoil.frp.Frp} frp
 * @param {!goog.ui.Dialog} dialog
 * @param {!recoil.frp.Behaviour} behaviour
 * @param {boolean} show
 */
aurora.widgets.TableDialog.show = function(frp, dialog, behaviour, show) {
    // we want the behaviour to error or load before we show the
    // dialog so it is placed correctly
    if (!show) {
        dialog.setVisible(show);
    }
    else {
        let tempB = frp.metaLiftB(function(status) {
            if (status.ready()) {
                dialog.setVisible(show);
                if (show) {
                    aurora.widgets.TableDialog.focusFirst(dialog);
                }
                frp.detach(tempB);

            }
            return status;
        }, behaviour);
        frp.attach(tempB);
    }
};
/**
 *
 * @param {boolean} show
 */
aurora.widgets.TableDialog.prototype.show = function(show) {
    aurora.widgets.TableDialog.show(this.frp_, this.dialog_, this.behaviourB_, show);
};

/**
 * @param {goog.ui.Dialog} dialog
 */
aurora.widgets.TableDialog.focusFirst = function(dialog) {
    goog.Timer.callOnce(function() {
        let nodes = goog.dom.findNodes(dialog.getContentElement(), function(node) {
            return node instanceof Element && goog.dom.isFocusable(node);
        });
        if (nodes.length > 0) {
            nodes[0].focus();
        }
    }, 0, null);
};

/**
 * all widgets should not allow themselves to be flattened
 *
 */
aurora.widgets.TableDialog.prototype.flatten = recoil.frp.struct.NO_FLATTEN;
