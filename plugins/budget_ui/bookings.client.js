goog.provide('budget.widgets.Bookings');

goog.require('aurora.Client');
goog.require('aurora.columns.Link');
goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.SearchDialog');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.dom.classlist');
goog.require('goog.object');
goog.require('goog.positioning.Corner');
goog.require('goog.ui.MenuItem');
goog.require('goog.ui.PopupMenu');
goog.require('recoil.frp.logic');
goog.require('recoil.structs.table.Filter');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.columns.Expr');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.table.LabelColumn');
goog.require('recoil.ui.widgets.table.TableWidget');
goog.require('recoil.ui.widgets.table.TextAreaColumn');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Bookings = function(scope) {
    this.scope_ = scope;
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let amess = aurora.messages;
    let cd = goog.dom.createDom;
    let siteT = aurora.db.schema.tables.base.site;
    let holidaysT = aurora.db.schema.tables.base.site_holidays;
    let appointmentsT = aurora.db.schema.tables.base.appointments;
    let mentorT = aurora.db.schema.tables.base.mentor;
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    this.curDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(today));
    let clientT = aurora.db.schema.tables.base.client;

    var clientCK = new recoil.structs.table.ColumnKey('link');
    let clientCol = new aurora.columns.Link(clientCK, '');

    let mentorsB = scope.getDb().get(mentorT.key);
    this.appointmentsB_ = frp.switchB(frp.liftB(function(date) {
        let query = new recoil.db.Query();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime();
        let endTime = budget.widgets.BusinessHours.addDays(startTime, 7);

        return scope.getDb().get(appointmentsT.key, query.and(
            query.gt(query.field(appointmentsT.cols.stop), query.val(startTime)),
            query.lt(query.field(appointmentsT.cols.start), query.val(endTime))
        ));

    }, this.curDateB_));

    this.holidaysB_ = frp.switchB(frp.liftB(function(date) {
        let query = new recoil.db.Query();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime();
        let endTime = budget.widgets.BusinessHours.addDays(startTime, 7);

        return scope.getDb().get(holidaysT.key, query.and(
            query.gt(query.field(holidaysT.cols.stop), query.val(startTime)),
            query.lt(query.field(holidaysT.cols.start), query.val(endTime))
        ));

    }, this.curDateB_));

    this.availableB_ = frp.switchB(frp.liftB(function(date) {
        let query = new recoil.db.Query();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime();
        let endTime = budget.widgets.BusinessHours.addDays(startTime, 7);
        return scope.getDb().get(
            availT.key,
            query.and(
                query.or(
                    query.gt(query.field(availT.cols.stop), query.val(startTime)),
                    query.null(query.field(availT.cols.stop))),
                query.lt(query.field(availT.cols.start), query.val(endTime)))
        );

    }, this.curDateB_));

    let START_COL = new recoil.structs.table.ColumnKey('starttime');
    let SEARCH_COL = new recoil.structs.table.ColumnKey('search');
    this.siteB_ = scope.getDb().get(siteT.key);
    let dateDiv = cd('div', 'budget-date');
    let bookingsDiv = cd('div', 'budget-bookings');
    let dateCol = new recoil.ui.columns.Date2(appointmentsT.cols.start, '');
    this.containerDiv_ = cd('div', {class: 'budget-bookings'}, dateDiv, bookingsDiv);

    this.container_ = budget.widgets.BusinessHours.createWidgetDom('div', {}, this.containerDiv_);

    this.dateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.dateWidget_.attachStruct({value: this.curDateB_, min: 19700105, step: 1});
    this.dateWidget_.getComponent().render(dateDiv);

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);
    this.tableWidget_ = new recoil.ui.widgets.table.TableWidget(scope);
    let mentorConverterB = frp.liftB(function(mentors) {
        let map = budget.widgets.Bookings.generateUniqueNameMap(mentors);
        return {
            convert: function(v) {
                return map[v] || 'Unknown Mentor ' + v;
            },
            unconvert: function(v) {
                return {error: null, value: null};

            }
        };
    }, mentorsB);
    let idMap = {};
    let getId = function(mentor, time) {
        let key = mentor + ':' + time;
        let res = idMap[key];
        if (!res) {
            res = appointmentsT.info.pk.getDefault();
            idMap[key] = res;
        }
        return res;

    };
    let searchIcon = function() {
        let res = cd('i', 'fas fa-search');
        res.equals = function(other) {
            return res.className === other.className;
        };
        return res;
    };
    let scheduleActionB = scope.getDb().get(aurora.db.schema.actions.base.schedule.schedule.key);
    let unscheduleActionB = scope.getDb().get(aurora.db.schema.actions.base.schedule.unschedule.key);
    let spinnerColumn = new recoil.ui.widgets.table.LabelColumn(appointmentsT.cols.scheduled, 'Scheduled', {formatter: function() {
        return cd('i', {class: 'fas fa-spin fa-spinner'});
    }});


    let tableB = frp.liftBI(function(site, holidays, appointments, avail, startDate, mentorConverter) {
        // this reuses the some columns so we can get the meta data
        let table = appointments.createEmpty([], [START_COL, SEARCH_COL, clientCK]);
        // make the key an array of [time, mentor] we get the right order


        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(startDate).getTime();
        let endTime = budget.widgets.BusinessHours.addDays(startTime, 7);

        let apptMap = budget.widgets.Bookings.makeAppointmentMap_(avail, holidays, appointments, startTime, endTime);

        let columns = new recoil.ui.widgets.TableMetaData();
        columns.addColumn(new recoil.ui.columns.Time(START_COL, 'Time'));
        columns.add(appointmentsT.cols.mentorid, 'Mentor');
        columns.addColumn(clientCol);
        columns.add(appointmentsT.cols.name, 'Client Name');
        columns.add(appointmentsT.cols.address, 'Client Address');
        columns.add(appointmentsT.cols.email, 'Client Email');
        columns.add(appointmentsT.cols.phone, mess.PHONE, {displayLength: 7});
        columns.addColumn(new recoil.ui.widgets.table.ButtonColumn(SEARCH_COL, 'Search'));
        if (scheduleActionB.get().enabled.val() && unscheduleActionB.get().enabled.val()) {
            columns.add(appointmentsT.cols.scheduled, 'Scheduled');
        }
        else {
            columns.addColumn(spinnerColumn);
        }
        columns.add(appointmentsT.cols.showed, 'Came', {displayLength: 20});
        table.addColumnMeta(START_COL, {editable: false});
        table.addColumnMeta(appointmentsT.cols.mentorid, {editable: false, converter: mentorConverter});
        table.addColumnMeta(appointmentsT.cols.name, {displayLength: 20});
        table.addColumnMeta(appointmentsT.cols.address, {displayLength: 20});
        table.addColumnMeta(appointmentsT.cols.email, {displayLength: 20});
        table.addColumnMeta(appointmentsT.cols.scheduled, {type: 'boolean'});

        console.log('appts', appointments.toDebugObj());
        let pos = 0;
        let prevDay = null;
        apptMap.inOrderTraverse(function(entry) {
            let today = new Date(entry.key[0]);
            let now = new Date(entry.key[0]);
            today.setHours(0, 0, 0, 0);
            if (prevDay !== today.getTime()) {
                let row = new recoil.structs.table.MutableTableRow(pos++);
                row.set(appointmentsT.cols.showed, false);

                row.addCellMeta(START_COL, /** @type {!Object} */(dateCol.getMeta({
                    editable: false, cellDecorator: recoil.ui.widgets.TableMetaData.createSpanDecorator(10, {class: 'budget-seperator-row'})})));
                row.addRowMeta({cellDecorator: null});

                row.set(appointmentsT.cols.start, entry.key[0]);
                row.set(START_COL, recoil.ui.widgets.DateWidget2.convertDateToLocal(today));
                row.set(SEARCH_COL, null);
                row.set(appointmentsT.cols.stop, null);
                row.set(appointmentsT.cols.mentorid, entry.key[1]);
                row.set(appointmentsT.cols.name, '');
                row.set(appointmentsT.cols.address, '');
                row.set(appointmentsT.cols.email, '');
                row.set(appointmentsT.cols.phone, '');
                row.set(appointmentsT.cols.scheduled, false);
                row.set(appointmentsT.cols.userid, null);
                row.set(clientCK, null);
                table.addRow(row);



            }
            prevDay = today.getTime();

            if (entry.avail.length === 0) {
                let row = new recoil.structs.table.MutableTableRow(pos++);
                row.set(appointmentsT.cols.id, getId(entry.key[1], now));
                row.set(appointmentsT.cols.showed, false);
                row.set(START_COL, recoil.ui.widgets.TimeWidget.convertTimeToLocal(now));
                row.set(appointmentsT.cols.start, entry.key[0]);
                row.set(appointmentsT.cols.stop, entry.stop);
                row.set(appointmentsT.cols.mentorid, entry.key[1]);
                row.set(SEARCH_COL, null);
                row.set(appointmentsT.cols.name, '');
                row.set(appointmentsT.cols.address, '');
                row.set(appointmentsT.cols.email, '');
                row.set(appointmentsT.cols.phone, '');
                row.set(appointmentsT.cols.scheduled, false);
                row.set(appointmentsT.cols.userid, null);
                row.set(clientCK, null);
                row.addCellMeta(SEARCH_COL, {text: searchIcon()});
                table.addRow(row);
            }
            else {
                entry.avail.forEach(function(inRow) {
                    let row = inRow.unfreeze();
                    let userid = inRow.get(appointmentsT.cols.userid);
                    row.addCellMeta(SEARCH_COL, {text: searchIcon()});
                    row.set(SEARCH_COL, null);
                    row.set(START_COL, recoil.ui.widgets.TimeWidget.convertTimeToLocal(new Date(row.get(appointmentsT.cols.start))));
                    row.set(appointmentsT.cols.mentorid, row.get(appointmentsT.cols.mentorid).db);
                    row.set(clientCK, userid ? '/client?id=' + userid.db : null);
                    row.set(appointmentsT.cols.scheduled, row.get(appointmentsT.cols.scheduled) !== null);
                    row.addCellMeta(appointmentsT.cols.scheduled, {editable: true});
                    if (row.get(appointmentsT.cols.scheduled)) {
                        let cols = [appointmentsT.cols.name, appointmentsT.cols.phone, SEARCH_COL,
                                    appointmentsT.cols.address, appointmentsT.cols.email,
                                    clientT.cols.phone];

                        cols.forEach(function(col) {
                            row.addCellMeta(col, {enabled: new recoil.ui.BoolWithExplanation(false, budget.messages.UNSCHEDULE_TO_EDIT)});
                        });
                    }

                    row.setPos(pos++);
                    table.addRow(row);
                });
            }
        });
        return columns.applyMeta(table);

    }, function(tbl) {
        let cols = [clientT.cols.username, clientT.cols.firstName,
                    clientT.cols.lastName, clientT.cols.email,
                    clientT.cols.phone];
        let origAppointments = me.appointmentsB_.get();
        let seen = new goog.structs.AvlTree(recoil.util.compare);
        let res = origAppointments.createEmpty();
        let aKeys = appointmentsT.cols;
        tbl.forEach(function(row, pks) {
            if (row.get(SEARCH_COL)) {
                let searchRow = new recoil.structs.table.MutableTableRow(-1);
                searchRow.set(clientT.cols.username, '');
                let nameParts = (row.get(aKeys.name) || '').split(' ');
                searchRow.set(clientT.cols.firstName, (nameParts[0] || '').trim());
                searchRow.set(clientT.cols.lastName, nameParts.slice(1).map(function(v) {return v.trim();}).join(' ')); // leave hopefull we wil all an index on first concat last
                searchRow.set(clientT.cols.email, row.get(aKeys.email));
                searchRow.set(clientT.cols.address, row.get(aKeys.address));
                searchRow.set(clientT.cols.phone, row.get(aKeys.phone));
                cols.forEach(function(col) {
                    searchRow.addCellMeta(col, {editable: true});
                });

                searchRow.addCellMeta(clientT.cols.address, {cellWidgetFactory: null});
                let searchRowB = frp.createB(searchRow.freeze());
                let queryB = frp.liftB(function(searchRow) {
                    let parts = [];
                    let query = new recoil.db.Query();
                    cols.forEach(function(col) {
                        if (clientT.cols.firstName === col || col === clientT.cols.lastName) {
                            return;
                        }
                        let val = searchRow.get(col);
                        if (val && val.trim().length > 0) {
                            parts.push(query.eq(query.field(col), query.val(val.trim())));
                        }
                    });
                    let firstName = (searchRow.get(clientT.cols.firstName) || '').trim();
                    let lastName = (searchRow.get(clientT.cols.lastName) || '').trim();
                    if (lastName.length + firstName.length > 0) {
                        let curQuery = query.eq(query.val(firstName + ' ' + lastName), query.concat([clientT.cols.firstName, query.val(' '), clientT.cols.lastName]));
                        if (lastName.length == 0) {
                            curQuery = query.or(
                                curQuery, query.eq(query.val(firstName), clientT.cols.firstName));
                        }
                        if (firstName.length == 0) {
                            curQuery = query.or(
                                curQuery, query.eq(query.val(lastName), clientT.cols.lastName));
                        }



                        parts.push(curQuery);
                    }
                    if (parts.length == 0) {

                        return query.False();
                    }
                    return query.and.apply(query, parts);
                }, searchRowB);

                let headerFactory = function(scope, sourceB) {
                    return frp.liftBI(function(tbl, searchRow) {
                        let res = tbl.createEmpty();
                        res.addRow(searchRow);
                        return res.freeze();
                    }, function(tbl) {
                        let res = sourceB.get().createEmpty();

                        tbl.forEach(function(row) {
                            searchRowB.set(row);
                            res.addRow(row);
                        });
                        sourceB.set(res.freeze());
                    },sourceB, searchRowB);
                };

                let bodyFactory = function(scope, sourceB) {
                    return frp.liftB(function(tbl) {
                        let res = tbl.unfreeze();
                        let columns = new recoil.ui.widgets.TableMetaData();
                        columns.add(clientT.cols.username, 'User Name', {displayLength: 10});
                        columns.add(clientT.cols.firstName, 'First Name', {displayLength: 10});
                        columns.add(clientT.cols.lastName, 'Last Name', {displayLength: 10});
                        columns.add(clientT.cols.email, 'Email', {displayLength: 20});
                                     columns.add(clientT.cols.phone, 'Phone', {displayLength: 7});
                        columns.add(clientT.cols.address, 'Address', {displayLength: 20});

                        return columns.applyMeta(res);
                    }, sourceB);
                };
                let dialog = new aurora.widgets.SearchDialog(scope, clientT, 10, bodyFactory, headerFactory, frp.createCallback(function(selRow) {
                    let res = me.appointmentsB_.get().createEmpty();
                    let found = false;
                    let setIfNotBlank = function(row, col, val) {
                        if (val && val.trim().length > 0) {
                            row.set(col, val);
                        }
                    };
                    let addNewRow = function(newRow) {
                        setIfNotBlank(newRow, aKeys.name, (selRow.get(clientT.cols.firstName) + ' ' + selRow.get(clientT.cols.lastName)).trim());
                        setIfNotBlank(newRow, aKeys.email, selRow.get(clientT.cols.email));
                        setIfNotBlank(newRow, aKeys.phone, selRow.get(clientT.cols.phone));
                        setIfNotBlank(newRow, aKeys.address, selRow.get(clientT.cols.address));
                        newRow.set(aKeys.userid, selRow.get(clientT.cols.id));
                        res.addRow(newRow);
                    };
                    me.appointmentsB_.get().forEach(function(row, curPk) {
                        if (recoil.util.isEqual(curPk, pks)) {
                            found = true;
                            addNewRow(row.unfreeze());
                        }
                        else {
                            res.addRow(row);
                        }
                    });

                    if (!found) {
                        tbl.forEach(function(row, curPk) {
                            if (recoil.util.isEqual(curPk, pks)) {
                                let newRow = row.unfreeze();
                                newRow.set(aKeys.mentorid, new aurora.db.PrimaryKey(row.get(aKeys.mentorid)));
                                newRow.set(aKeys.scheduled, null);
                                addNewRow(newRow);
                            }
                        });
                    }
                    me.appointmentsB_.set(res.freeze());


                },me.appointmentsB_), 'Select', 'Find Client', undefined, queryB);
                dialog.show(true);
            }
            let relColumns = [aKeys.name, aKeys.email, aKeys.phone, aKeys.address];
            let pk = row.get(aKeys.id);
            let blank = relColumns.reduce(function(total, col) {
                if (!total) {
                    return false;
                }
                let val = row.get(col);
                return !val || val.trim().length == 0;
            }, true);

            seen.add(row.get(aKeys.id));
            if (blank) {
                // need to remove
            }
            else {
                let mrow = row.unfreeze();
                let orig = origAppointments.getRow(pks);
                if (orig && orig.get(aKeys.name) != row.get(aKeys.name)) {
                    mrow.set(aKeys.userid, null);
                }
                if (orig && (orig.get(aKeys.scheduled) !== null) != row.get(aKeys.scheduled)) {
                    if (row.get(aKeys.scheduled)) {
                        scheduleActionB.set({action: {
                            apptid: row.get(aKeys.id) ? row.get(aKeys.id).db : null,
                            name: row.get(aKeys.name),
                            userid: row.get(aKeys.userid) ? row.get(aKeys.userid).db : null,
                            email: row.get(aKeys.email),
                            time: row.get(aKeys.start),
                            mentorid: row.get(aKeys.mentorid),
                            length: row.get(aKeys.stop) - row.get(aKeys.start)
                        }});
                    }
                    else {
                        unscheduleActionB.set({action: {
                            appointmentid: row.get(aKeys.id).db
                        }});
                    }
                    console.log('unschedule/schedule an appointment via action');
                    mrow.set(aKeys.scheduled, orig.get(aKeys.scheduled));
                }
                mrow.set(aKeys.mentorid, new aurora.db.PrimaryKey(row.get(aKeys.mentorid)));
                // do not change scheduled it is not allowed the action will do it
                mrow.set(aKeys.scheduled, orig ? orig.get(aKeys.scheduled) : null);
                res.addRow(mrow);
            }

        });
        // todo add rows that where in original table but not in here just to be safe
        origAppointments.forEach(function(row) {
            let outRow = seen.findFirst(row.get(aKeys.id));
            if (!outRow) {
                res.addRow(row);
            }
        });
        me.appointmentsB_.set(res.freeze());
    }, this.siteB_, this.holidaysB_, this.appointmentsB_, this.availableB_, this.curDateB_, mentorConverterB, scheduleActionB, unscheduleActionB);
    this.tableWidget_.attachStruct(tableB);
    this.tableWidget_.getComponent().render(this.containerDiv_);

};

