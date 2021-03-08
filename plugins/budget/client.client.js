goog.provide('budget.Client');


goog.require('aurora.Client');
goog.require('aurora.db.Comms');
goog.require('aurora.db.PermDatabase');
goog.require('aurora.db.Schema');
goog.require('budget.WidgetScope');
goog.require('recoil.db.ChangeDb');
goog.require('recoil.db.ReadWriteDatabase');


/**
 * @constructor
 * @extends {aurora.Client}
 */
budget.Client = function() {
    let schema = new aurora.db.Schema();
    let db = new recoil.db.ChangeDb(schema);
    let comms = new aurora.db.Comms(db, schema, this);


    let database = new aurora.db.PermDatabase(new recoil.db.ReadWriteDatabase(aurora.recoil.frp, comms));

    let scope = new budget.WidgetScope(aurora.recoil.frp, database, comms);
    aurora.Client.call(this, scope, function() {
        document.getElementById('budget-loading').style.display = 'none';
        document.getElementById('budget-content').style.display = 'flex';
    });
};
goog.inherits(budget.Client, aurora.Client);


/**
 * @final
 * @type {!budget.Client}
 */
budget.Client.instance = new budget.Client();


/**
 * @return {!budget.WidgetScope}
 */
budget.Client.scope = function() {
    return/** @type {!budget.WidgetScope} */(budget.Client.instance.scope());
};


/**
 * @final
 * @type {Object<string,function(recoil.structs.table.ColumnKey,string,Object):recoil.ui.widgets.table.Column>}
 */
budget.Client.typeFactories = (function() {
    let factories = {};
    return goog.object.extend(aurora.Client.typeFactories, factories);
})();


/**
 * @const
 */
budget.Client.VERSION = '1';

/**
 * @param {boolean} val
 */
budget.Client.setOverride = function(val) {
    aurora.permissions.setOverride(budget.Client.scope(), val);
};
