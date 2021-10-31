goog.provide('budget.actions');

goog.require('aurora.log');
goog.require('aurora.permissions');
goog.require('budget.appointments');
goog.require('config');
goog.require('recoil.db.Query');

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {!Array} inputs
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.checkUsername = function(coms, context, reader, inputs, callback) {

};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {!Array} inputs
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.suggestUsername = function(coms, context, reader, inputs, callback) {
    let failCb = function(err) {callback(err, []);};

    if (inputs instanceof Array) {
        let object = {};

        for (let i = 0; i < inputs.length; i++) {
            let input = inputs[i];
            for (let k in input) {
                object[k] = input[k];
            }
        }
        let userT = aurora.db.schema.tables.base.user;
        // don't allow specification of primary key

        let username = object[userT.cols.username.getName()];
        if (username && typeof(username) !== 'string') {
            callback('invalid username', []);
            // error here we use username length in sql
            return;
        }
        let firstName = object[userT.cols.firstName.getName()];
        let lastName = object[userT.cols.lastName.getName()];

        if (!username || username.trim().length === 0) {

            if (firstName && firstName.trim().length !== 0) {
                username = firstName.trim();
            }
            if (lastName && lastName.trim().length !== 0) {
                if (username && username.length > 0) {
                    username += '.' + lastName;
                }
                else {
                    username = lastName;
                }

            }
        }
        if (!username || username.trim().length === 0) {
            username = 'user1';
        }

        username = username.toLowerCase();
        // sanatize so username has no regex chars
        reader.query('SELECT username FROM `user` WHERE username = ?username', {'username': username}, function(err, result) {
            if (err) {
                callback(err, []);
                return;
            }
            else if (result.length === 0) {
                callback(null, username);
                return;
            }
            username = username.replace(/[0-9+]$/, '');
            username = username.replace(/\^|\$|\*|\+|\?|\||\(|\)|\\|\{|\}|\[|\]/g, '_');
            reader.query('SELECT max(cast(substring(username,?len) as UNSIGNED )) username FROM `user` WHERE username rlike ?username', {'len': (username.length + 1) , 'username': username.replace(/\./g, '\\.') + '[0-9]*'}, function(err, result) {
                if (err) {
                    callback(err, []);
                }
                else if (result.length === 0) {
                    callback(null, username);
                }
                else {
                    let max = result[0]['username'];
                    max = max == null ? 0 : max;
                    callback(null, username + (max + 1));
                }
            });
        });
    }
    else {
        callback('Invalid Parameters Passed', []);
    }

};

/**
 * will get email login details, if doesn't exist will create one
 * @param {?} secContext
 * @param {function (?, ?, ?, ?)} callback (error, transport, emailInfo, previewer)
 */