/**
 * @private
 * @param {!recoil.structs.table.Table} avail a table containing what time each mentor is available
 * @param {!recoil.structs.table.Table} holidays a table containing the periods holidays
 * @param {!recoil.structs.table.Table} appointments a table containing already scheduled appoinments
 * @param {number} startTime time in mill since epoch
 * @param {number} endTime time in mill since epoch
 * @return {!goog.structs.AvlTree}
 */
budget.widgets.Bookings.makeAppointmentMap_ = function(avail, holidays, appointments, startTime, endTime) {
    let holidaysT = aurora.db.schema.tables.base.site_holidays;
    let appointmentsT = aurora.db.schema.tables.base.appointments;
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let mentorDayUsage = {};
    let apptMap = new goog.structs.AvlTree(recoil.util.object.compareKey);

    let getAppointmentLength = function(lengths, start) {
        for (let i = 0; i < lengths.length; i++) {
            let item = lengths[i];
                if (start >= item.start && start < item.stop) {
                    return item.len;
                }
        }
        return null;
    };
    let inHoliday = function(start, stop) {
        let res = false;
        holidays.forEach(function(row) {
            let hStart = row.get(holidaysT.cols.start);
            let hStop = row.get(holidaysT.cols.stop);
            if (stop > hStart && start < hStop) {
                res = true;
            }

        });
        return res;
    };


    avail.forEach(function(row) {
        budget.widgets.BusinessHours.iterateOverPeriod(row, startTime, endTime, function(start, stop) {
            let len = row.get(availT.cols.appointmentLen) * 60000;
            let mentor = row.get(availT.cols.mentorid).db;
            let info = recoil.util.map.safeGet(mentorDayUsage, mentor, {free: [], lengths: []});
            if (!inHoliday(start, stop)) {
                info.free.push({start: start, stop: stop});
                info.lengths.push({start: start, stop: stop, len: len});
            }
        });
    });
    let mentorAppointments = budget.widgets.Bookings.makeMentorAppointmentMap_(appointments);

    for (let mentor in mentorDayUsage) {
        let usage = mentorDayUsage[mentor];
        budget.widgets.BusinessHours.mergeDayUsage(usage.free, true);
        usage.free.forEach(function(entry) {
            let start = entry.start;
            let len = getAppointmentLength(usage.lengths, start);
            while (len != null && start + len <= entry.stop) {
                apptMap.add({key: [start, mentor], stop: start + len, avail: mentorAppointments(mentor, start, start + len)});
                start += len;
                len = getAppointmentLength(usage.lengths, start);
            }

        });

    }
    return apptMap;
};

