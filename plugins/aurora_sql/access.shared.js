goog.provide('aurora.db.access');
goog.provide('aurora.db.access.filter');

goog.require('recoil.db.Query');

/**
 * @typedef {{userid:?number,permissions:!Object<string,boolean>}}
 */
aurora.db.access.SecurityContext;

/**
 * @param {!Array<!Object<string,string>>} permissions
 * @return {function(aurora.db.access.SecurityContext, string):boolean}
 */
aurora.db.access.basic = function(permissions) {

    let def = '';
    for (let i = 0; i < permissions.length; i++)
    {
        if (permissions[i][''] != undefined) {
            def = permissions[i][''];
        }
    }

    //     aurora.sql.access.basic([{'super': 'crud'}, {'admin':'r'},{'': ''}]
    return function(secContext, accessRight) {
        for (let i = 0; i < permissions.length; i++)
        {
            let perm = permissions[i];
            for (let userPerm in secContext.permissions) {
                let curPerm = perm[userPerm];
                if (curPerm != undefined) {
                    if (curPerm.indexOf(accessRight) !== -1) {
                        return true;
                    }
                    if (curPerm.indexOf('-' + accessRight) !== -1) {
                        return false;
                    }
                }
            }
        }
        return def.indexOf(accessRight) !== -1;
    };
};


/**
 * will not grant permission to anyone usefull for system tables
 * @param {!aurora.db.access.SecurityContext} context
 * @return {boolean}
 */
aurora.db.access.none = function(context) {
    return false;
};

/**
 * @param {aurora.db.access.SecurityContext} context
 * @return {!recoil.db.Query}
 */
aurora.db.access.filter.allFilter = function(context) {
    return new recoil.db.Query().True();
};

/**
 * @param {aurora.db.access.SecurityContext} context
 * @return {!recoil.db.Query}
 */
aurora.db.access.filter.trueFilter = function(context) {
    return new recoil.db.Query().True();
};




/**
 * @param {string} field1
 * @param {string} field2
 * @return {function(aurora.db.access.SecurityContext):recoil.db.Query}
 */
aurora.db.access.filter.equal = function(field1, field2) {
    let query = new recoil.db.Query();
    return function(context) {
        return query.eq(field1, field2);
    };
};


/**
 * @param {!Array<Object<string,function(!aurora.db.access.SecurityContext):!recoil.db.Query>>} options
 * @return {function(!aurora.db.access.SecurityContext):!recoil.db.Query}
 */
aurora.db.access.filter.choice = function(options) {
    let query = new recoil.db.Query();
    return function(context) {
        let def = null;
        for (let i = 0; i < options.length; i++) {
            let opt = options[i];
            for (let perm in opt) {
                if (perm === '') {
                    def = opt[perm];
                }
                else if (context.permissions[perm]) {
                    return opt[perm](context);
                }
            }
        }
        if (def) {
            return def(context);
        }
        return query.False();
    };
};
