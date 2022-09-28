goog.provide('aurora.WidgetScope');

goog.require('recoil.ui.WidgetScope');

/**
 * @extends {recoil.ui.WidgetScope}
 * @param {!recoil.frp.Frp} frp
 * @param {!recoil.db.Database=} db
 * @constructor
 */
aurora.WidgetScope = function(frp, db) {
    recoil.ui.WidgetScope.call(this, frp, undefined);
    this.db_ = db;
};
goog.inherits(aurora.WidgetScope, recoil.ui.WidgetScope);

/**
 * @return {!recoil.db.Database|undefined}
 */
aurora.WidgetScope.prototype.getDb = function() {
    return this.db_;
};

/**
 * @param {!aurora.db.schema.TableType} tbl
 * @param {!recoil.structs.table.ColumnKey} nameCol
 * @return {!recoil.frp.Behaviour<!Array<{id:?, name: string}>>}
 */
aurora.WidgetScope.prototype.getRefList = function(tbl, nameCol) {
    let frp = this.getFrp();

    return frp.liftB(function(t) {
        let res = [];
        t.forEach(function(row) {
            res.push({id: row.get(tbl.info.pk), name: row.get(nameCol) });
        });

        return res;
    }, this.getDb().get(tbl.key));
};

/**
 * @param {!recoil.frp.Behaviour} actionB
 * @param {!Object} params
 * @return {Promise}
 */
aurora.WidgetScope.prototype.performAction = async function (actionB, params) {
    let frp = this.getFrp();

    return new Promise(function (accept, reject) {
        let performed = false;
        let  listenerB = frp.liftB((changes) => {
            if (!performed) {
                performed = true;
                actionB.set({action: params});
                return;
            }

            for (let i = 0; i < changes.length; i++) {
                let change = changes[i];
                if (change.output) {
                    frp.detach(listenerB);
                    if (change.output.error == undefined) {
                        accept(change.output);
                    }
                    else {
                        reject(change.output.error);
                    }
                    break;
                }
            }
        }, frp.changesE(actionB), actionB);
        frp.attach(listenerB);
    });
};
