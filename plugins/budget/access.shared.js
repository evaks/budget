goog.provide('budget.filter');

goog.require('recoil.db.Query');

/**
 * @param {aurora.db.access.SecurityContext} context
 * @return {!recoil.db.Query}
 */
budget.filter.userMentor = function(context) {
    let query = new recoil.db.Query();

    return query.or(
        query.equals('@userid', 'userid'),
        query.equals('@userid', 'mentorid'),
    );
};