budget.actions.getEmailTransporterInfo_ = function(secContext, callback) {
    const nodemailer = require('nodemailer');

    let emailInfo = {
        from: '"No Reply" <no-reply@example.com>',
        to: null, // list of receivers
        replace: function(email, user, url) {
            let clone = goog.object.clone(emailInfo);
            clone.text = emailInfo.text.replaceAll('$url$', url).replaceAll('$user$', user);
            clone.html = emailInfo.html.replaceAll('$url$', url).replaceAll('$user$', goog.string.htmlEscape(user));
            clone.to = email;
            return clone;
        }
    };

    let mailInfo = ((config.authentication) || {}).mail;

    if (mailInfo) {
        let url = secContext['@base-url'] + '/account/do-reset?id=$url$';
        emailInfo.from = mailInfo.from || '"No Reply" <no-reply@example.com>';
        emailInfo.text = mailInfo.text || 'Hello $user$\nTo reset your password go to ' + url + '.';
        emailInfo.html = mailInfo.html || '<body>Hello <b>$user$</b><br>To reset your password go to <a href="' + url + '">' + url + '.</a></body>';
        emailInfo.subject = mailInfo.subject || 'Password Reset Request';

    }
    if (mailInfo && mailInfo.auth) {
        callback(null, nodemailer.createTransport(mailInfo), emailInfo, function(info) {});
    }
    else {
        nodemailer.createTestAccount().then(
            function(testAccount) {
                // create reusable transporter object using the default SMTP transport
                callback(null, nodemailer.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false, // true for 465, false for other ports
                    auth: {
                        user: testAccount.user, // generated ethereal user
                        pass: testAccount.pass, // generated ethereal password
                    },
                }), emailInfo, function(info) {
                        // Preview only available when sending through an Ethereal account
                    aurora.log.createModule('RESET-PASSWORD').warn('EMAIL not configured test message:', nodemailer.getTestMessageUrl(info));
                });


            }, function(err) {
                callback(err, null, null, null);
            }

        );
    }
};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {!Array} inputs
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.requestResetPassword = function(coms, context, reader, inputs, callback) {
    let fixError = function(err) {
        if (err && err.response) {
            return err.response;
        }
        else if (err && err.message) {
            return err.message;
        }
        return err;

    };
    const crypto = require('crypto');
    const async = require('async');
    const RESET_KEY_LEN = aurora.db.schema.getMeta(aurora.db.schema.tables.base.user.cols.resetcode).maxLength / 2; // 2 per byte

    // Generate test SMTP service account from ethereal.email
    // Only needed if you don't have a real mail account for testing
    let mod = 'RESET-PASSWORD';

    if (!(inputs instanceof Array) || inputs.length !== 1 || typeof(inputs[0]) != 'string') {
        aurora.log.createModule(mod).error('invalid password inputs', inputs);
        callback('invalid inputs', []);
        return;
    }
    let email = inputs[0];
    let query = new recoil.db.Query();
    let userT = aurora.db.schema.tables.base.user;
    budget.actions.getEmailTransporterInfo_(context, function(err, transporter, emailInfo, previewer) {
        if (err) {
            aurora.log.createModule(mod).error('unable to create email info', err);
            callback('Unable able to create email', []);
            return;
        }
        reader.readObjects(context, userT, query.eq(userT.cols.email, query.val(email)), null, function(err, data) {
            if (err) {
                aurora.log.createModule(mod).error('error reading db', err);
                callback(err, []);
            }
            else if (data.length == 0) {
                aurora.log.createModule(mod).warn('Attempt to reset invalid for', email);
                callback(null, []);
            }
            else {

                // multiple users may have same email reset them all but only respond to the first one non errored one
                let callbackDone = false;
                let errors = [];
                let successes = 0;
                async.eachSeries(data, function(user, cb) {
                    aurora.log.createModule(mod).info('Password Reset Requested for ', email);
                    let resetCode = crypto.randomBytes(RESET_KEY_LEN).toString('hex');
                    let resetId = resetCode + '_' + user.id;
                    let toSend = emailInfo.replace(email, user.username, resetId);
                    reader.updateOneLevel(context, userT, {resetcode: resetCode, resetcodetimeout: new Date().getTime()}, query.eq(user.id, query.val(user.id)), function(err) {
                        if (err) {
                            errors.push(err);
                            cb();
                            return;
                        }
                        transporter.sendMail(toSend).then(function(info) {
                            previewer(info);
                            successes++;
                            cb();
                        }, function(err) {
                            // Preview only available when sending through an Ethereal account
                            aurora.log.createModule(mod).error('failed to send email', err);
                            errors.push(err);
                            cb();
                        });
                    });

                }, function(err) {
                    if (successes || errors.length === 0) {
                        callback(null, []);
                    }
                    else {
                        callback(fixError(errors[0]), []);
                    }
                });

            }
        });
    });
};

