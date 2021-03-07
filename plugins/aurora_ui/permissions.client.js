goog.provide('aurora.permissions');

goog.require('aurora.db.schema.tables.sec.permissions');

/**
 * @typedef {{userid:?, permissions: !Object<string,boolean>}}
 */
aurora.permissions.Context;

/**
 * @param {boolean} loggedIn
 * @return {function(!aurora.permissions.Context):boolean}
 */
aurora.permissions.loggedIn = function(loggedIn) {
    return function(context) {
        if (context.allowAll) {
            return true;
        }
        return (context.userid != null) === loggedIn;
    };
};



/**
 * @param {string} permission
 * @return {function(!aurora.permissions.Context):boolean}
 */
aurora.permissions.has = function(permission) {
    return function(context) {
        if (context.userid == null) {
            return false;
        }
        return !!context.permissions[permission];
    };
};


/**
 * @param {!Array<string|function(!aurora.permissions.Context):boolean>} permissions
 * @return {function(!aurora.permissions.Context):boolean}
 */
aurora.permissions.hasAny = function(permissions) {
    return function(context) {
        if (context.allowAll) {
            return true;
        }
        if (context.userid == null) {
            return false;
        }
        for (let i = 0; i < permissions.length; i++) {
            let perm = permissions[i];
            let val;
            if (typeof(perm) === 'string') {
                val = context.permissions[perm];
            }
            else {
                val = perm(context);
            }
            if (val) {
                return true;
            }
        }
        return false;
    };
};

/**
 * @param {!Array<string|function(!aurora.permissions.Context):boolean>} permissions
 * @return {function(!aurora.permissions.Context):boolean}
 */
aurora.permissions.hasAll = function(permissions) {
    return function(context) {
        if (context.allowAll) {
            return true;
        }
        if (context.userid == null) {
            return false;
        }
        for (let i = 0; i < permissions.length; i++) {
            let perm = permissions[i];
            let val;
            if (typeof(perm) === 'string') {
                val = context.permissions[perm];
            }
            else {
                val = perm(context);
            }
            if (!val) {
                return false;
            }
        }
        return true;
    };
};


/**
 * @param {function(!aurora.permissions.Context):boolean} func
 * @return {function(!aurora.permissions.Context):boolean}
 */
aurora.permissions.not = function(func) {
    return function(context) {
        return !func(context);
    };
};

/**
 * @param {!aurora.WidgetScope} scope
 * @return {!recoil.frp.Behaviour<!aurora.permissions.Context>}
 */
aurora.permissions.getContext = function(scope) {
    return aurora.permissions.getContextDb(scope.getFrp(), /** @type {!recoil.db.Database} */ (scope.getDb()));
};

/**
 * @private
 */
aurora.permissions.overrideB_ = null;
/**
 * used for testing to check that the server actually block the command it
 * isn't only the client side
 * @param {!recoil.frp.Frp} frp
 * @return {!recoil.frp.Behaviour<boolean>}
 */
aurora.permissions.getOverride = function(frp) {
    if (aurora.permissions.overrideB_) {
        return aurora.permissions.overrideB_;
    }
    aurora.permissions.overrideB_ = recoil.ui.frp.LocalBehaviour.create(frp, '1', 'aurora.client.perm.override', false, localStorage);
    return aurora.permissions.overrideB_;
};
/**
 * @param {!aurora.WidgetScope} scope
 * @param {boolean} val
 */
aurora.permissions.setOverride = function(scope, val) {
    let overrideB = aurora.permissions.getOverride(scope.getFrp());
    scope.getFrp().accessTrans(function() {
        overrideB.set(val);
    }, overrideB);
};

/**
 * @param {!recoil.frp.Frp} frp
 * @param {!recoil.db.Database} db
 * @return {!recoil.frp.Behaviour<!aurora.permissions.Context>}
 */
aurora.permissions.getContextDb = function(frp, db) {
    let overrideB = aurora.permissions.getOverride(frp);

    let permT = aurora.db.schema.tables.sec.permissions;
    return frp.liftB(function(tbl, override) {
        let res = {};
        if (override) {
            res.allowAll = true;
        }
        tbl.forEach(function(row) {
            res.userid = row.get(permT.cols.userid);
            res.permissions = row.get(permT.cols.permissions);
        });
        return res;
    }, db.get(permT.key), overrideB);
};
