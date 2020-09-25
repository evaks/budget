goog.provide('budget.widget.loader');

goog.require('aurora.websocket');
goog.require('budget.Client');
goog.require('recoil.frp.Frp');


console.log('recoil.widgets.client.js YOYOYO');

/**
 * @export
 */
budget.widget.loader = function() {};


aurora.Client.startLoader(budget.Client.instance);
