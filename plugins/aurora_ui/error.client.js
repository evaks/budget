goog.provide('aurora.ui.ErrorWidget');


goog.require('goog.dom');
goog.require('goog.events.EventType');
goog.require('recoil.frp.Behaviour');
goog.require('recoil.ui.Widget');
goog.require('recoil.ui.message');
goog.require('recoil.ui.messages');
goog.require('ui.dom');

/**
 * @implements {recoil.ui.Widget}
 * @param {!recoil.ui.WidgetScope} scope
 * @param {?recoil.frp.Behaviour<!Array>} errorsB if this is undefined then use attache
 * @param {?recoil.frp.Behaviour<boolean>} rowErrorsB as anything in the row got errors used for padding
 * @param {recoil.ui.Widget} innerWidget
 * @constructor
 */
aurora.ui.ErrorWidget = function(scope, errorsB, rowErrorsB, innerWidget) {
    this.scope_ = scope;
    this.container_ = goog.dom.createDom('div');
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);
    this.valueHelper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.updateValue_);
    this.errorsB_ = errorsB;
    this.rowErrorsB_ = rowErrorsB;
    if (this.errorsB_) {
        this.valueHelper_.attach(this.errorsB_, this.rowErrorsB_);
    }

    this.widgetContainer_ = goog.dom.createDom('div');
    this.errorContainer_ = goog.dom.createDom('div', {'class': 'errored_tag'});
    var jdiv_tag = goog.dom.createDom('div', {'class': 'errored_tag_container'});

    this.errorContainer_.appendChild(jdiv_tag);

    // the div that makes the rectangle of that contains the message
    var messageBg = goog.dom.createDom('div', {'class': 'errored_tag_message'});
    // the div that makes the little triange that connects the message with the field
    var joinTriangleBg = goog.dom.createDom('div', {'class': 'errored_tag_tag'});
    jdiv_tag.appendChild(messageBg);
    jdiv_tag.appendChild(joinTriangleBg);
    var messageSpan = goog.dom.createDom('span', {'class': 'errored_tag_message_text'});

    this.message_ = goog.dom.createTextNode('');
    messageSpan.appendChild(this.message_);
    messageBg.appendChild(messageSpan);
//    this.container_.appendChild(this.errorContainer_);
    this.container_.appendChild(this.widgetContainer_);
    var me = this;

    // events for highlighting  tags

    goog.events.listen(this.errorContainer_, goog.events.EventType.MOUSEOVER, function() {
        messageBg.style.cssText = 'box-shadow: 1px 1px 5px #666666';
        jdiv_tag.style.cssText = 'z-index:10';
    });

    goog.events.listen(this.errorContainer_, goog.events.EventType.MOUSEOUT, function() {
        messageBg.style.cssText = '';
        jdiv_tag.style.cssText = '';
        ui.dom.tidyErroredTags();
    });
    innerWidget.getComponent().render(this.widgetContainer_);
};
/**
 * @param {!recoil.frp.Behaviour<!Array>} errorsB if this is undefined then use attache
 * @param {recoil.frp.Behaviour<boolean>} rowErrorsB as anything in the row got errors used for padding
 */
aurora.ui.ErrorWidget.prototype.attach = function(errorsB, rowErrorsB) {
    this.errorsB_ = errorsB;
    this.rowErrorsB_ = rowErrorsB ? rowErrorsB : this.scope_.getFrp().createConstB(false);
    this.valueHelper_.attach(this.errorsB_, this.rowErrorsB_);
};
/**
 * @return {!goog.ui.Component}
 */
aurora.ui.ErrorWidget.prototype.getComponent = function() {
    return this.component_;
};

/**
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 * @private
 */
aurora.ui.ErrorWidget.prototype.updateValue_ = function(helper) {
    goog.dom.removeNode(this.errorContainer_);
    if (this.rowErrorsB_.good() && this.rowErrorsB_.get()) {
        goog.dom.classlist.add(this.container_, 'error-widget-pad');
    }
    else {
        goog.dom.classlist.remove(this.container_, 'error-widget-pad');
    }
    if (helper.isGood() && this.errorsB_.get().length > 0) {
        goog.dom.insertSiblingBefore(this.errorContainer_, this.widgetContainer_);
        var errors = [];
        let warning = true;
        this.errorsB_.get().forEach(function(error) {
            if (error && error.warning) {
                error = error.warning;
            }
            else {
                warning = false;
            }
            if (error.error) {
                if (error.error.errorno === 'NOT_CREATABLE') {
                    errors.push(recoil.ui.message.toMessage('Not Createable'));
                }
                else if (error.error.message) {
                    errors.push(recoil.ui.message.toMessage(error.error.message));
                }
                else if (error.error.sqlMessage) {
                    errors.push(recoil.ui.message.toMessage(error.error.sqlMessage));
                }
                else if (typeof (error.error) == 'string') {

                    errors.push(recoil.ui.message.toMessage(error.error));
                }
                else {
                    errors.push(recoil.ui.message.toMessage(JSON.stringify(error.error)));
                }
            }
            else if (error.message) {
                errors.push(recoil.ui.message.toMessage(error.message));
            }
            else if (error.errcode) {
                errors.push(recoil.ui.message.toMessage(error.errcode));
            }else {
                errors.push(recoil.ui.message.toMessage(error));
            }
        });
        goog.dom.classlist.enable(this.errorContainer_, 'warning', warning);
        this.message_.nodeValue = recoil.ui.messages.join(errors).toString();
        ui.dom.tidyErroredTags();
    }

};

