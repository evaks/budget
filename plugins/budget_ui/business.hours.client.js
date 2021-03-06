goog.provide('budget.widgets.BusinessHours');

goog.require('aurora.Client');
goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableDialog');
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
goog.require('recoil.ui.widgets.ButtonWidget');
goog.require('recoil.ui.widgets.DateWidget2');
goog.require('recoil.ui.widgets.TimeWidget');
goog.require('recoil.ui.widgets.table.TableWidget');
/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {string=} opt_type
 * @implements {recoil.ui.Widget}
 */
budget.widgets.BusinessHours = function(scope, opt_type) {
    this.scope_ = scope;
    this.type_ = opt_type || 'admin';
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let siteT = aurora.db.schema.tables.base.site;
    let holidaysT = aurora.db.schema.tables.base.site_holidays;
    let appointmentsT = aurora.db.schema.tables.base.appointments;
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    this.contextB_ = aurora.permissions.getContext(scope);
    this.borderDimsB_ = frp.createB({x: 0, y: 0});
    let highlightedB = frp.createB(/** @type {{add: ?boolean, start:?{x:number,y:number},stop:?{x:number,y:number}}} */({start: null, stop: null}));
    this.highlightedB_ = highlightedB;

    let pad = function(v, len) {
        let str = ('0'.repeat(len) + v);
        return str.substring(str.length - len);
    };


    let format = new Intl.DateTimeFormat(undefined, {
        weekday: 'short'
    });
    let myId = BigInt(goog.net.cookies.get('userid'));
    let selectedMentorB = frp.createB(new aurora.db.PrimaryKey(myId));
    let mentorListB = budget.widgets.UserManagement.getMentorList(scope);
    this.mentorB_ = frp.liftBI(function(selected, context, list) {
        if (selected.db === myId && !aurora.permissions.has('mentor')(context)) {
            return list.length > 0 ? list[0] : null;
        }
        return selected;
    }, function(v) {
        selectedMentorB.set(v);
    }, selectedMentorB, this.contextB_, mentorListB);


    this.dateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.mentorWidget_ = new recoil.ui.widgets.SelectorWidget(scope);


    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;

    let weekdayIze = function() {
        let today = new Date();
        let monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * milliPerDay);
        return monday;
    };

    this.curDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(weekdayIze()));
    this.dateWidget_.attachStruct({value: this.curDateB_, min: 19700105, step: 7});
    this.mentorWidget_.attachStruct({value: this.mentorB_, list: mentorListB, renderer: budget.widgets.UserManagement.getMentorRenderer(scope)});

    this.siteB_ = scope.getDb().get(siteT.key);
    // do this because later on we will change so we can have multiple sites
    this.siteIdB_ = frp.liftB(function(site) {
        let res = null;
        site.forEach(function(row) {
            res = row.get(siteT.cols.id);
        });
        return res;
    }, this.siteB_);

    this.hoursTblB_ = budget.Client.instance.createSubTableB(this.siteB_, frp.createB(
        /** @type {Array} */ (null)), siteT.cols.regular);

    this.holidaysB_ = frp.switchB(frp.liftB(function(date) {
        let query = new recoil.db.Query();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime();

        let endTime = startTime + 7 * milliPerDay;

        return scope.getDb().get(holidaysT.key, query.and(
            query.gt(query.field(holidaysT.cols.stop), query.val(startTime)),
            query.lt(query.field(holidaysT.cols.start), query.val(endTime))
        ));

    }, this.curDateB_));

    this.availableB_ = frp.switchB(frp.liftB(function(date) {
        let query = new recoil.db.Query();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime();

        let endTime = startTime + 7 * milliPerDay;

        return scope.getDb().get(availT.key, query.and(
            query.eq(availT.cols.mentorid, query.val(me.mentorB_.get())),
            query.or(
                query.gt(query.field(availT.cols.stop), query.val(startTime)),
                query.null(query.field(availT.cols.stop))),

            query.lt(query.field(availT.cols.start), query.val(endTime))
        ));

    }, this.curDateB_, this.mentorB_));

    this.appointmentsB_ = frp.switchB(frp.liftB(function(date) {
        let query = new recoil.db.Query();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime();

        let endTime = startTime + 7 * milliPerDay;

        return scope.getDb().get(appointmentsT.key, query.and(
            query.gt(query.field(appointmentsT.cols.stop), query.val(startTime)),
            query.lt(query.field(appointmentsT.cols.start), query.val(endTime))
        ));

    }, this.curDateB_));



    this.yAxis_ = cd('div', 'budget-calendar-hour-labels');
    this.highlightDiv_ = cd('div', 'budget-calendar-highlight');
    this.calendarDiv_ = cd('div', {class: 'budget-calendar'}, this.yAxis_, this.highlightDiv_);

    goog.dom.setFocusableTabIndex(this.calendarDiv_, true);
    this.yAxis_.appendChild(cd('div', {class: 'budget-calendar-hour'}));
    for (let h = 0; h < 24; h++) {
        let hour = cd('div', {class: 'budget-calendar-hour'}, pad(h, 2) + ':00');
        this.yAxis_.appendChild(hour);
    }
    this.setupMenu_();
    this.days_ = [];
    this.dateDivs_ = [];
    let dt = new Date(0, 0, 1, 0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
        let dayStart = new Date(dt.getTime() + 3600000 * 24 * (i + (dt.getDay() + 6) % 7));

        let dateDiv = cd('div', {class: 'budget-date-container'}, cd('div', 'budget-calendar-day-name', format.format(dayStart)));
        this.dateDivs_.push(cd('div', {class: 'budget-calendar-date'}));
        dateDiv.appendChild(this.dateDivs_[i]);
        let day = cd('div', {class: 'budget-calendar-day'}, dateDiv);

        this.calendarDiv_.appendChild(day);


/*        let day = cd('div', {class: 'budget-calendar-day'}, cd('div', 'budget-calendar-day-name', format.format(dayStart)));
        this.calendarDiv_.appendChild(day);
*/
        let hours = [];
        for (let h = 0; h < 24; h++) {
            let hour = cd('div', {class: 'budget-calendar-hour' + (h == 23 ? ' budget-calendar-bottom' : '')});
            day.appendChild(hour);
            hours.push(hour);

        }
        this.days_.push({div: day, hours: hours});
    }

    let holidaysLegend = cd('div', {class: 'legend-item'}, cd('div', {class: 'legend-key holidays'}), cd('div', {class: 'legend-name'}, mess.HOLIDAY.toString()));
    let hoursLegend = cd('div', {class: 'legend-item'}, cd('div', {class: 'legend-key hours'}), cd('div', {class: 'legend-name'}, mess.OFFICE_HOURS.toString()));
    let availableLegend = cd('div', {class: 'legend-item'}, cd('div', {class: 'legend-key mentor-avail'}), cd('div', {class: 'legend-name'}, mess.AT_OFFICE.toString()));
    
    this.legendDiv_ = cd('div', {class: 'budget-legend'}, holidaysLegend, hoursLegend);

    if (this.type_ == 'mentor') {
        this.legendDiv_.appendChild(availableLegend);
    }
    let dateDiv = cd('div', 'budget-date');
    let mentorDiv = cd('div', 'budget-cal-mentor goog-inline-block');
    this.mentorDiv_ = cd('div', {}, cd('div', {class: 'budget-calendar-mentor-label'}, mess.MENTOR.toString()), mentorDiv);
    this.dateWidget_.getComponent().render(dateDiv);
    this.mentorWidget_.getComponent().render(mentorDiv);
    this.calendarHeader_ = cd('div', {class: 'budget-calendar-header'}, dateDiv, this.mentorDiv_, this.legendDiv_);
