goog.provide('budget.widgets.SelectTable');


goog.require('goog.dom');
goog.require('recoil.frp.struct');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.SelectTable = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    this.notSelectedDiv_ = cd('div');
    this.tableDiv_ = cd('div');
    let container = cd('div', {}, this.notSelectedDiv_, this.tableDiv_);
    this.tableWidget_ = new recoil.ui.widgets.table.TableWidget(scope);
    this.tableWidget_.getComponent().render(this.tableDiv_);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.updateState_);

};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.SelectTable.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.SelectTable.prototype.flatten = recoil.frp.struct.NO_FLATTEN;


/**
 * attachable behaviours for widget
 */
budget.widgets.SelectTable.options = recoil.ui.util.StandardOptions(
    'value', 'message', 'selected');

/**
 *
 * @param {!Object| !recoil.frp.Behaviour<Object>} options
 */
budget.widgets.SelectTable.prototype.attachStruct = function(options) {
    var frp = this.helper_.getFrp();

    var bound = budget.widgets.SelectTable.options.bind(frp, options);


    this.tableB_ = bound.value();
    this.messageB_ = bound.message();
    this.selectedB_ = bound.selected();
    this.tableWidget_.attachStruct(this.tableB_);

    this.helper_.attach(this.tableB_, this.messageB_, this.selectedB_);
};

/**
 * @private
 */
budget.widgets.SelectTable.prototype.updateState_ = function() {
    let good = this.helper_.isGood();
    let hasSelected = good && this.selectedB_.get();
    goog.style.setElementShown(this.tableDiv_, (good && hasSelected) || !good);
    goog.style.setElementShown(this.notSelectedDiv_, good && !hasSelected);

    goog.dom.removeChildren(this.notSelectedDiv_);
    if (good) {
        this.notSelectedDiv_.appendChild(goog.dom.createTextNode(this.messageB_.get().toString()));
    }
};