/**
 * all widgets should not allow themselves to be flatterned
 *
 * @type {!Object}
 */

aurora.ui.ErrorWidget.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @param {!recoil.ui.WidgetScope} scope
 * @param {!recoil.frp.Behaviour<recoil.structs.table.TableCell>} cellB
 * @return {recoil.ui.Widget}
 */
aurora.ui.ErrorWidget.NotApplicableWidgetFactory = function(scope, cellB) {
    var widget = new recoil.ui.widgets.LabelWidget(scope);
    var metaData = recoil.frp.table.TableCell.getMeta(scope.getFrp(), cellB);
    widget.attach(recoil.frp.struct.get('naValue', metaData, ''), recoil.ui.BoolWithExplanation.TRUE);
    return widget;
};

/**
 * creates a function that will create an error widget
 * @param {!recoil.frp.Frp} frp
 * @param {function(!recoil.ui.WidgetScope,!recoil.frp.Behaviour):recoil.ui.Widget} cellFactory
 * @param {Object} meta
 * @return {function(!recoil.ui.WidgetScope,!recoil.frp.Behaviour):recoil.ui.Widget}
 */

aurora.ui.ErrorWidget.makeErrorFactory = function(frp, cellFactory, meta) {
    if (meta && meta.visible === false) {
        cellFactory = aurora.ui.ErrorWidget.NotApplicableWidgetFactory;
    }
    var res = function(scope, cellB) {
        var errorsB = scope.getFrp().liftB(function(cell) {
            if (cell.getMeta().hideErrors) {
                return [];
            }
            if (cell.getMeta().visible === false) {
                return [];
            }
            return cell.getMeta().errors || [];
        }, cellB);

        var hasRowErrorsB = scope.getFrp().liftB(function(cell) {
            return cell.getMeta().rowErrors ? true : false;
        }, cellB);

        return new aurora.ui.ErrorWidget(scope, errorsB, hasRowErrorsB, cellFactory(scope, frp.liftBI(
            function(v) {
                return v;
            }, function(v) {
                if (v.getMeta() && v.getMeta().cellWidgetFactory &&
                    cellFactory === v.getMeta().cellWidgetFactory.cellFactory) {
                    cellB.set(v);
                }
            },cellB)));
    };
    res.cellFactory = cellFactory;

    res.equals = function(other) {
        return other && recoil.util.object.isEqual(other.cellFactory, cellFactory);
    };
    return res;
};

/**
 * @param {?} pk
 * @param {?} col
 * @param {?} widgetFactory
 * @param {?=} opt_val
 * @return {{key:?,value:?}}
 */
aurora.ui.ErrorWidget.mkCellError = function(pk, col, widgetFactory, opt_val) {
    return {key: {pk: pk, col: col}, fact: widgetFactory, value: opt_val || []};
};

/**
 * wraps an error widget around each visable field in tableB, after calling
 * this errors should be displayed in tables.
 *
 * @param {!recoil.ui.WidgetScope} scope
 * @param {!recoil.frp.Behaviour} tableB
 * @return {!recoil.frp.Behaviour}
 */
aurora.ui.ErrorWidget.createTable = function(scope, tableB) {
    let frp = tableB.frp();
    let mkCellError = aurora.ui.ErrorWidget.mkCellError;
    var unsetErrorsB = frp.createB(new goog.structs.AvlTree(recoil.util.object.compareKey));

    return frp.liftBI(function(tbl) {
        let res = tbl.createEmpty();
        let unsetErrors = unsetErrorsB.get();
        tbl.forEach(function(row, pks, rowMeta) {
            let mrow = row.unfreeze();
            var rowErrors = rowMeta.errors ? rowMeta.errors.length > 0 : false;


            tbl.forEachPlacedColumn(function(col, columnMeta) {
                // we need a way of displaying deleted rows and non-created rows
                var cellMeta = row.getCellMeta(col);
                var cellFactory = recoil.ui.widgets.table.TableWidget.getMetaValue(
                    scope, 'cellWidgetFactory', tbl.getMeta(), row.getMeta(), columnMeta, cellMeta);
                var cellOutErrors = unsetErrors.findFirst(mkCellError(pks, col, cellFactory));
                cellOutErrors = cellOutErrors && recoil.util.object.isEqual(cellOutErrors.fact, cellFactory) ? cellOutErrors.value : [];
                rowErrors = rowErrors || ((!cellMeta.hideErrors) && ((cellMeta.errors ? cellMeta.errors.length > 0 : false) || cellOutErrors.length > 0));
                var cellWidgetFactoryFunction = aurora.ui.ErrorWidget.makeErrorFactory(frp, cellFactory, cellMeta);
                mrow.addCellMeta(col, {cellWidgetFactory: cellWidgetFactoryFunction});


            });
            mrow.addRowMeta({rowErrors: rowErrors});
            res.addRow(mrow);
        });

        return res.freeze();
    }, function(tbl) {
        var unsetErrors = new goog.structs.AvlTree(recoil.util.object.compareKey);
        tbl.forEach(function(row, pks) {

            tbl.forEachPlacedColumn(function(col) {
                var cellMeta = row.getCellMeta(col);

                if (cellMeta.cellWidgetFactory) {
                    unsetErrors.add(mkCellError(pks, col, cellMeta.cellWidgetFactory.cellFactory, cellMeta.outErrors));
                }
            });
        });
        tableB.set(tbl);
        unsetErrorsB.set(unsetErrors);

    }, tableB, unsetErrorsB);
};

/**
 * @typedef {{hideErrors:boolean}}
 */
aurora.ui.ErrorWidget.Meta;