//    this.dateWidget_.getComponent().render(this.calendarHeader_);

    this.loadingContainer_ = cd('div', {class: 'budget-loading'}, cd('div'));
    this.errorContainer_ = cd('div', {class: 'budget-error'}, 'Error');

    this.container_ = budget.widgets.BusinessHours.createWidgetDom('div', {}, this.calendarHeader_, this.calendarDiv_, this.loadingContainer_, this.errorContainer_);

    goog.dom.classlist.enable(this.container_, 'budget-cal-avail', this.type_ === 'mentor');

    if (this.type_ === 'admin') {
        this.setupDrag_();
    }

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);
    let contentSizeB = frp.createB(/** @type {?{width:number, height:number}} */ (null));

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_, function() {
        if (me.bodyMoveListener_) {
            goog.events.unlistenByKey(me.bodyMoveListener_);
        }
    });

    this.helper_.attach(this.siteB_, this.siteIdB_, highlightedB, this.curDateB_, contentSizeB, this.holidaysB_, this.borderDimsB_, this.hoursTblB_, this.appointmentsB_, this.availableB_, this.contextB_);
    let resizeObserver = new ResizeObserver(frp.accessTransFunc(function(e) {
        contentSizeB.set({width: Math.round(e[0].contentRect.width), height: Math.round(e[0].contentRect.height)});
        let style = getComputedStyle(me.highlightDiv_);
        me.borderDimsB_.set(/** @type {?} */ ({
            x: parseInt(style.getPropertyValue('border-left-width'), 10) +
                parseInt(style.getPropertyValue('border-right-width'), 10),
            y: parseInt(style.getPropertyValue('border-top-width'), 10) +
                parseInt(style.getPropertyValue('border-bottom-width'), 10)
        }));


    }, contentSizeB, me.borderDimsB_));
    resizeObserver.observe(this.calendarDiv_);

};
/**
 * @typedef {{dayIndex:number, hourIndex:number, clickPosMilli:number, clickPosTime:number}}
 */
budget.widgets.BusinessHours.MenuInfo;

/**
 * @private
 */
budget.widgets.BusinessHours.prototype.setupDrag_ = function() {
    let me = this;
    let HOUR_RES = budget.widgets.BusinessHours.HOUR_RES;
    let frp = this.scope_.getFrp();
    let highlightedB = this.highlightedB_;
    let isLeftPressed = function(e) {
        return e.getBrowserEvent().buttons === undefined
            ? e.getBrowserEvent().which === 1
            : e.getBrowserEvent().buttons === 1;
    };

    let clearSelection = function() {
        if (window.getSelection) {
            if (window.getSelection().empty) {  // Chrome
                window.getSelection().empty();
            } else if (window.getSelection().removeAllRanges) {  // Firefox
                window.getSelection().removeAllRanges();
            }
        } else if (document.selection) {  // IE?
            document.selection.empty();
        }
    };


    goog.events.listen(document.body, goog.events.EventType.MOUSEUP, frp.accessTransFunc(function(e) {
        let highlighted = highlightedB.get();
        if (highlighted.start === null) {
            return;
        }
        let site = me.siteB_.get();
        let siteC = site.createEmpty();

        let topLeft = me.days_[0].hours[0].getBoundingClientRect();
        let bottomRight = me.days_[6].hours[23].getBoundingClientRect();

        let width = bottomRight.left + bottomRight.width - topLeft.left;
        let height = bottomRight.top + bottomRight.height - topLeft.top;
        let dayStartIndex = Math.floor(Math.min(highlighted.start.x, highlighted.stop.x) * 7 / width);
        let dayEndIndex = Math.min(7, Math.ceil(Math.max(highlighted.start.x, highlighted.stop.x) * 7 / width));
        let hourStartIndex = Math.max(0, Math.round(Math.floor(Math.min(highlighted.start.y, highlighted.stop.y) * 24 / height * HOUR_RES) / HOUR_RES * 3600000));
        let hourEndIndex = Math.round(Math.ceil(Math.max(highlighted.start.y, highlighted.stop.y) * 24 / height * HOUR_RES) / HOUR_RES * 3600000);


        highlightedB.set({start: null, stop: null, add: true});
        let sq = function(x) {return x * x;};
        let dist = Math.sqrt(sq(highlighted.start.x - highlighted.stop.x) + sq(highlighted.start.y - highlighted.stop.y));
        if (dist < 5) {
            return;
        }

        let dayUsage = me.createDayUsage_(site);

        let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
        let milliPerWeek = milliPerDay * 7;

        for (let i = dayStartIndex; i < dayEndIndex; i++) {

            let start = (i * milliPerDay) % milliPerWeek;
            let startTime = start + hourStartIndex;
            let stopTime = start + hourEndIndex;

            if (highlighted.add) {

/*                if(stopTime > milliPerDay * (i + 1)) {
                    stopTime = milliPerDay * (i + 1);
                }
  */
                dayUsage.push({start: startTime, stop: Math.min(stopTime, milliPerDay * (i + 1))});
            } else {
                let newUsage = [];
                for (let j = 0; j < dayUsage.length; j++) {
                    let usage = dayUsage[j];
                    if (startTime >= usage.stop || stopTime <= usage.start) {
                        newUsage.push(usage);
                    } else if (startTime <= usage.start && stopTime >= usage.stop) {
                        // do nothing to remove
                    } else if (usage.stop > stopTime && usage.start < startTime) {
                        newUsage.push({start: usage.start, stop: startTime});
                        newUsage.push({start: stopTime, stop: usage.stop});
                    } else if (stopTime < usage.stop) {
                        newUsage.push({start: stopTime, stop: usage.stop});
                    } else {
                        newUsage.push({start: usage.start, stop: startTime});
                    }
                }
                dayUsage = newUsage;
            }

        }


        me.siteB_.set(me.updateDayUsage_(site, dayUsage));

    }, highlightedB, this.siteB_));

    goog.events.listen(this.calendarDiv_, goog.events.EventType.MOUSEDOWN, frp.accessTransFunc(function(e) {
        clearSelection();
        if (!isLeftPressed(e)) {
            return;
        }
        let pos = me.calcPos_(e);
        highlightedB.set({start: pos, stop: pos, add: !e.ctrlKey });

    }, highlightedB));


    goog.events.listen(
        this.calendarDiv_,
        [goog.events.EventType.KEYDOWN,
         goog.events.EventType.KEYUP],
        frp.accessTransFunc(function(e) {

            let pos = /** @type {{add: ?boolean, start:?{x:number,y:number},stop:?{x:number,y:number}}} */ (goog.object.clone(highlightedB.get()));


            if (pos && pos.start !== null) {
                pos.add = !e.ctrlKey;
                highlightedB.set(pos);
            }
        }, highlightedB));

    let handleMove = frp.accessTransFunc(function(e) {
        if (!isLeftPressed(e)) {
            highlightedB.set({start: null, stop: null, add: true});
        }
        let oldPos = /** @type {{add: ?boolean, start:?{x:number,y:number},stop:?{x:number,y:number}}} */ (goog.object.clone(highlightedB.get()));
        if (oldPos.start === null) {
            return;
        }

        let pos = me.calcPos_(e);
        oldPos.stop = pos;
        oldPos.add = !e.ctrlKey;
        highlightedB.set(oldPos);
    }, highlightedB);

    this.bodyMoveListener_ = goog.events.listen(document.body, goog.events.EventType.MOUSEMOVE, handleMove);
    goog.events.listen(this.calendarDiv_, goog.events.EventType.MOUSEMOVE, handleMove);

};

/**
 * @param {?} e the event
 * @return {{x:number,y:number}}
 */
budget.widgets.BusinessHours.prototype.calcPos_ = function(e) {

    let yTopBounds = this.days_[0].hours[0].getBoundingClientRect();
    let yBotBounds = this.days_[0].hours[23].getBoundingClientRect();
    let minY = yTopBounds.top;
    let maxY = yBotBounds.height + yBotBounds.top;
    let xRightBounds = this.days_[6].div.getBoundingClientRect();
    let minX = this.days_[0].div.getBoundingClientRect().left;
    let maxX = xRightBounds.left + xRightBounds.width;
    return {
        x: Math.max(0, Math.min(e.clientX, maxX) - minX),
        y: Math.min(maxY, Math.max(0, Math.min(maxY, e.clientY) - minY))};
};

/**
 * @final
 * how many intervals per hour dragging will create, eg 2 means the resolution is 30 minutes
 */
budget.widgets.BusinessHours.HOUR_RES = 2;


/**
 * @final
 * number of milliseconds per day
 */
budget.widgets.BusinessHours.MILLI_PER_DAY = 3600000 * 24;


/**
 * returns a function that will remove a holiday
 * @private
 * @param {!budget.widgets.BusinessHours.MenuInfo} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doRemoveHolidayFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let HOUR_RES = budget.widgets.BusinessHours.HOUR_RES;
    let scope = me.scope_;
    return frp.accessTransFunc(function(e) {
        let holidays = me.holidaysB_.get();
        let selDate = me.getSelectionDate_(menuInfo, me.curDateB_.get());
        let holidayUsage = me.createHolidayUsage_(holidays);

        let selectedStopTime = selDate + budget.widgets.BusinessHours.MILLI_PER_DAY;

        let res = me.removeDateRange_(holidayUsage, selDate, selectedStopTime);
        me.holidaysB_.set(me.updateHolidayUsage_(me.siteB_.get(), holidays, res));
    }, this.siteB_, this.curDateB_, this.holidaysB_);

};

/**
 * returns a function that will make a holiday
 * @private
 * @param {!budget.widgets.BusinessHours.MenuInfo} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doMakeHolidayFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();

    return frp.accessTransFunc(function(e) {
        let site = me.siteB_.get();
        let hols = me.holidaysB_.get();
        let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
        let holidays = me.createHolidayUsage_(hols);
        let selectDate = me.getSelectionDate_(menuInfo, me.curDateB_.get());

        holidays.push({start: selectDate, stop: selectDate + milliPerDay});
        me.mergeDayUsage_(holidays, true);
        me.holidaysB_.set(me.updateHolidayUsage_(site, hols, holidays));

    }, this.siteB_, this.curDateB_, this.holidaysB_);
};




/**
 * @private
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tblB
 * @param {number} start
 * @param {number} stop
 * @param {?number} selectedIndex
 * @param {string} title
 * @return
 */
