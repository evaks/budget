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
