goog.provide('aurora.widgets.Skeleton');
goog.require('aurora.WidgetScope');
goog.require('recoil');
goog.require('recoil.ui.ComponentWidgetHelper');
goog.require('recoil.ui.HtmlHelper');
goog.require('recoil.ui.Widget');

/**
 * @constructor
 * @export
 * @param {!aurora.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */

aurora.widgets.Skeleton = function(scope) {
    var frp = scope.getFrp();
    var me = this;
    this.scope_ = scope;
    var html = new recoil.ui.HtmlHelper(scope);
    var constB = frp.createB(recoil.util.object.constant('Recoiled Skeleton'));
    var container = goog.dom.createDom('div');
    html.innerHtml(container, constB);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */
aurora.widgets.Skeleton.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @return {!goog.ui.Component}
 */
aurora.widgets.Skeleton.prototype.getComponent = function() {
    return this.component_;
};