budget.widgets.BusinessHours.prototype.makeDateDialog_ = function(tblB, start, stop, selectedIndex, title) {
    let me = this;
    let scope = me.scope_;
    let frp = me.scope_.getFrp();
    let modTableB = tblB;
    let hols = me.holidaysB_.get();
    let site = me.siteB_.get();
    let holidayUsage = me.createHolidayUsage_(hols);
    let holidaysT = aurora.db.schema.tables.base.site_holidays;

    let td = new aurora.widgets.TableDialog(scope, modTableB, frp.createCallback(function(e) {
        let res = me.holidaysB_.get().unfreeze();
        let modTable = modTableB.get();

        modTable.forEach(function(row) {
            let origStartTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(start).getTime();
            let origStopTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(stop).getTime();
            let modStartTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(row.get(holidaysT.cols.start)).getTime();
            let modStopTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(row.get(holidaysT.cols.stop)).getTime();
            //            let millisPerDay = + 3600000 * 24;
            let millisPerDay = 3600000 * 24;

            if (selectedIndex !== null && (modStopTime < origStopTime || modStartTime > origStartTime)) {

                holidayUsage.splice(selectedIndex, 1);
            }
            holidayUsage.push({start: modStartTime, stop: modStopTime + millisPerDay});
        });

        me.mergeDayUsage_(holidayUsage, true);
        me.holidaysB_.set(me.updateHolidayUsage_(site, hols, holidayUsage));

    }, modTableB, me.siteB_, me.holidaysB_), title, function() {return null;}, title);
    return td;
};


/**
 * @private
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tblB
 * @param {number} start
 * @param {number} stop
 * @param {string} title
 * @param {!recoil.frp.Behaviour} callbackB
 * @return
 */
budget.widgets.BusinessHours.prototype.makeAvailableDialog_ = function(tblB, start, stop, title, callbackB) {
    let me = this;
    let scope = me.scope_;
    let frp = me.scope_.getFrp();
    let modTableB = tblB;
    let holidaysT = aurora.db.schema.tables.base.site_holidays;

    let td = new aurora.widgets.TableDialog(scope, modTableB, callbackB, title, function() {return null;}, title);
    return td;
};

/**
 * returns a function that will display a dialog to add holidays
 * @private
 * @param {!budget.widgets.BusinessHours.MenuInfo} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doAddHolidaysDialogFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let scope = me.scope_;

    return frp.accessTransFunc(function(e) {

        let siteT = aurora.db.schema.tables.base.site;
        let holidaysT = aurora.db.schema.tables.base.site_holidays;

        let hols = me.holidaysB_.get();
        let tbl = hols.createEmpty([]);
        let tblKeys = holidaysT.cols;
        let selectDate = me.getSelectionDate_(menuInfo, me.curDateB_.get());
        let holidayUsage = me.createHolidayUsage_(hols);
        let selectedIndex = me.getSelectedIndexInArray(holidayUsage, selectDate);

        let columns = new recoil.ui.widgets.TableMetaData();
        columns.addColumn(new recoil.ui.columns.Date2(holidaysT.cols.start, budget.messages.START_DATE.toString()));
        columns.addColumn(new recoil.ui.columns.Date2(holidaysT.cols.stop, budget.messages.STOP_DATE.toString()));

        let row = new recoil.structs.table.MutableTableRow();
        let startTime = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(selectDate));
        let stopTime = startTime;

        row.set(tblKeys.siteid, 0);
        row.set(tblKeys.start, startTime);
        row.set(tblKeys.stop, stopTime);

        tbl.addRow(row);
        let modTableB = frp.createB(columns.applyMeta(tbl));
        let td = me.makeDateDialog_(modTableB, startTime, stopTime, selectedIndex, budget.messages.ADD_HOLIDAYS_DIALOG.toString());

        td.show(true);

    }, this.siteB_, this.curDateB_, this.holidaysB_, this.siteIdB_);

};


/**
 * @private
 * @param {!budget.widgets.BusinessHours.MenuInfo} menuInfo
 * @param {boolean} once
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doRemoveAvailableFunc_ = function(menuInfo, once) {
    let me = this;
    let frp = me.scope_.getFrp();
    let scope = me.scope_;
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let RepeatType = aurora.db.schema.getEnum(availT.cols.repeat);
    let nextPeriod = budget.widgets.BusinessHours.nextPeriod_;
    return frp.accessTransFunc(function(e) {
        let avail = me.availableB_.get();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(me.curDateB_.get()).getTime();
        let endTime = budget.widgets.BusinessHours.addDays_(startTime, 7);
        let when = menuInfo.clickPosTime;
        let res = avail.createEmpty();
        avail.forEach(function(row) {

            let found = null;
            budget.widgets.BusinessHours.iterateOverPeriod_(row, startTime, endTime, function(start, stop) {
                if (start <= when && when < stop) {
                    found = {start: start, stop: stop};
                }
            });
            if (found) {
                let prevStart = nextPeriod(row, found.start, -1);
                if (prevStart != null) {
                    let mrow = row.unfreeze();
                    mrow.set(availT.cols.stop, prevStart + row.get(availT.cols.len));
                    res.addRow(mrow);
                }
                if (once) {
                    // there maybe things after us so add it
                    let nextStart = nextPeriod(row, found.start, 1);
                    if (nextStart != null) {
                        let mrow = row.unfreeze();
                        mrow.set(availT.cols.start, nextStart);
                        if (prevStart != null) {
                            // we need a new primary key be can't use this row twice
                            mrow.set(availT.cols.id, availT.cols.id.getDefault());
                        }
                        res.addRow(mrow);
                    }
                }

            }
            else {
                res.addRow(row);
            }
        });
        me.availableB_.set(res.freeze());
    }, this.curDateB_, this.availableB_, this.mentorB_, this.contextB_, this.siteIdB_);

};

/**
 * @private
 * @param {{dayIndex:number, hourIndex:number, clickPosMilli: number, clickPosTime:number}} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doAddAvailableFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let scope = me.scope_;
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let RepeatType = aurora.db.schema.getEnum(availT.cols.repeat);
    const MILLI_PER_HOUR = 3600000;
    const MILLI_PER_DAY = budget.widgets.BusinessHours.MILLI_PER_DAY;
    return frp.accessTransFunc(function(e) {
        let avail = me.availableB_.get();


        let tbl = avail.createEmpty([]);
        let tblKeys = availT.cols;
        let selectDate = me.getSelectionDate_(menuInfo, me.curDateB_.get());


        let row = new recoil.structs.table.MutableTableRow();

        let dayOffset = menuInfo.dayIndex;
        let startTime = Math.floor(menuInfo.clickPosMilli / MILLI_PER_HOUR) % 24 * MILLI_PER_HOUR;
        let stopTime = startTime + MILLI_PER_HOUR;

        row.set(tblKeys.siteid, me.siteIdB_.get());
        // to do this is just for security testing
        row.set(tblKeys.mentorid, me.mentorB_.get());
        row.set(tblKeys.repeat, RepeatType.weekly);
        row.set(tblKeys.start, startTime);
        row.set(tblKeys.len, stopTime);
        row.set(tblKeys.stop, null);

        tbl.addRow(row);
        let modTableB = frp.createB(tbl.freeze());
        let validTableB = frp.liftBI(function(tbl) {
            let res = tbl.createEmpty();
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.addColumn(new recoil.ui.columns.Time(availT.cols.start, budget.messages.START_DATE.toString()));
            columns.addColumn(new recoil.ui.columns.Time(availT.cols.len, budget.messages.STOP_DATE.toString()));
            columns.add(availT.cols.repeat, budget.messages.REPEAT.toString());

            let doesRepeat = false;
            tbl.forEachModify(function(row) {
                let start = row.get(tblKeys.start);
                let stop = row.get(tblKeys.len);
                let stopErrors = [];
                let endErrors = [];
                if (stop < start + MILLI_PER_HOUR) {
                    stopErrors.push(budget.messages.YOU_MUST_BE_AVAILABLE_FOR_AT_LEAST_AN_HOUR);
                }
                if (row.get(tblKeys.stop) != null && row.get(tblKeys.stop) < selectDate) {
                    endErrors.push(budget.messages.FINISH_DATE_CANNOT_BE_BEFORE_START_DATE);
                }
                row.addCellMeta(tblKeys.len, {errors: stopErrors});
                row.addCellMeta(tblKeys.stop, {errors: endErrors});

                // the min
                res.addColumnMeta(tblKeys.stop, {allowNone: true, min: selectDate});
                doesRepeat = row.get(tblKeys.repeat) != null;
                res.addRow(row);
            });
            if (doesRepeat) {
                columns.addColumn(new recoil.ui.columns.Date2(availT.cols.stop, budget.messages.FINISH.toString()));
            }
            return columns.applyMeta(res);
        }, function(tbl) {
            let res = modTableB.get().createEmpty();
            tbl.forEach(function(row) {
                res.addRow(row);
            });
            modTableB.set(res.freeze());
        }, modTableB);

        let dayAdd = function(row, col) {
            let date = new Date(selectDate);
            row.set(col, row.get(col) + selectDate);

        };

        let td = me.makeAvailableDialog_(validTableB, startTime, stopTime, budget.messages.ADD_AVAILABLE.toString(), frp.createCallback(function(e) {
            let res = me.availableB_.get().unfreeze();
            modTableB.get().forEachModify(function(row) {
                let len = row.get(tblKeys.len) - row.get(tblKeys.start);
                let stop = row.get(tblKeys.stop);

                dayAdd(row, tblKeys.start);
                row.set(tblKeys.len, len);
                row.set(tblKeys.stop, stop == null ? null : stop + MILLI_PER_DAY);
                res.addRow(row);
            });

            me.availableB_.set(res.freeze());

        }, modTableB, me.siteB_, me.holidaysB_, me.availableB_));

        td.show(true);

    }, this.siteB_, this.curDateB_, this.availableB_, this.mentorB_, this.contextB_, this.siteIdB_);

};

/**
 * @private
 * @param {!Array<{start: number, stop: number}>} arr
 * @param {number} selectTime
 * @return {?number}
 */
