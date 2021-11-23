goog.provide('budget.Chat');


goog.require('aurora.ChatInterface');


/**
 * @implements {aurora.ChatInterface}
 * @constructor
 * @param {!aurora.db.sql.Reader} reader
 */

budget.Chat = function(reader) {
    this.reader_ = reader;
};


/**
 * @param {Object} offerer the security context of the user making the offer
 * @param {Object} offeree the security context of the user getting the offer
 * @param {function(boolean,string)} callback called with true if allowed
 */
budget.Chat.prototype.allowOffer = function(offerer, offeree, callback) {
    let fromPerm = offerer.permissions || {};
    let toPerm = offeree.permissions || {};
    let elevatedPerms = ['user-management', 'site-management', 'mentor'];
    let me = this;
    let getUserName = function (id, mentor) {
        let query = new recoil.db.Query();
        let userT = aurora.db.schema.tables.base.user;
        me.reader_.readObjects(
            {}, userT,
            query.eq(userT.cols.id, query.val(id))
            , null, //
            function(err, users) {
                if (err || users.length !== 1) {
                    callback(false,'');
                }
                else {
                    let name = users[0].firstName || users.username || '';
                    if (!mentor) {
                        name = ((users[0].firstName || '')  + ' ' + (users[0].lastName || '') +
                                ' (' + users[0].username + ')').trim();
                        
                    }
                    callback(true, name);
                }
            });
    };
        
        // employees can call anyone
    for (let i = 0; i < elevatedPerms.length; i++) {
        if (fromPerm[elevatedPerms[i]]) {
            getUserName(offerer.userid, true);
            return;
        }
    }

    // clients can't call other clients
    let found = false;
    for (let i = 0; i < elevatedPerms.length; i++) {
        if (toPerm[elevatedPerms[i]]) {
            found = true;
            break;
        }
    }
    if (!found) {
        callback(false);
        return;
    }

    let query = new recoil.db.Query();

    let appointmentsT = aurora.db.schema.tables.base.appointments;

    // clients can only call someone they currently have a booking with
    // for now, that might change

    let now = new Date().getTime();
    let earlyTime = 600000; // 10 minutes, maybe this will change it could be if they are present
    this.reader_.readObjects(
        {}, appointmentsT,
        query.and(
//            query.lt(query.field(appointmentsT.cols.start), query.val(now + earlyTime)),
//            query.gt(query.field(appointmentsT.cols.stop), query.val(now)),
            query.eq(query.field(appointmentsT.cols.userid), query.val(offerer.userid)),
            query.eq(query.field(appointmentsT.cols.mentorid), query.val(offeree.userid)),
            query.gt(query.field(appointmentsT.cols.stop), query.val(now)),
        )
        , null, //
        function(err, appointments) {
            if (err || appointments.length === 0) {
                callback(false, '');
            }
            else {
                getUserName(offerer.userid, false);
            }
        });
};
