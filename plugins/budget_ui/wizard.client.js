goog.provide('budget.widgets.Wizard');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableWidget');
goog.require('budget.ImportRow');
goog.require('recoil.frp.logic');

/**
 * @constructor
 * @param {!budget.WidgetScope} scope
 * @param {!Array} screensFactories
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Wizard = function(scope, screensFactories) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    this.finishedB_ = frp.createE();
    let bodyContainer = cd('div', {class: 'budget-import-wizard-body'});
    let prevContainer = cd('div', {});
    let messageContainer = cd('div', {class: 'budget-import-wizard-message'});
    let buttonContainer = cd('div', {class: 'budget-import-wizard-buttons'}, prevContainer);
    let dateContainer = cd('div', {});
    let container = cd('div', {}, dateContainer, bodyContainer, buttonContainer);
    let posB = frp.createB(0);
    let nextEnabledBB = frp.createNotReadyB();
    let html = new recoil.ui.HtmlHelper(scope);

    let nextTextB = frp.liftB(function(pos) {
        if (pos + 1 < screensFactories.length) {
            return recoil.ui.messages.NEXT.toString();
        }
        return recoil.ui.messages.FINISH.toString();
    }, posB);
    html.show(prevContainer, recoil.frp.logic.gt(posB, 0));
    let hiddenScreens = screensFactories.map(x => null);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
    let screenHelper = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, function() {});
    let dependants = screensFactories.reduce((a, v) => a.concat(v.dependants || []), []);
    let me = this;
    let moveScreen = function(dir) {
        return function() {
            let pos = posB.get();
            let next = pos + dir;
            let prevData = {};
            if (next <= screensFactories.length && next >= 0) {
                
                if (dir > 0) {
                    frp.accessTrans.apply(frp, [function() {
                        prevData[next] = screensFactories[pos].next();
                    }].concat(dependants));
                }
                if (next === screensFactories.length) {
                    // finish action next is the start, however we need to inform
                    screensFactories.forEach(f => f.reset && f.reset());
                    hiddenScreens = screensFactories.map(x => null);
                    prevData = {};
                    next = 0;
                }
                hiddenScreens[pos] = bodyContainer.firstChild;
                goog.dom.removeChildren(bodyContainer);

                pos = next;
                let func = () => {
                    nextEnabledBB.set(screensFactories[pos].create(bodyContainer, hiddenScreens[pos], me.finishedB_, prevData[pos]));
                };

                let args = [func].concat(screensFactories[pos].dependants || []);
                frp.accessTrans.apply(frp, args);
                hiddenScreens[pos] = null;
                posB.set(pos);
            }
        };
    };
    let nextActionB = frp.createCallback.apply(frp, [moveScreen(1), posB, nextEnabledBB, me.finishedB_].concat(dependants));
    let prevActionB = frp.createCallback(moveScreen(-1), posB, nextEnabledBB);

    frp.accessTrans(function() {
        nextEnabledBB.set(screensFactories[0].create(bodyContainer, null, me.finishedB_));
    }, posB, nextEnabledBB);

    let nextEnabledB = frp.switchB(nextEnabledBB);
    this.nextWidget_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.previousWidget_ = new recoil.ui.widgets.ButtonWidget(scope);

    this.nextWidget_.attachStruct({
        action: nextActionB,
        enabled: nextEnabledB,
        text: nextTextB});
    this.previousWidget_.attachStruct({
        action: prevActionB,
        text: recoil.ui.messages.PREVIOUS.toString()});

    html.enableClass(messageContainer, 'error',
                     recoil.frp.logic.not(recoil.ui.BoolWithExplanation.toBool(nextEnabledB)));
    html.innerText(messageContainer, recoil.ui.BoolWithExplanation.toString(nextEnabledB));
    this.previousWidget_.getComponent().render(prevContainer);
    buttonContainer.appendChild(messageContainer);
    this.nextWidget_.getComponent().render(buttonContainer);

};

/**
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.Wizard.prototype.getFinishedE = function() {
    return this.finishedB_;
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Wizard.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Wizard.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