budget.widgets.BusinessHours.prototype.getSelectedIndexInArray = function(arr, selectTime) {
    let foundIndex = null;

    for (let i = 0; i < arr.length; i++) {
            let val = arr[i];

            if (selectTime === val.start) {
                foundIndex = i;
            } else if (selectTime > val.start && selectTime < val.stop) {
                foundIndex = i;
            }
        }
    return foundIndex;
};

/**
 * returns a function that will make a modify holiday dialog
 * @private
 * @param {{dayIndex:number, hourIndex:number, clickPosMilli:number, clickPosTime:number}} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doModifyHolidayDialogFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let scope = me.scope_;

    return frp.accessTransFunc(function(e) {
        let siteT = aurora.db.schema.tables.base.site;
        let holidaysT = aurora.db.schema.tables.base.site_holidays;

        let hols = me.holidaysB_.get();
        let site = me.siteB_.get();
        let tbl = hols.createEmpty([]);
        let tblKeys = holidaysT.cols;
        let selectDate = me.getSelectionDate_(menuInfo, me.curDateB_.get());
        let holidayUsage = me.createHolidayUsage_(hols);
        let selectedIndex = me.getSelectedIndexInArray(holidayUsage, selectDate);
        if (selectedIndex == null) {
            return;
        }

        let columns = new recoil.ui.widgets.TableMetaData();
        let startCol = new recoil.ui.columns.Date2(holidaysT.cols.start, budget.messages.START_DATE.toString());
        let stopCol = new recoil.ui.columns.Date2(holidaysT.cols.stop, budget.messages.STOP_DATE.toString());

        columns.addColumn(startCol);
        columns.addColumn(stopCol);

        let row = new recoil.structs.table.MutableTableRow();
        let startTime = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(holidayUsage[selectedIndex].start));
        let stopTime = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(holidayUsage[selectedIndex].stop - budget.widgets.BusinessHours.MILLI_PER_DAY));

        row.set(tblKeys.siteid, 0);
        row.set(tblKeys.start, startTime);
        row.set(tblKeys.stop, stopTime);

        tbl.addRow(row);
        let modTableB = frp.createB(columns.applyMeta(tbl));

        let td = me.makeDateDialog_(modTableB, startTime, stopTime, selectedIndex, budget.messages.MODIFY_HOLIDAY.toString());
        td.show(true);

    }, this.siteB_, this.curDateB_, this.holidaysB_);
};

/**
 * returns a function that will make a dialog to add hours
 * @private
 * @param {{dayIndex:number, hourIndex:number, clickPosMilli:number, clickPosTime:number}} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doAddHoursDialogFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let siteT = aurora.db.schema.tables.base.site;

    return frp.accessTransFunc(function(e) {

        let site = me.siteB_.get();
        let hoursT = siteT.regular;
        let tbl = me.hoursTblB_.get().createEmpty();
        let tblKeys = hoursT.cols;
        let selDayIndex = menuInfo.dayIndex;
        let selDayStartMillis = budget.widgets.BusinessHours.MILLI_PER_DAY * selDayIndex;
        let dayUsage = me.createDayUsage_(site);

        let clickPos = menuInfo.clickPosMilli;
        let columns = new recoil.ui.widgets.TableMetaData();
        let startCol = new recoil.ui.columns.Time(hoursT.cols.start, budget.messages.START_TIME.toString());
        let stopCol = new recoil.ui.columns.Time(hoursT.cols.stop, budget.messages.STOP_TIME.toString());

        columns.addColumn(startCol);
        columns.addColumn(stopCol);

        // this.timeWidget.attachStruct({value: });
        // columns.add(holidaysT.cols.stop, budget.messages.STOP_DATE.toString());
        // tbl.addColumnMeta(holidaysT.cols.stop, {type: 'time'});

        let businessHoursStart = 9 * 3600000;
        let start = businessHoursStart;
        let stop = 17 * 3600000;

        let row = new recoil.structs.table.MutableTableRow();

        row.set(tblKeys.id, 0);
        row.set(tblKeys.start, start);
        row.set(tblKeys.stop, stop);

        tbl.addRow(row);

        let memTableB = frp.createB(columns.applyMeta(tbl));
        let modTableB = frp.liftBI(function(tbl) {
            let res = tbl.createEmpty();
            tbl.forEachModify(function(row) {
                row.addCellMeta(tblKeys.stop, {min: row.get(tblKeys.start) + 60000});
                if (row.get(tblKeys.stop) <= row.get(tblKeys.start)) {
                    row.addCellMeta(tblKeys.stop, {errors: [budget.messages.END_TIME_AFTER_START.toString()]});
                }
                else {
                    row.addCellMeta(tblKeys.stop, {errors: []});
                }

                res.addRow(row);
            });
            return res.freeze();
        }, function(tbl) {
            memTableB.set(tbl);
        }, memTableB);


        let td = new aurora.widgets.TableDialog(me.scope_, modTableB, frp.createCallback(function(e) {
            let res = me.holidaysB_.get().unfreeze();
            let hoursTable = modTableB.get();

            hoursTable.forEach(function(row) {
                let newStartTime = budget.widgets.BusinessHours.MILLI_PER_DAY * selDayIndex + row.get(hoursT.cols.start);
                let newStopTime = budget.widgets.BusinessHours.MILLI_PER_DAY * selDayIndex + row.get(hoursT.cols.stop);

              dayUsage.push({start: newStartTime, stop: newStopTime});
            });

            me.mergeDayUsage_(dayUsage, true);
            me.siteB_.set(me.updateDayUsage_(site, dayUsage));

        }, modTableB, me.siteB_, me.holidaysB_), budget.messages.ADD.toString(), function(row) {
            return null;
        }, budget.messages.ADD_HOURS_DIALOG.toString(), undefined, {blockErrors: true});
        td.show(true);


    }, this.siteB_, this.curDateB_, this.holidaysB_, this.hoursTblB_);
};

/**
 * returns a function that will remove hours
 * @private
 * @param {{dayIndex:number, hourIndex:number, clickPosMilli: number, clickPosTime:number}} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doRemoveHoursFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    return frp.accessTransFunc(function(e) {

        let site = me.siteB_.get();
        let dayUsage = me.createDayUsage_(site);
        let clickPosMilli = menuInfo.clickPosMilli;

        let selectedIndex = null;

        for (let i = 0; i < dayUsage.length; i++) {
            let day = dayUsage[i];

            if (clickPosMilli >= day.start && clickPosMilli <= day.stop) {
                selectedIndex = i;
            }
        }

        let dayStartTime = budget.widgets.BusinessHours.MILLI_PER_DAY * menuInfo.dayIndex;
        let dayEndTime = budget.widgets.BusinessHours.MILLI_PER_DAY * (menuInfo.dayIndex + 1);

        if (selectedIndex !== null) {
            let res = me.removeDateRange_(dayUsage,
                                          Math.max(dayStartTime, dayUsage[selectedIndex].start),
                                          Math.min(dayEndTime, dayUsage[selectedIndex].stop));
            me.siteB_.set(me.updateDayUsage_(site, res));
        }

    }, this.siteB_, this.curDateB_, this.holidaysB_);
};

/**
 * @private
 * @param {!Array<{start: number, stop: number}>} timeRange
 * @param {number} startTime
 * @param {number} stopTime
 * @return {!Array<{start: number, stop: number}>}
 */
