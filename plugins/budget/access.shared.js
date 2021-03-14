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
budget.filter.budgetMentor = function(context) {
    let query = new recoil.db.Query();

    return query.or(
        query.eq('@userid', 'userid'),
        query.eq('@userid', query.field(['userid', 'mentorid'])),
    );
};
