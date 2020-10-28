goog.provide('aurora.ui.DialogErrorWidget');


goog.require('goog.dom');
goog.require('goog.events.EventType');
goog.require('recoil.frp.Behaviour');
goog.require('recoil.ui.Widget');
goog.require('recoil.ui.message');
goog.require('recoil.ui.messages');
goog.require('recoil.ui.widgets.table.PasswordColumn');
goog.require('ui.dom');
/**
 * @implements {recoil.ui.Widget}
 * @param {!recoil.ui.WidgetScope} scope
 * @param {?recoil.frp.Behaviour<!Array>} errorsB if this is undefined then use attache
 * @constructor
 */
aurora.ui.DialogErrorWidget = function(scope, errorsB) {
    this.scope_ = scope;
    this.container_ = goog.dom.createDom('div');
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);
    this.valueHelper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.updateValue_);
    this.errorsB_ = errorsB;
    this.valueHelper_.attach(this.errorsB_);
    this.widgetContainer_ = goog.dom.createDom('div');
    this.errorContainer_ = goog.dom.createDom('div', {'class': 'dialog_errored_tag'});
    var jdiv_tag = goog.dom.createDom('div', {'class': 'dialog_errored_tag_container'});

    this.errorContainer_.appendChild(jdiv_tag);

    // the div that makes the rectangle of that contains the message
    var messageBg = goog.dom.createDom('div', {'class': 'dialog_errored_tag_message'});
    // the div that makes the little triange that connects the message with the field
    var joinTriangleBg = goog.dom.createDom('div', {'class': 'dialog_errored_tag_tag'});
    jdiv_tag.appendChild(messageBg);
    jdiv_tag.appendChild(joinTriangleBg);
    var messageSpan = goog.dom.createDom('span', {'class': 'dialog_errored_tag_message_text'});

    this.message_ = goog.dom.createTextNode('');
    messageSpan.appendChild(this.message_);
    messageBg.appendChild(messageSpan);
//    this.container_.appendChild(this.errorContainer_);
    this.container_.appendChild(this.widgetContainer_);
    var me = this;

    // events for highlighting  tags

    goog.events.listen(this.errorContainer_, goog.events.EventType.MOUSEOVER, function() {
        goog.dom.setProperties(messageBg, {'style': 'box-shadow: 1px 1px 5px #666666'});
        goog.dom.setProperties(jdiv_tag, {'style': 'z-index: 10'});
    });

    goog.events.listen(this.errorContainer_, goog.events.EventType.MOUSEOUT, function() {
        goog.dom.setProperties(messageBg, {'style': ''});
        goog.dom.setProperties(jdiv_tag, {'style': ''});
        ui.dom.tidyErroredTags();
    });
};
/**
 * @param {!recoil.frp.Behaviour<!Array>} errorsB if this is undefined then use attache
 */
aurora.ui.DialogErrorWidget.prototype.attach = function(errorsB) {
    this.errorsB_ = errorsB;
    this.valueHelper_.attach(this.errorsB_);
};
/**
 * @return {!goog.ui.Component}
 */
aurora.ui.DialogErrorWidget.prototype.getComponent = function() {
    return this.component_;
};

/**
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 * @private
 */
aurora.ui.DialogErrorWidget.prototype.updateValue_ = function(helper) {
    goog.dom.removeNode(this.errorContainer_);
    goog.dom.classlist.remove(this.container_, 'error-widget-pad');

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
                else {
                    errors.push(recoil.ui.message.toMessage(error.error));
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

aurora.ui.DialogErrorWidget.prototype.flatten = recoil.frp.struct.NO_FLATTEN;


/**
 * @param {!recoil.ui.WidgetScope} scope
 * @param {!recoil.frp.Behaviour<recoil.structs.table.TableCell>} cellB
 * @return {!recoil.ui.Widget}
 */
aurora.ui.DialogErrorWidget.factory = function(scope, cellB) {
    return new aurora.ui.DialogErrorWidget(scope, recoil.frp.table.TableCell.getValue(scope.getFrp(), cellB));
};