budget.widgets.BusinessHours.prototype.removeDateRange_ = function(timeRange, startTime, stopTime) {
    let res = [];

    for (let i = 0; i < timeRange.length; i++) {
        let time = timeRange[i];

        if (time.stop < startTime || time.start > stopTime) {
            res.push(time);
        }
        else {
            if (time.start < startTime) {
                res.push({start: time.start, stop: startTime});
            }

            if (stopTime < time.stop) {
                res.push({start: stopTime, stop: time.stop});
            }
        }

    }
    return res;
};

/**
 * returns a function that will bring up a modify hours dialog
 * @private
 * @param {{dayIndex:number, hourIndex:number, clickPosMilli: number, clickPosTime:number}} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doModifyHoursDialogFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let siteT = aurora.db.schema.tables.base.site;

    return frp.accessTransFunc(function(e) {
        //let scope = me.scope_;
        let hoursT = siteT.regular;
        let site = me.siteB_.get();
        let tbl = me.hoursTblB_.get().createEmpty();
        let tblKeys = hoursT.cols;
        let selDayIndex = menuInfo.dayIndex;
        let selDayStartMillis = budget.widgets.BusinessHours.MILLI_PER_DAY * selDayIndex;
        let dayUsage = me.createDayUsage_(site);

        let selHoursIndexNull = me.getSelectedIndexInArray(dayUsage, menuInfo.clickPosMilli);

        if (selHoursIndexNull === null) {
            return;
        }
        let selHoursIndex = selHoursIndexNull;
        let columns = new recoil.ui.widgets.TableMetaData();
        let startCol = new recoil.ui.columns.Time(hoursT.cols.start, budget.messages.START_TIME.toString());
        let stopCol = new recoil.ui.columns.Time(hoursT.cols.stop, budget.messages.STOP_TIME.toString());

        columns.addColumn(startCol);
        columns.addColumn(stopCol);

        // columns.add(holidaysT.cols.stop, budget.messages.STOP_DATE.toString());
        // tbl.addColumnMeta(holidaysT.cols.stop, {type: 'time'});

        let dayStart = dayUsage[selHoursIndex].start;
        let dayStop = dayUsage[selHoursIndex].stop;
        let dayStartMillis = dayStart - selDayStartMillis;
        let dayStopMillis = dayStartMillis + (dayStop - dayStart);

        let row = new recoil.structs.table.MutableTableRow();

        row.set(tblKeys.id, 0);
        row.set(tblKeys.start, dayStartMillis);
        row.set(tblKeys.stop, dayStopMillis);

        tbl.addRow(row);

        let memTableB = frp.createB(columns.applyMeta(tbl));
        let modTableB = frp.liftBI(function(tbl) {
            let res = tbl.createEmpty();
            tbl.forEachModify(function(row) {
                row.addCellMeta(tblKeys.stop, {min: row.get(tblKeys.start) + 60000});
                if (row.get(tblKeys.stop) <= row.get(tblKeys.start)) {
                    row.addCellMeta(tblKeys.stop, {errors: [budget.messages.END_TIME_AFTER_START.toString()]});
                }
                else {
                    row.addCellMeta(tblKeys.stop, {errors: []});
                }

                res.addRow(row);
            });
            return res.freeze();
        }, function(tbl) {
            memTableB.set(tbl);
        }, memTableB);


        let td = new aurora.widgets.TableDialog(me.scope_, modTableB, frp.createCallback(function(e) {
            let res = me.holidaysB_.get().unfreeze();
            let hoursTable = modTableB.get();

            hoursTable.forEach(function(row) {
                let newStartTime = (budget.widgets.BusinessHours.MILLI_PER_DAY * selDayIndex) + row.get(hoursT.cols.start);
                let newStopTime = (budget.widgets.BusinessHours.MILLI_PER_DAY * selDayIndex) + row.get(hoursT.cols.stop);

                dayUsage[selHoursIndex].start = newStartTime;
                dayUsage[selHoursIndex].stop = newStopTime;
            });

            me.mergeDayUsage_(dayUsage, true);
            me.siteB_.set(me.updateDayUsage_(site, dayUsage));

        }, modTableB, me.siteB_, me.holidaysB_), budget.messages.MODIFY.toString(), function(row) {
            return null;
        }, budget.messages.MODIFY_HOURS_DIALOG.toString(), undefined, {blockErrors: true});
        td.show(true);

    }, this.siteB_, this.curDateB_, this.holidaysB_, this.hoursTblB_);
};

/**
 * @param {{dayIndex: number, hourIndex: number, clickPosMilli: number, clickPosTime:number}} menuInfo
 * @return {boolean}
 */
budget.widgets.BusinessHours.prototype.regHoursExists_ = function(menuInfo) {
    let site = this.siteB_.get();
    let dayUsage = this.createDayUsage_(site);
    return this.timeInDateRange_(dayUsage, menuInfo.clickPosMilli);

};

/**
 * @param {{dayIndex: number, hourIndex: number, clickPosMilli: number, clickPosTime:number}} menuInfo
 * @return {boolean}
 */
budget.widgets.BusinessHours.prototype.holidayExists_ = function(menuInfo) {
    let holidays = this.holidaysB_.get();
    let holidayUsage = this.createHolidayUsage_(holidays);
    let startOfWeekMilli = recoil.ui.widgets.DateWidget2.convertLocaleDate(this.curDateB_.get()).getTime();
    return this.timeInDateRange_(holidayUsage, (startOfWeekMilli + menuInfo.clickPosMilli));

};


/**
 * @param {{dayIndex: number, hourIndex: number, clickPosMilli: number, clickPosTime:number}} menuInfo
 * @return {boolean}
 */
budget.widgets.BusinessHours.prototype.isAvailable_ = function(menuInfo) {
    let avail = this.availableB_.get();
    let startOfWeekMilli = recoil.ui.widgets.DateWidget2.convertLocaleDate(this.curDateB_.get()).getTime();
    let availUsage = this.createAvailable_(avail, startOfWeekMilli, startOfWeekMilli + budget.widgets.BusinessHours.MILLI_PER_DAY * 7);
    return this.timeInDateRange_(availUsage, (menuInfo.clickPosTime - startOfWeekMilli));

};


/**
 * @private
 *
 */
