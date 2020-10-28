goog.provide('aurora.Client');
goog.provide('aurora.ui');
goog.provide('aurora.ui.registerWindowSizes');


goog.require('aurora.db.Comms');
goog.require('aurora.db.Schema');
goog.require('aurora.recoil.frp');
goog.require('recoil.db.ChangeDb');
goog.require('recoil.db.ReadWriteDatabase');
goog.require('recoil.frp.Frp');
goog.require('recoil.ui.widgets.table.BooleanColumn');
goog.require('recoil.ui.widgets.table.NumberColumn');
goog.require('recoil.ui.widgets.table.PasswordColumn');
goog.require('recoil.ui.widgets.table.SelectColumn');
goog.require('recoil.ui.widgets.table.StringColumn');
goog.require('recoil.ui.widgets.table.TextAreaColumn');
goog.require('recoil.util.Sequence');

/**
 * a base class clients can use implement global client
 * functionality
 * @constructor
 * @param {!aurora.WidgetScope} scope
 * @param {function()} loadDone called when loading is done
 */
aurora.Client = function(scope, loadDone) {
    this.scope_ = scope;
    goog.ui.Component.setDefaultRightToLeft(false);

    this.dataLoadRegistry_ = 0;
    this.dataLoadRegistryId_ = {};
    this.dataLoadStartTime_ = 0;
    this.dataLoadDone_ = false;
    this.loadStarted_ = false;
    this.widgetsLoaded_ = false;
    this.stopPolling_ = true;
    this.frp_ = scope.getFrp();
    let frp = this.frp_;
    this.storedStateB_ = frp.createB(null);
    this.screenShownB_ = aurora.ui.screenShownB;

    var me = this;
    let canReload = false;

    aurora.websocket.onError(function(err) {
        if (err.error === aurora.websocket.error.NO_SESSION) {
            // if this is the first thing then don't reload it goes
            // into an infinate loop
            if (canReload) {
                aurora.ui.forceReload();
            }
        }
    });

    frp.attach(frp.liftB(function(events) {
        events.forEach(function(v) {
            if (v === true) {

                me.widgetsLoaded_ = true;
                setTimeout(function() {
                    canReload = true;
                }, 2000);
            }
        });
    }, aurora.ui.widgetsLoadedE));



};



/**
 * @private
 */
aurora.Client.prototype.loadDoneFunc_ = function() {
    var me = this;
    if (this.dataLoadRegistry_ === 0 && this.loadStarted_) {
        console.log('unhiding ***********************', this.loadStarted_);

        if (this.loadingDone_) {
            this.loadingDone_();
        }

        console.info('Page Loaded in ' + ((new Date().getTime() - this.dataLoadStartTime_) / 1000).toFixed(2) + ' seconds');
        this.dataLoadStartTime_ = 0;
        this.dataLoadDone_ = true;

        this.frp_.accessTrans(function() {
            me.screenShownB_.set(true);
        }, me.screenShownB_);
    }
};

/**
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tableB
 * @param {!recoil.frp.Behaviour<Array>} pkB
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */
aurora.Client.prototype.createSubTableB = function(tableB, pkB, col) {
    return aurora.db.Helper.createSubTableB(new aurora.db.Schema(), tableB, pkB, col);
};
/**
 * @return {!recoil.frp.Behaviour<boolean>}
 */
aurora.Client.prototype.screenShownB = function() {
    return this.screenShownB_;
};
/**
 * @return {boolean}
 */
aurora.Client.prototype.loadDone = function() {
    return this.dataLoadDone_;
};
/**
 * @param {string} id
 */
aurora.Client.prototype.registerLoad = function(id) {
    var data = this.dataLoadRegistryId_[id];
    if (data) {
        return;
    }
    this.dataLoadRegistryId_[id] = {done: false};

    if ((this.dataLoadRegistry_ === 0 || !this.loadStarted_)) {
        try {
            if (!this.dataLoadDone_) {
                document.getElementById('loading').style.display = 'block';
                document.getElementById('loading').style.backgroundColor = 'rgb(252, 252, 252)';
            }
        }
        catch (e) {
        }
        this.dataLoadStartTime_ = new Date().getTime();
    }
    this.loadStarted_ = this.widgetsLoaded_;

    this.dataLoadRegistry_++;
    console.log('reg start', this.dataLoadRegistry_, id);
};


/**
 * indicate that something is loaded
 * @param {string} id
 */
aurora.Client.prototype.registerLoadDone = function(id) {
    var data = this.dataLoadRegistryId_[id];
    if (!data || data.done) {
        return;
    }
    this.dataLoadRegistry_--;
    data.done = true;
    console.log('reg done', this.dataLoadRegistry_, id);
    this.loadDoneFunc_();
};

/**
 * @return {!aurora.WidgetScope}
 */
aurora.Client.prototype.scope = function() {
    return this.scope_;
};

/**
 * this should be called to start loading widgets once everything is ready
 * @param {!aurora.Client} client
 */