/**
 * @private
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!Object} mentor
 * @param {!Object} user
 * @param {?number} start
 * @param {?number} length
 * @param {?string} uuid if given this is canceling an appointment
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.sendAppointmentEmail_ = function(context, mentor, user, start, length, uuid, callback) {
    let mod = 'SCHEDULE';
    let log = aurora.log.createModule(mod);
    log.info('sending emailxx');
    const ics = require('ics');
    log.info('requiring ics');
    let toEmail = [user, mentor].filter(function(v) { return v.email && v.email.indexOf('@') > 0;});
    if (toEmail.length === 0) {
        // its ok no one specified an email so we just won't send an email
        callback(null, []);
        return;
    }

    budget.actions.getEmailTransporterInfo_(context, function(err, transporter, emailInfo, previewer) {
        log.info('got transporter', err);

        if (err) {
            log.error('unable to create email info to schedule appointment', err);
            callback('Unable able to create email', []);
            return;
        }

        try {
            log.info('sending emails to', toEmail.map(function(v) {return v.email;}));
            let startDate = new Date(start);
            let userName = (user.name || '').trim();
            emailInfo.text = 'An appointment with ' + userName + ' has been scheduled with ' + mentor.firstName + ' at ' + startDate.toLocaleString();
            emailInfo.html = '<html>An appointment with <em>' + goog.string.htmlEscape(userName)
                + '</em> has been scheduled with <em>' + goog.string.htmlEscape(mentor.firstName) + '</em>' + ' at <em>' + startDate.toLocaleString() + '</em></html>';
            emailInfo.html = '<html>You have a budgeting appointment scheduled at ' + startDate.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'full', timeZone: 'Pacific/Auckland'}) + '</html>';
            emailInfo.subject = 'Budgeting Appointment';

            // ics.createEvent({start: [now.getYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()], duration: {minutes:90}, status: 'CONFIRMED', title: 'Budgeting', attendees: [{ name: 'Mo', email: 'mo@foo.com'}], alarms: { action: 'display', trigger: {minutes: 30, before: true }}});


            let icsInfo = {
                attendees: toEmail.map(function(u) {return { name: u.firstName || 'Unknown', email: u.email};}),
                alarms: [{ action: 'display', trigger: {minutes: 30, before: true }}],
            title: 'Budgeting',
            status: uuid == null ? 'CONFIRMED' : 'CANCELLED'
            };
            if (start != null) {
                let when = new Date(start);
                icsInfo.start = [when.getFullYear(), when.getMonth() + 1, when.getDate(), when.getHours(), when.getMinutes()];
                icsInfo.duration = {minutes: Math.round(length / 60000)};
            }

            ics.createEvent(icsInfo, function(err, evt) {
                if (!err) {

                    emailInfo.attachments = [{
                        filename: 'invite.ics',
                        content: evt,
                        contentType: 'text/calendar'
                    }];
                }
                else {
                    log.warn('failed to create appointment', err);
                }

                emailInfo.to = toEmail.map(function(v) { return v.email;});
                transporter.sendMail(emailInfo).then(function(info) {
                    previewer(info);
                    callback(null, []);
                }, function(err) {
                    callback(err, []);
                });
            });
        } catch (e) {
            log.error('error processing email', err);
            callback('Unable able to create email', []);
        }
    });
};

/**
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {!Array} groups
 * @param {function(!Object)} callback map of permissions to true
 *
 */
budget.actions.getGroupPermissions_ = function(context, reader, groups, callback) {
    let groupT = aurora.db.schema.tables.base.group;
    let permissionT = aurora.db.schema.tables.base.permission;
    let query = new recoil.db.Query();
    reader.readObjects(
        context, groupT,
        query.isIn(groupT.cols.id, groups), null, function(err, groups) {
            if (err) {
                callback({});
            }
            else {
                let permissions = [];
                for (let i = 0; i < groups.length; i++) {
                    let g = groups[i];
                    for (let j = 0; j < g.permission.length; j++) {
                        permissions.push(g.permission[j].permissionid);
                    }
                }

                reader.readObjects(
                    {}, permissionT,
                    query.isIn(permissionT.cols.id, permissions), null, function(err, perms) {
                        let res = {};
                        if (!err) {
                            perms.forEach(function(el) {
                                res[el.name] = true;
                            });
                        }
                        callback(res);
                    });

            }
        });

};


/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {number} userid
 * @param {?string} oldPassword
 * @param {?string} password
 * @param {function(?,!Array)} callback1 params are error, mentor user
 */
budget.actions.changePassword = function(coms, context, reader, userid, oldPassword, password, callback1) {
	let admin = context.userid != userid; // no admin level password change if changing own password
	if (!aurora.permissions.has('user-management')(context)) {
		admin = false;
        if (context.userid != userid) {
            callback1('Access Denied', []);
			return;
        }
    }

	if (password == '') {
		password = null;
	}
	if (context.userid == userid && password == null) {
        callback1('Access Denied', []);
    }

    let userT = aurora.db.schema.tables.base.user;
    let query = new recoil.db.Query();
	let userQuery = query.eq(userT.cols.id, query.val(userid));

	let updatePassword = function(password, reader, transCallback) {
		reader.updateOneLevel(
			{}, userT, {'password': password},
			userQuery, function(err) {
				if (err) {
					transCallback('Unable to  update password', []);
				}
				else {
					transCallback(null, []);
				}
			});
	};



    let update = function(value) {
        reader.transaction(function(reader, transCallback) {
            if (admin) {
			    updatePassword(value, reader, transCallback);
		    }
            else {
                let user = null;
		        reader.readLevel({}, userT, userQuery, null, function(entry, cb) {
                    user = entry;
                    cb();
                }, function(err) {
			        if (err) {
                        transCallback(err);
			        }
			        else if (user === null) {
				        transCallback('No such user');
			        }
			        else {
				        aurora.db.Pool.checkPassword(oldPassword, user.password, function(valid) {
					        if (valid) {
						        updatePassword(value, reader, transCallback);
					        }
					        else {
						        transCallback('Access Denied');
					        }

				        });
			        }
                });

		    }
        },function(err) {
            callback1(err, []);

        });
    };


    if (password) {
        aurora.db.Pool.hashPassword(password, function(err, value) {
		    if (err) {
			    callback1('Unable to hash password', []);
		    }
		    else {
                update(value);
            }
        });
    }
    else {
        update(password);
    }



};