budget.widgets.BusinessHours.prototype.setupMenu_ = function() {
    let me = this;
    let frp = me.scope_.getFrp();
    let HOUR_RES = budget.widgets.BusinessHours.HOUR_RES;
    let scope = me.scope_;
    let menuInfo = {dayIndex: 0, hourIndex: 0, clickPosMilli: 0, clickPosTime: 0};
    let menus = [];

    let holidayExists = this.holidayExists_.bind(this);
    let regHoursExists = this.regHoursExists_.bind(this);
    let isAvailable = this.isAvailable_.bind(this);
    let not = function(func) {
        return function(menuInfo) {
            return !func(menuInfo);
        };
    };

    let and = function(f1, f2) {
        return function(menuInfo) {
            return f1(menuInfo) && f2(menuInfo);
        };
    };


    let checkPerm = function(perms) {
        return function() {
            let context = me.contextB_.get();
            for (let i = 0; i < perms.length; i++) {
                if (aurora.permissions.has(perms[i])(context)) {
                    return true;
                }
            }
            return false;
        };
    };
    let addMenu = function(name, show, func, perm) {
        menus.push({item: new goog.ui.MenuItem(name.toString()), show: and(show, checkPerm), func: func});
    };
    if (this.type_ === 'admin') {
        addMenu(budget.messages.REMOVE_HOURS, regHoursExists, this.doRemoveHoursFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.MODIFY_HOURS_DIALOG, regHoursExists, this.doModifyHoursDialogFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.ADD_HOURS_DIALOG, not(regHoursExists), this.doAddHoursDialogFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.REMOVE_HOLIDAY, holidayExists, this.doRemoveHolidayFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.MODIFY_HOLIDAY_DIALOG, holidayExists, this.doModifyHolidayDialogFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.MAKE_HOLIDAY, not(holidayExists), this.doMakeHolidayFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.ADD_HOLIDAYS_DIALOG, not(holidayExists), this.doAddHolidaysDialogFunc_(menuInfo), ['site-management']);
    }


    if (this.type_ === 'mentor') {
        addMenu(budget.messages.MAKE_AVAILABLE, not(isAvailable), this.doAddAvailableFunc_(menuInfo), ['mentor']);
        addMenu(budget.messages.MAKE_UNAVAILABLE, isAvailable, this.doRemoveAvailableFunc_(menuInfo, false), ['mentor']);
        addMenu(budget.messages.MAKE_UNAVAILABLE_ONCE, isAvailable, this.doRemoveAvailableFunc_(menuInfo, true), ['mentor']);
    }

    menus.forEach(function(mInfo) {
        goog.events.listen(mInfo.item, goog.ui.Component.EventType.ACTION, mInfo.func);
    });

//    this.removeHoursDialog_ = new goog.ui.MenuItem(budget.messages.REMOVE_HOURS_ELLIPSE.toString());
    this.removeHours_ =
    this.contextMenu_ = new goog.ui.PopupMenu();

    let calDiv = goog.dom.getElementsByClass('budget-calendar');
    //    this.contextMenu_.render(calDiv);
    // @todo change the render to not use document.body
    this.contextMenu_.render(document.body);

    goog.events.listen(
        this.calendarDiv_, goog.events.EventType.CONTEXTMENU, frp.accessTransFunc(function(e) {

            if (e.ctrlKey) {
                return;
            }
            me.contextMenu_.removeChildren(true);


            let topLeft = me.days_[0].hours[0].getBoundingClientRect();
            let bottomRight = me.days_[6].hours[23].getBoundingClientRect();
            let height = bottomRight.top + bottomRight.height - topLeft.top;
            let width = bottomRight.left + bottomRight.width - topLeft.left;
            let clickPos = me.calcPos_(e);
            let hourIndex = Math.max(0, Math.round(Math.floor(Math.min(clickPos.y) * 24 / height * HOUR_RES) / HOUR_RES * 3600000));

            let dayIndex = Math.floor(clickPos.x * 7 / width);
            let milliInDay = Math.max(0, Math.round(clickPos.y * 24 * 3600000 / height));
            let clickPosMilli = milliInDay + dayIndex * 24 * 3600000;

            let startOfWeekMilli = recoil.ui.widgets.DateWidget2.convertLocaleDate(me.curDateB_.get()).getTime();
            menuInfo.dayIndex = dayIndex;
            menuInfo.hourIndex = hourIndex;
            menuInfo.clickPosMilli = clickPosMilli;
            menuInfo.clickPosTime = budget.widgets.BusinessHours.addDays_(startOfWeekMilli, dayIndex, milliInDay);
            let show = false;
            menus.forEach(function(mInfo) {
                if (mInfo.show(menuInfo)) {
                    me.contextMenu_.addChild(mInfo.item, true);
                    show = true;
                }
            });

            if (show) {
                me.contextMenu_.showAt(e.clientX, e.clientY);

            }
            e.preventDefault();
            e.stopPropagation();
        }, this.siteB_, this.curDateB_, this.holidaysB_, this.appointmentsB_, this.availableB_));
};

/**
 * Returns a dom node with a set of attributes.  This function accepts varargs
 * for subsequent nodes to be added.  Subsequent nodes will be added to the
 * first node as childNodes.
 *
 * So:
 * <code>createDom(goog.dom.TagName.DIV, null, createDom(goog.dom.TagName.P),
 * createDom(goog.dom.TagName.P));</code> would return a div with two child
 * paragraphs
 *
 * For passing properties, please see {@link goog.dom.setProperties} for more
 * information.
 *
 * @param {string|!goog.dom.TagName<T>} tagName Tag to create.
 * @param {?Object|?Array<string>|string=} opt_attributes If object, then a map
 *     of name-value pairs for attributes. If a string, then this is the
 *     className of the new element. If an array, the elements will be joined
 *     together as the className of the new element.
 * @param {...(Object|string|Array|NodeList|null|undefined|recoil.ui.Widget|goog.ui.Component)} var_args Further
 *     DOM nodes or strings for text nodes. If one of the var_args is an array
 *     or NodeList, its elements will be added as childNodes instead.
 * @return {R} Reference to a DOM node. The return type is {!Element} if tagName
 *     is a string or a more specific type if it is a member of
 *     goog.dom.TagName (e.g. {!HTMLAnchorElement} for goog.dom.TagName.A).
 * @template T
 * @template R := cond(isUnknown(T), 'Element', T) =:
 */
budget.widgets.BusinessHours.createWidgetDom = function(tagName, opt_attributes, var_args) {
    let outArgs = [];
    for (let i = 0; i < arguments.length; i++) {
        let arg = arguments[i];
        if (arg && arg.getComponent instanceof Function) {
            let div = goog.dom.createDom('div');
            arg.getComponent().render(div);
            outArgs.push(div);
        } else if (arg instanceof goog.ui.Component) {
            let div = goog.dom.createDom('div');
            arg.render(div);
            outArgs.push(div);
        } else {
            outArgs.push(arg);
         }
    }


    return goog.dom.createDom.apply(document, outArgs);
};


/**
 * @private
 * @param {{dayIndex:number,hourIndex:number,clickPosTime:number}} menuInfo
 * @param {number} curDate
 * @return {number}
 */
budget.widgets.BusinessHours.prototype.getSelectionDate_ = function(menuInfo, curDate) {
    let me = this;
    let selDate = me.dateWidget_.convertLocaleDate(curDate);
    return selDate.setDate(menuInfo.dayIndex + selDate.getDate());

};

/**
 * @private
 * @param {!Array<{start: number, stop: number}>} timeRange
 * @param {number} time
 * @return boolean
 */
budget.widgets.BusinessHours.prototype.timeInDateRange_ = function(timeRange, time) {

    for (let i = 0; i < timeRange.length; i++) {
        let hol = timeRange[i];

        if (time >= hol.start && time <= hol.stop) {
            return true;
        }
    }
    return false;
};

/**
 * @private
 * @param {!Array<{start: number, stop: number}>} dayUsage
 * @param {boolean=} opt_absolute
 */
budget.widgets.BusinessHours.prototype.mergeDayUsage_ = function(dayUsage, opt_absolute) {
    let comparator = function(x, y) {
        let res = x.start - y.start;
        if (res) {
            return res;
        }
        return x.stop - y.stop;
    };
    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
    let milliPerWeek = milliPerDay * 7;

    for (let i = dayUsage.length - 1; i >= 0; i--) {
        let e = dayUsage[i];
        let size = e.stop - e.start;
        if (size <= 0) {
            dayUsage.splice(i, 1);
        }
        else if (!opt_absolute) {
            e.start = e.start % milliPerWeek;
            e.stop = e.start + size;
        }



    }
    // merge entries
    let entries = dayUsage;
    entries.sort(comparator);
    if (entries.length === 0) {
        return;
    }
    let newEntries = [entries[0]];
    let last = entries[0];
    for (let i = 1; i < entries.length; i++) {
        let e = entries[i];
        if (last.stop < e.start) {
            last = e;
            newEntries.push(e);
        }
        else {
            last.stop = Math.max(last.stop, e.stop);
        }
    }
    dayUsage.splice(0, dayUsage.length);
    dayUsage.push.apply(dayUsage, newEntries);

};


/**
 * @private
 * @param {!recoil.structs.table.Table} holidays
 * @return {!Array<{start: number, stop: number}>}
 */
budget.widgets.BusinessHours.prototype.createHolidayUsage_ = function(holidays) {
    let holidaysT = aurora.db.schema.tables.base.site_holidays;

    let dayUsage = [];

    holidays.forEach(function(entry) {
        dayUsage.push({start: entry.get(holidaysT.cols.start), stop: entry.get(holidaysT.cols.stop)});
    });

    this.mergeDayUsage_(dayUsage, true);
    return dayUsage;
};


/**
 * @private
 * add months to start taking into consideration month lengths, if the lenght is shorter it will go
 * to the last day of the month
 * @param {number} start
 * @param {number} months number of months to add
 * @return {number}
 */
