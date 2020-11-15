goog.provide('budget.filter');

goog.require('recoil.db.Query');

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