/**
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {number} mentorid
 * @param {?number} userid
 * @param {?string} email
 * @param {?string} name
 * @param {function(?,?Object,?Object)} callback params are error, mentor user
 */
budget.actions.getApptUsers_ = function(context, reader, mentorid, userid, email, name, callback) {
    let query = new recoil.db.Query();
    let mentorObj = null;
    let userObj = null;
    let userT = aurora.db.schema.tables.base.user;
    reader.readObjects(
        context, userT,
        query.or(query.eq(userT.cols.id, query.val(mentorid)), query.eq(userT.cols.id, query.val(userid))), null, function(err, users) {
            if (err) {
                callback(err, null, null);
                return;
            }
            // we can send to a non existant user
            let userEmail = email;
            users.forEach(function(obj) {
                if (obj.id == mentorid) {
                    mentorObj = obj;
                }
                else if (obj.id == userid) {
                    userObj = obj;
                }
            });
            if (!mentorObj) {
                callback('Unable for find Mentor', null, null);
                return;
            }
            // check the mentor is a mentor
            let groups = [];
            for (let i = 0; i < mentorObj.groups.length; i++) {
                groups.push(mentorObj.groups[i].groupid);
            }

            if (!userObj) {
                userObj = {
                    name: name || '',
                    email: email || ''
                };

            } else {
                userObj.email = email && email.indexOf('@') > 0 ? userObj.email : '';
                if (name) {
                    userObj.name = name;
                } else {
                    userObj.name = (userObj.firstName + ' ' + userObj.lastName).trim();
                }
            }
            budget.actions.getGroupPermissions_(context, reader, groups, function(perms) {
                if (!perms['mentor']) {
                    callback('Mentor is not a mentor', null, null);
                }
                else {
                    callback(null, mentorObj, userObj);
                }

            });
        });

};

/**
 * @param {!aurora.db.access.SecurityContext} context
 * @param {number} mentorid
 * @param {?number} userid
 * @param {function (?, !Array)} callback (error, outputs)
 * @return {boolean}
 */
budget.actions.scheduleAppointmentSecCheck_ = function(context, mentorid, userid, callback) {
    if (!aurora.permissions.has('site-management')(context)) {
        if (aurora.permissions.has('mentor')) {
            if (context.userid != mentorid && context.userid != userid) {
                callback('Access Denied', []);
                return false;
            }
        }
        else if (aurora.permissions.has('client')) {
            if (context.userid != userid) {
                callback('Access Denied', []);
                return false;
            }
        }
        else {
            callback('Access Denied', []);
            return false;
        }
    }
    return true;
};

/**
 * @private
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {number} time
 * @param {number} length
 * @param {function (?, !Array)} callback (error, outputs)
 * @return {function(?, number, Object, Object,Array)}
 */
budget.actions.scheduleAppointmentDoneFunc_ = function(
    coms, context, time, length, callback) {
    let mod = 'SCHEDULE';
    let log = aurora.log.createModule(mod);
    return function(err, id, mentorObj, userObj, changes) {
            if (err) {
                callback(err, []);
            }
        else {
            // don't wait for email to be sent its scheduled irrelevant on the appointment being sent
            callback(err, [id]);
            if (changes.length > 0) {
                coms.notifyListeners(changes, {}, function() {});
            }
            log.info('User', context.userid, 'Scheduled appointment for ', userObj.id, 'mentor', mentorObj.id);
            budget.actions.sendAppointmentEmail_(context, /** @type {!Object} */ (mentorObj), /** @type {!Object} */ (userObj), time, length, null, function(err, val) {

            });
        }
    };
};

/**
 * @param {?} id
 * @return {string}
 */
budget.actions.createScheduleId = function(id) {
    return new Date().getTime() + '.' + id + '@' + config.http.hostname;
};

/**
 * creates al ist of paths that need to be notified for a schedule change
 * @param {?} id
 * @return {!Array<!recoil.db.ChangeSet.Path>}
 */