budget.widgets.BusinessHours.addMonths_ = function(start, months) {
    let startDate = new Date(start);
    let month = startDate.getMonth();
    startDate.setMonth(month + months + 1, 0);
    let maxDate = startDate.getDate();
    startDate = new Date(start);
    startDate.setMonth(month + months, Math.min(maxDate, startDate.getDate()));
    return startDate.getTime();

};

/**
 * @private
 * add months to start taking into consideration month lengths, if the lenght is shorter it will go
 * to the last day of the month
 * @param {number} start
 * @param {number} days number of months to add
 * @param {number=} opt_millInDay if specified will set the time of day
 * @return {number}
 */
budget.widgets.BusinessHours.addDays_ = function(start, days, opt_millInDay) {
    let date = new Date(start);
    date.setDate(date.getDate() + days);
    if (opt_millInDay != undefined) {
        let MILL_PER_HOUR = 3600000;
        let hours = Math.floor(opt_millInDay / MILL_PER_HOUR);
        let rem = opt_millInDay % MILL_PER_HOUR;
        date.setHours(hours);
        date.setMinutes(Math.floor(rem / 60000));
        rem = rem % 60000;
        date.setSeconds(Math.floor(rem / 1000), rem % 1000);
    }
    return date.getTime();

};

/**
 * @private
 * gets the number of months since 0000
 * @param {number} when
 * @return {number}
 */
budget.widgets.BusinessHours.getMonths_ = function(when) {
    let date = new Date(when);
    return date.getFullYear() * 12 + date.getMonth();
};


/**
 * @param {!recoil.structs.table.TableRowInterface} entry
 * @param {number} cur millis since epoc
 * @param {number} steps
 * @return {?number}
 */
budget.widgets.BusinessHours.nextPeriod_ = function(entry, cur, steps) {
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let RepeatType = aurora.db.schema.getEnum(availT.cols.repeat);
    let repeatMeta = aurora.db.schema.getMeta(availT.cols.repeat);
    let repType = entry.get(availT.cols.repeat);

    const REGULAR = [RepeatType.weekly, RepeatType.fortnightly, RepeatType.daily];
    let regularIdx = REGULAR.indexOf(repType);
    let startRep = entry.get(availT.cols.start);
    let stopRep = entry.get(availT.cols.stop);

    if (steps === 0) {
        return cur;
    }

    if (repType == null) {
        // once of there is no next or previous
        return null;
    }
    let when = null;
    if (regularIdx != -1) {
        let interval = repeatMeta.enumInfo[repType].rate;
        let date = new Date(cur);
        date.setDate(date.getDate() + steps * interval);
        when = date.getTime();

    }
    else {
        let intervalMonths = Math.round(12 * (repeatMeta.enumInfo[repType].rate / 365));
        when = budget.widgets.BusinessHours.addMonths_(cur, intervalMonths * steps);
    }
    if (when < startRep) {
        // before the start so doesn't exits
        return null;
    }
    if (stopRep != null && stopRep <= when) {
        return null;
    }
    return when;

};

/**
 * @param {!recoil.structs.table.TableRowInterface} entry
 * @param {number} periodStart millis since epoc
 * @param {number} periodStop millis since epoc
 * @param {function(number,number)} callback - params start and stop
 */
budget.widgets.BusinessHours.iterateOverPeriod_ = function(entry, periodStart, periodStop, callback) {
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let RepeatType = aurora.db.schema.getEnum(availT.cols.repeat);
    let repeatMeta = aurora.db.schema.getMeta(availT.cols.repeat);

    const REGULAR = [RepeatType.weekly, RepeatType.fortnightly, RepeatType.daily];
    let startRep = entry.get(availT.cols.start);
    let stopRep = entry.get(availT.cols.stop);

    if (periodStop < periodStart) {
        return;
    }
    let repType = entry.get(availT.cols.repeat);
    if (repType == null) {
        if (startRep >= periodStart && startRep < periodStop) {
            callback(startRep, startRep + entry.get(availT.cols.len));
        }
        return;
    }

    let stopTime = stopRep == null ? periodStop : stopRep;
    let regularIdx = REGULAR.indexOf(repType);
    if (regularIdx !== -1) {
        let interval = repeatMeta.enumInfo[repType].rate * budget.widgets.BusinessHours.MILLI_PER_DAY;
        let curStart = startRep;
        if (startRep < periodStart) {
            let numIntervals = Math.ceil((periodStart - startRep) / interval);
            curStart = numIntervals * interval + startRep;
        }

        for (let i = curStart; i < stopTime; i += interval) {
            // deal with daylight savings
            let dayDiff = Math.round((i - startRep) / budget.widgets.BusinessHours.MILLI_PER_DAY);

            let time = new Date(startRep);
            time.setDate(time.getDate() + dayDiff);
            callback(time.getTime(), time.getTime() + entry.get(availT.cols.len));
        }
    }
    else if (repType === RepeatType.monthly || repType === RepeatType.quarterly || repType === RepeatType.yearly) {
        // we will work in months and compare
        let repMonths = budget.widgets.BusinessHours.getMonths_(startRep);
        let startMonths = budget.widgets.BusinessHours.getMonths_(periodStart);
        let interval = Math.round(12 * (repeatMeta.enumInfo[repType].rate / 365));
        let curStart = repMonths;

        if (startMonths > repMonths) {
            let numIntervals = Math.ceil((startMonths - repMonths) / interval);
            curStart = repMonths + numIntervals * interval;
        }


        let curMonth = curStart - repMonths;

        let curDate = budget.widgets.BusinessHours.addMonths_(startRep, curMonth);
        while (curDate < stopTime) {
            callback(curDate, curDate + entry.get(availT.cols.len));
            curMonth += interval;
            curDate = budget.widgets.BusinessHours.addMonths_(startRep, curMonth);

        }
    }
};
/**
 * @private
 * @param {!recoil.structs.table.Table} avail
 * @param {number} periodStart
 * @param {number} periodStop
 * @return {!Array<{start: number, stop: number}>}
 */
budget.widgets.BusinessHours.prototype.createAvailable_ = function(avail, periodStart, periodStop) {
    let availT = aurora.db.schema.tables.base.mentor_availablity;

    let iterateOverPeriod = budget.widgets.BusinessHours.iterateOverPeriod_;

    let dayUsage = [];
    // the end time here is where the repeat stops not the appointment
    avail.forEach(function(entry) {
        iterateOverPeriod(entry, periodStart, periodStop, function(start, stop) {
            if (stop > periodStart && start < periodStop) {
                dayUsage.push({start: start - periodStart, stop: stop - periodStart});
            }
        });
    });

    this.mergeDayUsage_(dayUsage, true);
    return dayUsage;
};

/**
 * @private
 * @param {!recoil.structs.table.Table} site
 * @return {!Array<{start: number, stop: number}>}
 */
budget.widgets.BusinessHours.prototype.createDayUsage_ = function(site) {
    let siteT = aurora.db.schema.tables.base.site;
    let regT = siteT.regular;
    let dayUsage = [];

    site.forEach(function(row) {
        let reg = row.get(siteT.cols.regular);
        reg.forEach(function(entry) {
            dayUsage.push({start: entry.start, stop: entry.stop});
        });
    });

    this.mergeDayUsage_(dayUsage);
    return dayUsage;
};

/**
 *
 * @private
 * @param {!recoil.structs.table.Table} site
 * @param {!recoil.structs.table.Table} holidaysTbl
 * @param {!Array<{start: number, stop: number}>} holidayUsage
 * @return recoil.structs.table.Table
 */
budget.widgets.BusinessHours.prototype.updateHolidayUsage_ = function(site, holidaysTbl, holidayUsage) {
    let siteT = aurora.db.schema.tables.base.site;
    let result = holidaysTbl.createEmpty();
    let holidaysT = aurora.db.schema.tables.base.site_holidays;
    let holidaysArr = [];

    holidaysTbl.forEachModify(function(row) {
        holidaysArr.push(row);
    });

    site.forEachModify(function(row) {
        let entries = [];
        let siteId = row.get(siteT.cols.id);

        for (let i = 0; i < holidayUsage.length; i++) {
            let newEntry = {};
            if (holidaysArr[i] !== undefined) {
                newEntry = holidaysArr[i];
            }
            else {
                newEntry = new recoil.structs.table.MutableTableRow();
                holidaysArr.push(newEntry);
            }
            let start = holidayUsage[i].start;
            let stop = holidayUsage[i].stop;

            newEntry.set(holidaysT.cols.siteid, siteId);
            newEntry.set(holidaysT.cols.start, start);
            newEntry.set(holidaysT.cols.stop, stop);

            if (start < stop) {
                result.addRow(newEntry);
            }

        }
    });

    return result.freeze();
};

