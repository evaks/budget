goog.provide('budget.access');
goog.provide('budget.filter');

goog.require('recoil.db.Query');


/**
 * @return {function(aurora.db.access.SecurityContext, string):boolean}
 */
budget.access.avialablity = function() {
    return function(context, accessRight) {

        if (context.permissions && context.permissions['site-management']) {
            return true;
        }
        if (accessRight == 'r') {
            return true;
        }

        if (context.permissions && context.permissions['mentor']) {
            if (context.change) {
                let invalidMentor = false;
                context.change.forEachChange(function(change) {
                    if (change instanceof recoil.db.ChangeSet.Set && '/base/mentor_availablity/mentorid' == change.path().pathAsString()) {
                        invalidMentor = change.value().db != context.userid;
                    }

                });
                if (invalidMentor) {
                    return false;
                }
            }
            if (context.object) {
                return context.object.mentorid == context.userid;
            }

            return true;
        }
        return false;
    };
};


/**
 * @param {aurora.db.access.SecurityContext} context
 * @return {!recoil.db.Query}
 */
budget.filter.userMentor = function(context) {
    let query = new recoil.db.Query();

    return query.or(
        query.eq('@userid', 'id'),
        query.eq('@userid', 'mentorid'),
    );
};


/**
 * @param {aurora.db.access.SecurityContext} context
 * @return {!recoil.db.Query}
 */
budget.filter.isMentor = function(context) {
    let query = new recoil.db.Query();
    return query.isIn(query.field(aurora.db.schema.tables.base.user.cols.id), [query.raw("SELECT ug.id FROM `user_group` ug, `group` tg, `group_permission` tgp, `permission` tp WHERE tp.name = 'mentor' and ug.groupid = tg.id and tgp.groupid = tg.id and tp.id = tgp.permissionid")]);
};


/**
 * @param {aurora.db.access.SecurityContext} context
 * @return {!recoil.db.Query}
 */
budget.filter.client = function(context) {
    let query = new recoil.db.Query();
    return query.isIn(query.field(aurora.db.schema.tables.base.user.cols.id), [query.raw("SELECT ug.id FROM `user_group` ug, `group` tg WHERE tg.name = 'client' and ug.groupid = tg.id")]);
};



/**
 * @param {aurora.db.access.SecurityContext} context
 * @return {!recoil.db.Query}
 */
budget.filter.budgetMentor = function(context) {
    let query = new recoil.db.Query();

    return query.or(
        query.eq('@userid', 'userid'),
        query.eq('@userid', query.field(['userid', 'mentorid'])),
    );
};