budget.actions.createSchedulePaths = function(id) {
    let apptT = aurora.db.schema.tables.base.appointments;
    let secApptT = aurora.db.schema.tables.base.secure_appts;

    return [
        recoil.db.ChangeSet.Path.fromString(apptT.info.path).setKeys([apptT.info.pk.getName()], [BigInt(id)]),
        recoil.db.ChangeSet.Path.fromString(secApptT.info.path).setKeys([apptT.info.pk.getName()], [BigInt(id)])];

};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {?number} apptId
 * @param {number} mentorid
 * @param {?number} userid
 * @param {?string} email
 * @param {?string} firstName
 * @param {?string} lastName
 * @param {number} time
 * @param {number} length
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.scheduleAppointment = function(coms, context, reader, apptId, mentorid, userid, email, firstName, lastName, time, length, callback) {
    let mod = 'SCHEDULE';
    let log = aurora.log.createModule(mod);
    let userT = aurora.db.schema.tables.base.user;
    let apptT = aurora.db.schema.tables.base.appointments;
    let query = new recoil.db.Query();
    // first some security checks
    log.info('Scheduling appointment');

    if (!budget.actions.scheduleAppointmentSecCheck_(context, mentorid, userid, callback)) {
        return;
    }
    let uuid = null;
    let name = ((firstName || '') + (lastName || '')).trim();
    budget.actions.getApptUsers_(context, reader, mentorid, userid, email, name, function(err, mentorObj, userObj) {
        if (err) {
            callback(err, []);
            return;
        }
        // we can send to a non existant user
        let userEmail = email;
        reader.transaction(function(reader, transCb) {
            reader.readObjects(context, apptT, query.and(
                query.eq(apptT.cols.mentorid, query.val(mentorid)),
                query.gt(apptT.cols.stop, query.val(time)),
                query.lt(apptT.cols.start, query.val(time + length))), null, function(err, appointments) {
                    if (err) {
                        transCb(err);
                    }
                    else if (appointments.length > 1) {
                        transCb('Mentor already has an appointment scheduled');
                    }
                    else if (appointments.length == 1) {
                        // check to see if the appointment scheduled matches ours
                        let a = appointments[0];
                        if (a.id !== apptId || a.mentorid != mentorid || a.userid != userid) {
                            // this is just a security check so someone can't override some elses schedule
                            transCb('Mentor already has an appointment scheduled');
                            return;
                        }
                        uuid = budget.actions.createScheduleId(a.id);
                        reader.updateOneLevel(context, apptT, {scheduled: uuid}, query.eq(apptT.cols.id, query.val(a.id)), function(err) {
                            let changes = budget.actions.createSchedulePaths(a.id).map(
                                path => new recoil.db.ChangeSet.Set(path.appendName('scheduled'), null, uuid));
                            changes.push();
                            transCb(err, a.id, mentorObj, userObj, changes);
                        });
                    }
                    else {
                        transCb('Appointment does not exist');
                    }
                });
        }, budget.actions.scheduleAppointmentDoneFunc_(coms, context, time, length, callback));
    });
};

/**
 * @param {number} start
 * @param {number} stop
 * @param {!Array} avail
 * @return {boolean}
 */
budget.actions.isAvailable_ = function(start, stop, avail) {
    let found = [];
    let periodStart = new Date(start).setHours(0, 0, 0, 0);
    let periodStop = new Date(stop).setHours(24, 0, 0, 0);

    for (let i = 0; i < avail.length; i++) {
        let a = avail[i];
        budget.appointments.iterateOverPeriod(
            null, a.start, a.stop, a.repeat, a.len, periodStart, periodStop,
            function(start, stop) {
                found.push({start: start, stop: stop});
            });
    }
    budget.appointments.mergeDayUsage(found, true);
    for (let i = 0; i < found.length; i++) {
        let e = found[i];
        if (start >= e.start && stop <= e.stop) {
            return true;
        }
    }
    return false;
};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {number} mentorid
 * @param {number} userid
 * @param {number} start
 * @param {number} stop
 * @param {function (?, !Array=)} callback (error, outputs)
 */
