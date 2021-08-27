goog.provide('budget.widgets.ErrorDisplay');

goog.require('aurora.Client');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.ErrorDisplay = function(scope) {
    this.scope_ = scope;
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let amess = aurora.messages;
    let cd = goog.dom.createDom;
    let errorsE = budget.Client.instance.getActionErrorsE();
    this.container_ = cd('div', {class: 'budget-error-display'});
    goog.style.setElementShown(me.container_, false);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);
    goog.events.listen(this.container_, goog.events.EventType.MOUSEDOWN, function() {
        goog.dom.removeChildren(me.container_);
        goog.style.setElementShown(me.container_, false);
    });
    let removeErrorEl = function(el) {
        return function() {
            goog.dom.removeNode(el);
            if (me.container_.children.length == 0) {
                goog.style.setElementShown(me.container_, false);
            }
        };
    };

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, function() {
        errorsE.get().forEach(function(err) {
            goog.style.setElementShown(me.container_, true);
            let errmsg = typeof(err) === 'string' ? err : JSON.stringify(err);
            let errEl = cd('div', {}, cd('i', {class: 'fas fa-exclamation-triangle'}), errmsg);
            me.container_.appendChild(errEl);
            setTimeout(removeErrorEl(errEl), 20000);
        });
    });
    this.helper_.attach(errorsE);

};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.ErrorDisplay.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.ErrorDisplay.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