/**
 * @private
 * @param {!recoil.structs.table.Table} appointments a table containing already scheduled appoinments
 * @return {function(string, number,number):Array} return a function that can lookup what appointments are for a time period
 */
budget.widgets.Bookings.makeMentorAppointmentMap_ = function(appointments) {
    let map = {};
    let appointmentsT = aurora.db.schema.tables.base.appointments;

    appointments.forEach(function(row) {
        let mentor = row.get(appointmentsT.cols.mentorid).db;
        recoil.util.map.safeGet(map, mentor, []).push({start: row.get(appointmentsT.cols.start), stop: row.get(appointmentsT.cols.stop), row: row});

    });

    return function(mentor, start, stop) {
        let res = [];
        let list = map[mentor] || [];

        for (let i = 0; i < list.length; i++) {

            if (stop > list[i].start && start < list[i].stop) {
                res.push(list[i].row);
            }
        }
        return res;

    };


};
/**
 * @param {!recoil.structs.table.Table} mentors
 * @return {Object}
 */
budget.widgets.Bookings.generateUniqueNameMap = function(mentors) {
    let accepted = {};
    let seen = {}; // times an item is seen should never be more than 1
    let todo = {};
    let mentorT = aurora.db.schema.tables.base.mentor;


    function getName(row) {
        if ((row.get(mentorT.cols.firstName) || '').trim().length > 0) {
            return row.get(mentorT.cols.firstName);
        }
        else {
            return row.get(mentorT.cols.username);
        }
    }
    function getUser(row) {
        return row.get(mentorT.cols.username);
    }

    mentors.forEach(function(row) {
        todo[row.get(mentorT.cols.id).db] = row;
    });



    let genNames = function(nameGen) {
        let curSeen = goog.object.clone(seen);
        for (let id in todo) {
            let name = nameGen(todo[id]);
            curSeen[name] = (curSeen[name] || 0) + 1;
        }

        for (let id in todo) {
            let name = nameGen(todo[id]);
            if (curSeen[name] == 1) {
                accepted[id] = name;
            }
        }
        for (let id in accepted) {
            seen[accepted[id]] = 1;
            delete todo[id];
        }
    };
    genNames(getName);
    for (let id in todo) {
        let i = 1;
        let name = getName(id) + '(' + i + ')';
        while (seen[name]) {
            i++;
            name = getName(id) + '(' + i + ')';
        }
        seen[name] = 1;
        accepted[id] = name;
    }
    return accepted;
};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Bookings.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.Bookings.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