budget.actions.addAppointment = function(coms, context, reader, mentorid, userid, start, stop, callback) {
    let mod = 'SCHEDULE';
    let log = aurora.log.createModule(mod);

    if (!budget.actions.scheduleAppointmentSecCheck_(context, mentorid, userid, callback)) {
        return;
    }
    log.info('scheduling appointment for ', userid);
    if (start > stop) {
        callback('Invalid Appointment Length');
        return;
    } else if (stop < new Date().getTime()) {
        callback('Can\'t schedule an appointment in the past');
        return;
    }

    let holidaysT = aurora.db.schema.tables.base.site_holidays;
    let appointmentsT = aurora.db.schema.tables.base.appointments;
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let groupT = aurora.db.schema.tables.base.group;
    let permissionT = aurora.db.schema.tables.base.permission;
    let usersT = aurora.db.schema.tables.base.user;
    let length = stop - start;

    let addAppointment = async function(reader) {
        let query = new recoil.db.Query();

        let mentorPerm = await reader.readObjectsAsync(
            context, permissionT, query.eq(query.field(permissionT.cols.name), query.val('mentor')), null);
        if (mentorPerm.length === 0) {
            throw 'Internal Error no mentor permission';
        }

        let users = await reader.readObjectsAsync(
            context, usersT, query.eq(query.field(usersT.cols.id), query.val(userid)), null);

        let mentors = await reader.readObjectsAsync(
            context, usersT, query.eq(query.field(usersT.cols.id), query.val(mentorid)), null);

        if (users.length != 1) {
            throw 'User does not exist';
        }

        if (mentors.length != 1) {
            throw 'Mentor does not exist';
        }

        let mentorGroups = await reader.readObjectsAsync(
            context, groupT, query.isIn(query.field(groupT.cols.id), mentors[0].groups.map(x => x.groupid)), null);

        let user = users[0];
        let isMentor = false;
        let mentorPermId = mentorPerm[0].id;
        for (let i = 0; !isMentor && i < mentorGroups.length; i++) {
            isMentor = mentorGroups[i].permission.reduce((a, v) => a || v.permissionid == mentorPermId, false);
        }
        if (!isMentor) {
            throw 'Must schedule an appointment with a mentor';
        }

        // ae > b and ab < e
        // no ae <= b or ab >= e
        let appointments = await reader.readObjectsAsync(
            context, appointmentsT,
            query.and(
                query.eq(appointmentsT.cols.mentorid, query.val(mentorid)),
                query.gt(query.field(appointmentsT.cols.stop), query.val(start)),
                query.lt(query.field(appointmentsT.cols.start), query.val(stop))), null);
        if (appointments.length > 0) {
            throw 'Overlapps with another appointment';
        }

        let avail = await reader.readObjectsAsync(
            context, availT,
            query.and(
                query.eq(availT.cols.mentorid, query.val(mentorid)),
                query.or(
                    query.gt(query.field(availT.cols.stop), query.val(start)),
                    query.null(query.field(availT.cols.stop))),
                query.lt(query.field(availT.cols.start), query.val(stop))), null);

        if (!budget.actions.isAvailable_(start, stop, avail)) {
            throw 'Mentor is not available';
        }
        let holidays = await reader.readObjectsAsync(
            context, holidaysT,
            query.and(
                query.gt(query.field(holidaysT.cols.stop), query.val(start)),
                query.lt(query.field(holidaysT.cols.start), query.val(stop))), null);

        if (holidays.length > 0) {
            throw 'Overlapps with holiday';
        }


        let appt = {
            showed: 0, mentorid: mentorid, scheduled: null, userid: userid,
            start, stop, firstName: user.firstName || '', lastName: user.lastName || '',
            phone: user.phone || '' , email: user.email || '', address: user.address || ''};
        let res = await reader.insertAsync(context, appointmentsT, appt);
        appt.id = res.insertId;
        let uuid = budget.actions.createScheduleId(appt.id);
        await reader.updateOneLevelAsync(
            context, appointmentsT, {scheduled: uuid},
            query.eq(appointmentsT.cols.id, query.val(appt.id)));
        return {user: user, mentor: mentors[0], id: appt.id, object: appt};

    };
    log.info('User', context.userid, 'Scheduling appointment for ', userid, 'mentor', mentorid, start, stop);
    reader.transaction(function(reader, transCb) {
        addAppointment(reader).then(
            function(info) {
                let changes = budget.actions.createSchedulePaths(info.id).map(
                    path => budget.actions.makeAddChange_(path, info.object));
                transCb(null, info.id, info.mentor, info.user, changes);
                log.info('schedule done for', userid);

            }, function(err) {
                transCb(err);
            });
    }, budget.actions.scheduleAppointmentDoneFunc_(coms, context, start, length, callback));
};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {number} apptid
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.removeAppointment = function(coms, context, reader, apptid, callback) {
    budget.actions.unscheduleAppointmentInternal(coms, context, reader, apptid, true, callback);
};

/**
 * @param {!recoil.db.ChangeSet.Path} path
 * @param {Object} object
 * @return {!recoil.db.ChangeSet.Add}
 */