/**
 *
 * @private
 * @param {!recoil.structs.table.Table} site
 * @param {!Array<{start: number, stop: number}>} dayUsage
 * @return recoil.structs.table.Table
 */
budget.widgets.BusinessHours.prototype.updateDayUsage_ = function(site, dayUsage) {
    let siteT = aurora.db.schema.tables.base.site;
    let regT = siteT.regular;
    let result = site.createEmpty();
    this.mergeDayUsage_(dayUsage);


    site.forEachModify(function(row) {
        let reg = row.get(siteT.cols.regular);
        let entries = [];
        let pos = 0;

        for (let i = 0; i < dayUsage.length; i++) {
            let newEntry = {};
            if (reg[pos] !== undefined) {
                newEntry = goog.object.clone(reg[pos++]);
            }
            else {
                newEntry.id = regT.cols.id.getDefault();
            }
            newEntry.day = 0;
            newEntry.start = dayUsage[i].start;
            newEntry.stop = dayUsage[i].stop;
            entries.push(newEntry);

        }

        row.set(siteT.cols.regular, entries);
        result.addRow(row);
    });

    return result.freeze();
};

/**
 * calculates the milli second from epoch day will be
 * @param {number} day 0 sunday
 * @return {number}
 */
budget.widgets.BusinessHours.prototype.calcDayStart = function(day) {
    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
    let zeroDay = new Date(0);
    zeroDay.setHours(0);
    return ((7 + day - zeroDay.getDay()) % 7) * milliPerDay + zeroDay.getTime();
};

/**
 * @param {!Array<{start: number, stop: number}>} dayUsage
 * @param {?} calDim
 * @param {?} hourDim
 * @param {string} cls the class of the div to add
 * @param {boolean} handleDaylightSaving
 */
budget.widgets.BusinessHours.prototype.updateUsage_ = function(dayUsage, calDim, hourDim, cls, handleDaylightSaving) {
    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
    let milliPerWeek = milliPerDay * 7;
    let cd = goog.dom.createDom;
    let hourH = hourDim.height;
    let minY = hourDim.top - calDim.top;
    let weekStart = this.dateWidget_.convertLocaleDate(this.curDateB_.get()).getTime();
    let getDstAdjust = function(day) {
        if (!handleDaylightSaving) {
            return 0;
        }
        let dayEnd = budget.widgets.BusinessHours.addDays_(weekStart, day + 1);
        return (weekStart + milliPerDay * (day + 1)) - dayEnd;
    };
    let days = {};
    for (let i = 0; i < 7; i++) {
        let dayStart = i * milliPerDay;
        let dayEnd = dayStart + milliPerDay;
        days[i] = [];
        dayUsage.forEach(function(item) {

            let itemStart = (item.start) % milliPerWeek;
                let itemStop = itemStart + (item.stop - item.start);
            if (itemStop < dayStart) {
                if (itemStop >= dayStart) {
                    days[i].push({start: 0, stop: Math.min(milliPerDay, itemStop - dayStart)});
                }
            }
            else if (itemStart < dayEnd) {
                days[i].push({start: Math.max(itemStart - dayStart, 0) , stop: Math.min(milliPerDay, itemStop - dayStart)});
            }


        });
    }

    for (let i = 0; i < 7; i++) {
        let dstOffset = getDstAdjust(i);

        let avail = days[i];
        let availDivs = goog.dom.getElementsByClass(cls, this.days_[i].div);
            let availLen = (avail ? avail.length : 0);
        // remove dives that are not needed
        if (availDivs) {
            for (let j = availDivs.length - 1; j >= availLen; j--) {
                goog.dom.removeNode(availDivs[j]);
            }
        }

        for (let j = 0; j < availLen; j++) {
            let curDiv = availDivs && availDivs[j];

            if (!curDiv) {
                curDiv = cd('div', cls);
                this.days_[i].div.appendChild(curDiv);
            }
            let yStart = (minY + hourH * (avail[j].start + dstOffset) / 3600000);
            let yEnd = (minY + hourH * (avail[j].stop + dstOffset) / 3600000);

            curDiv.style.top = yStart + 'px';
                curDiv.style.height = (yEnd - yStart) + 'px';
            curDiv.style.width = hourDim.width + 'px';
        }

    }

};
/**
 * @private
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 */
budget.widgets.BusinessHours.prototype.update_ = function(helper) {
    goog.style.setElementShown(this.loadingContainer_, !helper.isGood() && helper.errors().length === 0);
    goog.style.setElementShown(this.errorContainer_, !helper.isGood() && helper.errors().length !== 0);
    goog.style.setElementShown(this.calendarDiv_, helper.isGood());
    let cd = goog.dom.createDom;

    let me = this;
    if (helper.isGood()) {

        goog.style.setElementShown(this.mentorDiv_, aurora.permissions.has('user-management')(this.contextB_.get()));

        let border = this.borderDimsB_.get();
        let range = this.highlightedB_.get();
        goog.style.setElementShown(this.highlightDiv_, range.start !== null);
        if (range.start !== null) {
            let calDim = this.calendarDiv_.getBoundingClientRect();
            let minY = me.days_[0].hours[0].getBoundingClientRect().top - calDim.top;
            let minX = me.days_[0].div.getBoundingClientRect().left - calDim.left;
            let div = this.highlightDiv_;
            goog.dom.classlist.enable(div, 'remove-selection', !range.add);
            div.style.left = (minX + Math.min(range.start.x, range.stop.x)) + 'px';
            div.style.top = (minY + Math.min(range.stop.y, range.start.y)) + 'px';
            div.style.height = Math.max(0, Math.abs(range.start.y - range.stop.y) - border.y) + 'px';
            div.style.width = Math.max(Math.abs(range.start.x - range.stop.x) - border.x, 0) + 'px';
        }

        let site = this.siteB_.get();

        let calDim = this.calendarDiv_.getBoundingClientRect();
        let hourDim = me.days_[0].hours[0].getBoundingClientRect();
        let hourH = hourDim.height;
        let minY = hourDim.top - calDim.top;

        let curDate = this.curDateB_.get();
        let nextDate = this.dateWidget_.convertLocaleDate(curDate);
        let date = nextDate.getDate();

        for (let i = 0; i < this.dateDivs_.length; i++) {
            let div = this.dateDivs_[i];

            nextDate.setDate(date);
            goog.dom.setTextContent(
                div,
                nextDate.toLocaleDateString('default',
                                            { day: 'numeric', month: 'short'}));

            date = nextDate.getDate() + 1;
        }

        let dayUsage = this.createDayUsage_(site);
        let holidays = this.holidaysB_.get();
        let mentorAvail = this.availableB_.get();
        let holidayUsage = this.createHolidayUsage_(holidays);

        let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
        let milliPerWeek = milliPerDay * 7;

        me.updateUsage_(dayUsage, calDim, hourDim, 'avail', false);
        if (me.type_ === 'mentor') {
            let pStart = this.dateWidget_.convertLocaleDate(curDate).getTime();
            me.updateUsage_(this.createAvailable_(this.availableB_.get(), pStart, pStart + milliPerWeek), calDim, hourDim, 'mentor-avail', true);
        }


        let startDateMillis = this.dateWidget_.convertLocaleDate(curDate).getTime();

        let holidayDivs = goog.dom.getElementsByClass('budget-holiday', this.calendarDiv_);
        for (let j = 0; j < holidayDivs.length; j++) {
            goog.dom.removeNode(holidayDivs[j]);
        }

        for (let day = 0; day < 7; day++) {
            let curDateStart = startDateMillis + (day * milliPerDay);
            let curDateEnd = curDateStart + milliPerDay;

            for (let i = 0; i < holidayUsage.length; i++) {

                let hol = holidayUsage[i];

                if (curDateEnd <= hol.start || curDateStart >= hol.stop) {

                } else {
                    let startOffsetMillis = Math.max(hol.start - curDateStart, 0);
                    let endOffsetMillis = Math.min(milliPerDay, hol.stop - curDateStart);

                    let yStart = (minY + hourH * startOffsetMillis / 3600000);
                    let yEnd = (minY + hourH * endOffsetMillis / 3600000);

                    let curDiv = cd('div', {class: 'budget-holiday'});

                    curDiv.style.top = yStart + 'px';
                    curDiv.style.height = (yEnd - yStart) + 'px';
                    curDiv.style.width = hourDim.width + 'px';

                    this.days_[day].div.appendChild(curDiv);

                }
            }
        }

    }
};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.BusinessHours.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.BusinessHours.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

