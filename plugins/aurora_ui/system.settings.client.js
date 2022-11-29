goog.provide('aurora.widgets.SystemSettings');


goog.require('aurora.db.schema.tables.base.system_settings');
goog.require('goog.dom');
goog.require('recoil.ui.ComponentWidgetHelper');


/**
 * @constructor
 * @export
 * @param {!aurora.widgetscope} scope
 * @param {number} userid
 * @implements {recoil.ui.Widget}
 */
aurora.widgets.SystemSettings = function(scope, userid) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    const settingsT = aurora.db.schema.tables.base.system_settings;
    this.tableWidget_ = new recoil.ui.widgets.table.TableWidget(scope);

    let settingsB = aurora.widgets.SystemSettings.get(scope);
    let contextB = aurora.permissions.getContext(scope);
    
    let displaySettingsB = frp.liftBI(function(tbl, context) {
        let columns = new recoil.ui.widgets.TableMetaData();
        let res = tbl.createEmpty();

        res.addColumnMeta(settingsT.cols.value, {displayLength: 30});

        columns.add(settingsT.cols.name, 'Setting');
        columns.add(settingsT.cols.value, 'Value');
        let rows = [];


        tbl.forEachModify(function(row) {
            if (aurora.permissions.has('site-management')(context)) {
                rows.push(row);
            }
        });
        rows.sort(function(x, y) {
            return x.get(settingsT.cols.name).localeCompare(y.get(settingsT.cols.name));
        });
        let factories = tbl.getMeta().typeFactories;
        rows.forEach (function(row, i) {
            row.setPos(i);
            let type = row.get(settingsT.cols.type);
            let factory = factories[type];

            if (factory) {
                let meta = factory(settingsT.cols.value, '', {}).getMeta({});
                row.addCellMeta(settingsT.cols.value, meta);
            }
            
            
            res.addRow(row);
        });
        return columns.applyMeta(res);
    }, function(t) {
        settingsB.set(t);
    }, settingsB, contextB);

    this.tableWidget_.attachStruct(displaySettingsB);

};

/**
 * @param {!aurora.widgetscope} scope
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */
aurora.widgets.SystemSettings.get = function (scope) {
    let frp = scope.getFrp();
    const settingsT = aurora.db.schema.tables.base.system_settings;
    let settingsB = scope.getDb().get(settingsT.key);
    const converters = {
        'boolean' : {
            encode: v => v === 'true',
            decode: v => v ? 'true' : 'false'
        },
        'object': {
            encode: v => {try {return JSON.parse(v);} catch (e) {return v;}},
            decode: v => JSON.stringify(v),
        }
    };

    return frp.liftBI(tbl => {
        let res = tbl.createEmpty();
        tbl.forEachModify(row => {
            let type = row.get(settingsT.cols.type);
            let converter = converters[type];

            
            if (converter) {
                row.set(settingsT.cols.value, converter.encode(row.get(settingsT.cols.value)));
            }
            res.addRow(row);
        });
        return res.freeze();
    }, tbl => {
        let res = tbl.createEmpty();
        tbl.forEachModify(row => {
            let type = row.get(settingsT.cols.type);
            let converter = converters[type];

            
            if (converter) {
                row.set(settingsT.cols.value, converter.decode(row.get(settingsT.cols.value)));
            }
            res.addRow(row);
        });
        
        settingsB.set(res.freeze());
    }, settingsB);
                      
};

/**
 * @return {!goog.ui.Component}
 */
aurora.widgets.SystemSettings.prototype.getComponent = function() {
    return this.tableWidget_.getComponent();
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

aurora.widgets.SystemSettings.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