budget.actions.makeAddChange_ = function(path, object) {
    let deps = [];

    let meta = aurora.db.schema.getTableByName(path).meta;

    for (let k in meta) {
        let m = meta[k];
        if (object.hasOwnProperty(k) && !m.primary) {
            deps.push(new recoil.db.ChangeSet.Set(path.appendName(k), null, object[k]));
        }
    }

    return new recoil.db.ChangeSet.Add(path, deps);
};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {number} apptid
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.unscheduleAppointment = function(coms, context, reader, apptid, callback) {
    budget.actions.unscheduleAppointmentInternal(coms, context, reader, apptid, false, callback);
};
/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {number} apptid
 * @param {boolean} remove
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.unscheduleAppointmentInternal = function(coms, context, reader, apptid, remove, callback) {
    let apptT = aurora.db.schema.tables.base.appointments;
    let secApptT = aurora.db.schema.tables.base.secure_appts;
    let query = new recoil.db.Query();

    let mod = 'SCHEDULE';
    let log = aurora.log.createModule(mod);
    log.info('Unschedulingappointment');

    if (!aurora.permissions.hasAny(['mentor', 'client', 'site-management'])) {
        callback('Access Denied', []);
    }
    let changes = [];
    let userObj = null;
    let mentorObj = null;
    let a = null;
    let uuid = null;
    reader.transaction(function(reader, transCb) {
        reader.readObjects(context, apptT, query.eq(apptT.cols.id, query.val(apptid)), null, function(err, appointments) {
            if (err) {
                transCb(err);
                return;
            }
            if (appointments.length != 1) {
                transCb('Invalid Appointment');
                return;
            }
            a = appointments[0];
            if (!aurora.permissions.has('site-management')(context)) {

                if (aurora.permissions.has('mentor')) {
                    if (context.userid != a.mentorid && context.userid != a.userid) {
                        transCb('Access Denied');
                        return;
                    }
                }
                else if (aurora.permissions.has('client')) {
                    if (context.userid != a.userid) {
                        transCb('Access Denied');
                        return;
                    }
                } else {
                    transCb('Access Denied');
                }
            }

            budget.actions.getApptUsers_(context, reader, a.mentorid, a.userid, a.email, a.name, function(err, mentorObj1, userObj1) {
                if (err) {
                    transCb(err);
                    return;
                }
                mentorObj = mentorObj1;
                userObj = userObj1;

                let path = recoil.db.ChangeSet.Path.fromString(apptT.info.path).setKeys([apptT.info.pk.getName()], [BigInt(a.id)]);
                let secPath = recoil.db.ChangeSet.Path.fromString(secApptT.info.path).setKeys([apptT.info.pk.getName()], [BigInt(a.id)]);
                if (remove) {
                    reader.deleteObjects(context, apptT,
                                         query.eq(apptT.cols.id, query.val(a.id)),
                                         null, function(err) {
                        if (!err) {
                            changes.push(new recoil.db.ChangeSet.Delete(path, null));
                            changes.push(new recoil.db.ChangeSet.Delete(secPath, null));
                        }

                        transCb(err);
                    });
                }
                else {
                    reader.updateOneLevel(context, apptT, {scheduled: uuid}, query.eq(apptT.cols.id, query.val(a.id)), function(err) {

                        if (!err) {
                            changes.push(new recoil.db.ChangeSet.Set(path.appendName('scheduled'), null, null));
                        }
                        transCb(err);
                    });
                }
            });

        });
    }, function(err) {
        if (err) {
            log.warn('Error unscheduling appointment', err);
            callback(err, []);
        }
        else {
            // notify listeners before we send the email, since that can take a while and really irrevant to it being scheduled
            if (changes.length > 0) {
                coms.notifyListeners(changes, {}, function() {});
            }
            callback(err, []);
            budget.actions.sendAppointmentEmail_(context, /** @type {!Object} */ (mentorObj), /** @type {!Object} */ (userObj), a.start, a.stop - a.start, a.scheduled, function(err, val) {
                if (err) {
                    log.warn('Error sending cancel email', err);
                }
            });
        }
    });
};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {number} uid
 * @param {string} secret
 * @param {string} password
 * @param {function(?, !Array)} callback (error, outputs)
 */
budget.actions.doResetPassword = function(coms, context, reader, uid, secret, password, callback) {
    let mod = 'RESET-PASSWORD';
    let log = aurora.log.createModule(mod);

    log.info('resetting password for userid', uid);
    let userT = aurora.db.schema.tables.base.user;
    let query = new recoil.db.Query();
    let delay = ((config.authentication) || {}).resetTimeout || (24 * 3600000); // default 24 hours
    reader.readObjects(context, userT, query.and(
        query.eq(userT.cols.resetcode, query.val(secret)),
        query.eq(userT.cols.id, query.val(uid))), null, function(err, data) {
            if (err || data.length != 1) {
                callback('Unable to reset password', []);
            }
            else if (data[0].resetcodetimeout + delay < new Date().getTime()) {
                callback('Password reset password expired.', []);
            }
            else {
                let user = data[0];
                aurora.db.Pool.hashPasswordPromise(password).then(function(pword) {
                    reader.updateOneLevel(context, userT, {resetcode: null, resetcodetimeout: null, password: pword}, query.eq(user.id, query.val(user.id)), function(err) {
                        callback(err, []);
                    });
                }, function(err) {
                    callback(err, []);
                });
            }
        });
};