aurora.Client.startLoader = function(client) {
    aurora.websocket.onReady(function() {
        console.log('aurora.websocket.onReady');
        var scope = client.scope();
//    aurora.recoil.widgets.inflate(scope);
        scope.getFrp().accessTrans(function() {
            aurora.ui.widgetsLoadedE.set(true);
        }, aurora.ui.widgetsLoadedE);
    });


    window.addEventListener('load', function() {
        console.log('loaded');
        var scope = client.scope();
        aurora.recoil.widgets.inflate(scope);
        scope.getFrp().accessTrans(function() {
            aurora.ui.widgetsLoadedE.set(true);
        }, aurora.ui.widgetsLoadedE);

    });
};

/**
 * @final
 * @type {Object<string,function(recoil.structs.table.ColumnKey,string,Object):recoil.ui.widgets.table.Column>}
 */
aurora.Client.typeFactories = {
    'number':
    /**
     * @param {!recoil.structs.table.ColumnKey} key
     * @param {string} name
     * @param {Object} meta
     * @return {!recoil.ui.widgets.table.Column}
     */
    function(key, name, meta) {
        return new recoil.ui.widgets.table.NumberColumn(key, name, meta);
    },
    'enum' : function(meta, name) {
        return new recoil.ui.widgets.table.SelectColumn(meta, name, []);
    }, 'int': function(key, name, meta) {
        return new recoil.ui.widgets.table.NumberColumn(key, name, meta);
    }, 'string': function(key, name) {
        return new recoil.ui.widgets.table.StringColumn(key, name);
    }, 'text': function(key, name) {
        return new recoil.ui.widgets.table.TextAreaColumn(key, name);
    }, 'password': function(key, name) {
        return new recoil.ui.widgets.table.PasswordColumn(key, name);
    }, 'binary': function(key, name) {
        return new recoil.ui.widgets.table.StringColumn(key, name);
    }, 'hex-string': function(key, name) {
        return new recoil.ui.widgets.table.StringColumn(key, name);
    }, 'boolean': function(key, name) {
        return new recoil.ui.widgets.table.BooleanColumn(key, name);
    }, 'bool': function(key, name) {
        return new recoil.ui.widgets.table.BooleanColumn(key, name);
    }, 'select': function(key, name) {
        return new recoil.ui.widgets.table.SelectColumn(key, name, []);
    }, 'reference': function(key, name) {
        return new recoil.ui.widgets.table.SelectColumn(key, name, []);
    },

    'object': function(key, name) {
        var col = new recoil.ui.widgets.table.StringColumn(key, name);
        //col.meta_.converter = new wtm.converters.ObjectStringConverter();
        return col;
    }
};


/**
 * sees if the browser need literal ipv6 address
 * @return {boolean}
 */
aurora.ui.requireLiteralIPv6 = function() {
    return (navigator.userAgent.indexOf('MSIE') != -1 || /Edge\/\d./i.test(navigator.userAgent));
};

/**
 * @private
 */
aurora.ui.userChanges_ = {};

/**
 * change message will not appear when leaving page
 */
aurora.ui.resetUserChanges = function() {
    aurora.ui.userChanges_ = {};
};


/**
 * change message will not appear when leaving page
 */
aurora.ui.forceReload = function() {
    aurora.ui.resetUserChanges();
    location.reload();
};

/**
 * Allow widgets to register user changes to block user leaving page.
 * @param {string} widgetId Unique id of the widget
 * @param {boolean} hasChanges True if the widget has user changes, else false if not.
 * @param {string=} opt_message (optional) Custom message to display if the widget has user changes.
 */
aurora.ui.userChanges = function(widgetId, hasChanges, opt_message) {
    if (hasChanges) {
        aurora.ui.userChanges_[widgetId] = {message: opt_message};
    }
    else {
        delete aurora.ui.userChanges_[widgetId];
    }
};

/**
 * @return {boolean}
 */
aurora.ui.hasUserChanges = function() {
    for (let key in aurora.ui.userChanges_) {
        return true;
    }
    return false;
};
/**
 * @return {string}
 */
aurora.ui.getLeavePageMessage = function() {
    var user_changes = aurora.ui.userChanges_;
    var message = '';
    var seen = {};
    for (let key in user_changes) {
        let change = user_changes[key];
        if (change.message) {
            if (!seen[change.message]) {
                message += change.message + '\n';   // Must be \n to work in browser confirm popups.
                seen[change.message] = true;
            }

        }
    }
    // Confirm to go to page
    if (message.length == 0) {
        message = 'There are un-applied changes on this page. Changes will not be retained.';
    }
    return message;
};

(function() {
    document.addEventListener('load', function() {
        window.onbeforeunload = function() {
            if (!aurora.ui.hasUserChanges()) {
                return undefined;
            }

            return aurora.ui.getLeavePageMessage();
        };
    });
})();

/**
 * @export
 * @param {Array<{name:string, width:number}>} sizes
 */
aurora.ui.registerWindowSizes = function(sizes) {

};

/**
 * @final
 * @type {!recoil.frp.Behaviour<string>}
 */
aurora.ui.windowSizeB = aurora.recoil.frp.createB('normal');

/**
 */
aurora.ui.widgetsLoadedE = aurora.recoil.frp.createE();

/**
 */
aurora.ui.screenShownB = aurora.recoil.frp.createB(false);