/**
 * @param {!aurora.db.Coms} coms
 * @param {!aurora.db.access.SecurityContext} context
 * @param {!aurora.db.Reader} reader
 * @param {!Array} inputs
 * @param {function (?, !Array)} callback (error, outputs)
 */
budget.actions.register = function(coms, context, reader, inputs, callback) {
    let userT = aurora.db.schema.tables.base.user;
    let apptT = aurora.db.schema.tables.base.appointments;
    let groupT = aurora.db.schema.tables.base.group;
    let failCb = function(err) {callback(err, []);};
    if (inputs instanceof Array) {
        let object = {};

        for (let i = 0; i < inputs.length; i++) {
            let input = inputs[i];
            for (let k in input) {
                if (input[k] !== null) {
                    object[k] = input[k];
                }
            }
        }
        // don't allow specification of primary key
        delete object[userT.cols.id.getName()];
        object[userT.cols.active.getName()] = true;
        object[userT.cols.lastinvalidtime.getName()] = null;
        object[userT.cols.lockcount.getName()] = 0;
        let mentorid = object[userT.cols.mentorid.getName()];

        object[userT.cols.mentorid.getName()] = null;
        let query = new recoil.db.Query();
        let username = object[userT.cols.username.getName()];
        let password = object[userT.cols.password.getName()];
        if (aurora.permissions.has('mentor')(context)) {
            // mentors can create clients
            if (mentorid == undefined) {
                mentorid = context.userid;
            }
            else {
                object[userT.cols.mentorid.getName()] = mentorid;
            }
        } else if (aurora.permissions.has('user-management')(context) ||
                   aurora.permissions.has('site-management')(context)) {
            object[userT.cols.mentorid.getName()] = mentorid;
        }

        let makeUser = function(username) {
            object[userT.cols.username.getName()] = username.toLowerCase();
            aurora.db.Pool.hashPasswordPromise(password).then(function(pword) {
                object[userT.cols.password.getName()] = password === '' ? null : pword;
                return new Promise(function(resolve, reject) {
                    reader.readObjects(
                        {}, groupT, query.eq(groupT.cols.name, query.val('client')), null,
                        function(err, groups) {
                            if (err) {
                                reject(err);
                            }
                            else if (groups.length !== 1) {
                                reject('Unable to find group');
                            }
                            else {
                                resolve(groups[0].id);
                            }
                    });
                });
            }, failCb)
                .then(function(groupId) {
                    object[userT.cols.groups.getName()] = [{'groupid': groupId}];
                    object[userT.cols.resetcode.getName()] = null;
                    object[userT.cols.lockcount.getName()] = 0;
                    object[userT.cols.lastinvalidtime.getName()] = null;
                    object[userT.cols.resetcodetimeout.getName()] = null;
                    reader.transaction(function(reader, callback) {
                        reader.readObjects({}, userT, query.eq(userT.cols.username, query.val(username)), null, function(err, result) {
                            if (err) {
                                callback(err);
                            }
                            else if (result.length > 0) {
                                callback('Username already exists');
                            }
                            else {
                                reader.insert({}, userT, object, function(err, res) {
                                    if (err) {
                                        callback('Unable to create user', null);
                                    }
                                    else {
                                        // check permissions here no anybody can update an appointment
                                        let scheduleId = object['schedule'];
                                        if (scheduleId !== undefined && (
                                            aurora.permissions.has('site-management')(context) ||
                                                aurora.permissions.has('mentor')(context))
                                           ) {
                                            reader.updateOneLevel(context, apptT, {userid: res.insertId}, query.eq(apptT.cols.id, query.val(scheduleId)), function(err) {
                                                callback(null, res.insertId);
                                            });

                                        }
                                        else {
                                            callback(null, res.insertId);
                                        }
                                    }
                                });
                            }


                        });

                    }, function(err, res) {

                        if (err) {
                            aurora.log.createModule('BUDGET-ACTION').warn('failed to create user', username, err);
                        }
                        else {
                            aurora.log.createModule('BUDGET-ACTION').info('created user', username, res);
                        }
                        callback(err, res);
                    });
                }, failCb);

        };

        if (!username || username.trim().length === 0) {
            budget.actions.suggestUsername(coms, context, reader, inputs, function(err, outputs) {
                if (err) {
                    callback(err, []);
                }
                else {
                    makeUser(outputs);
                }
            });

            return;
        }
        makeUser(username);
    }
    else {
        callback('Invalid Parameters Passed', []);
    }
};
