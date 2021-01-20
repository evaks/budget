goog.provide('budget.widgets.BusinessHours');


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
goog.require('recoil.ui.widgets.table.TableWidget');
/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.BusinessHours = function(scope) {
    this.scope_ = scope;
    let me = this;
    let hourRes = 2;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let siteT = aurora.db.schema.tables.base.site;
    let holidaysT = aurora.db.schema.tables.base.site_holidays;

    let highlightedB = frp.createB(/** @type {{add: ?boolean, start:?{x:number,y:number},stop:?{x:number,y:number}}} */({start: null, stop: null}));

    let pad = function(v, len) {
        let str = ('0'.repeat(len) + v);
        return str.substring(str.length - len);
    };


    let format = new Intl.DateTimeFormat(undefined, {
        weekday: 'short'
    });

    this.dateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    let milliPerDay = 3600000 * 24;

    let weekdayIze = function() {
        let milliPerDay = 3600000 * 24;
        let today = new Date();
        let monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * milliPerDay);
        return monday;
    };

    this.curDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(weekdayIze()));
    this.dateWidget_.attachStruct({value: this.curDateB_, min: 19700105, step: 7});

    this.siteB_ = scope.getDb().get(siteT.key);
    this.holidaysB_ = frp.switchB(frp.liftB(function(date) {
        let query = new recoil.db.Query();
        let startTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime();

        let endTime = startTime + 7 * milliPerDay;

        return scope.getDb().get(holidaysT.key, query.and(
            query.gt(query.field(holidaysT.cols.stop), query.val(startTime)),
            query.lt(query.field(holidaysT.cols.start), query.val(endTime))
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

    this.makeHoliday_ = new goog.ui.MenuItem(aurora.messages.MAKE_HOLIDAY.toString());
    this.removeHoliday_ = new goog.ui.MenuItem(aurora.messages.REMOVE_HOLIDAY.toString());
    this.addHoliday_ = new goog.ui.MenuItem(aurora.messages.ADD_HOLIDAY.toString());
    this.modifyHoliday_ = new goog.ui.MenuItem(aurora.messages.MODIFY_HOLIDAY_ELLIPSE.toString());
    this.contextMenu_ = new goog.ui.PopupMenu();

    // @todo change the render to not use document.body
    this.contextMenu_.render(document.body);

    let menuInfo = {};

    let calcPos = function(e) {

        let minY = me.days_[0].hours[0].getBoundingClientRect().top;
        let minX = me.days_[0].div.getBoundingClientRect().left;
        return {x: Math.max(0, e.clientX - minX), y: Math.max(e.clientY - minY)};
    };


    this.getSelectedIndex = function(holidayUsage, selectInfo) {
        let foundIndex = null;
        let selectTime = selectInfo.selDate.getTime();

        for (let i = 0; i < holidayUsage.length; i++) {
            let hol = holidayUsage[i];

            if (selectTime === hol.start) {
                foundIndex = i;
            } else if (selectTime > hol.start && selectTime < hol.stop) {
                foundIndex = i;
            }
        }
        return foundIndex;
    };

    goog.events.listen(
        this.calendarDiv_, goog.events.EventType.CONTEXTMENU, frp.accessTransFunc(function(e) {

            me.contextMenu_.removeChildren(true);

//            me.contextMenu_.showMenu(me.contextMenu_, (e.clientX), e.clientY);
            me.contextMenu_.showAt(e.clientX, e.clientY);
            
            let site = me.siteB_.get();
            let holidays = me.holidaysB_.get();
            let holidayUsage = me.createHolidayUsage_(holidays);
            let topLeft = me.days_[0].hours[0].getBoundingClientRect();
            let bottomRight = me.days_[6].hours[23].getBoundingClientRect();
            let height = bottomRight.top + bottomRight.height - topLeft.top;
            let width = bottomRight.left + bottomRight.width - topLeft.left;
            let clickPos = calcPos(e);
            let hourIndex = Math.max(0, Math.round(Math.floor(Math.min(clickPos.y) * 24 / height * hourRes) / hourRes * 3600000));

            let dayIndex = Math.floor(clickPos.x * 7 / width);

            menuInfo.dayIndex = dayIndex;
            menuInfo.hourIndex = hourIndex;

            let selectInfo = me.getSelectionInfo_(site, holidays, me.curDateB_.get());

            if (me.getSelectedIndex(holidayUsage, selectInfo) !== null) {
                me.contextMenu_.addChild(me.removeHoliday_, true);
                me.contextMenu_.addChild(me.modifyHoliday_, true);
            } else {
                me.contextMenu_.addChild(me.makeHoliday_, true);
                me.contextMenu_.addChild(me.addHoliday_, true);
            }

            e.preventDefault();
            e.stopPropagation();
        }, this.siteB_, this.curDateB_, this.holidaysB_));

    this.getSelectionInfo_ = function(site, holidaysTbl, curDate) {
        let milliPerDay = 3600000 * 24;
        let milliPerWeek = milliPerDay * 7;


        let start = (menuInfo.dayIndex * milliPerDay) % milliPerWeek;
        let startTime = start + menuInfo.hourIndex;
        let endTime = startTime + milliPerDay;
        let holidays = me.createHolidayUsage_(holidaysTbl);
        let selDate = me.dateWidget_.convertLocaleDate(curDate);
        selDate.setDate(menuInfo.dayIndex + selDate.getDate()); // should this be in here??

        return {
            milliPerDay: milliPerDay,
            milliPerWeek: milliPerWeek,
            start: start,
            startTime: startTime,
            endTime: endTime,
            selDate: selDate
        };

    };

    goog.events.listen(this.makeHoliday_, goog.ui.Component.EventType.ACTION, frp.accessTransFunc(function(e) {
        let site = me.siteB_.get();
        let hols = me.holidaysB_.get();

        let holidays = me.createHolidayUsage_(hols);
        let selectInfo = me.getSelectionInfo_(site, hols, me.curDateB_.get());

        holidays.push({start: selectInfo.selDate.getTime(), stop: selectInfo.selDate.getTime() + selectInfo.milliPerDay});
        me.mergeDayUsage_(holidays, true);
        me.holidaysB_.set(me.updateHolidayUsage_(site, hols, holidays));

    }, this.siteB_, this.curDateB_, this.holidaysB_));


    goog.events.listen(this.removeHoliday_, goog.ui.Component.EventType.ACTION, frp.accessTransFunc(function(e) {
        let site = me.siteB_.get();
        let holidays = me.holidaysB_.get();

        let selectInfo = me.getSelectionInfo_(site, holidays, me.curDateB_.get());
        let selDate = selectInfo.selDate;
        let holidayUsage = me.createHolidayUsage_(holidays);
        let res = [];

        let selectedIndex = me.getSelectedIndex(holidayUsage, selectInfo);
        let selectedStartTime = selDate.getTime();
        let selectedStopTime = selDate.getTime() + selectInfo.milliPerDay;

        for (let i = 0; i < holidayUsage.length; i++) {
            let hol = holidayUsage[i];

            if (hol.stop < selectedStartTime || hol.start > selectedStopTime) {
                res.push(hol);
            }
            else {
                if (hol.start < selectedStartTime) {
                    res.push({start: hol.start, stop: selectedStartTime});
                }

                if (selectedStopTime < hol.stop) {
                    res.push({start: selectedStopTime, stop: hol.stop});
                }
            }

        }


        me.holidaysB_.set(me.updateHolidayUsage_(site, holidays, res));

    }, this.siteB_, this.curDateB_, this.holidaysB_));


    goog.events.listen(this.modifyHoliday_, goog.ui.Component.EventType.ACTION, frp.accessTransFunc(function(e) {
        let siteT = aurora.db.schema.tables.base.site;
        let holidaysT = aurora.db.schema.tables.base.site_holidays;

        let hols = me.holidaysB_.get();
        let site = me.siteB_.get();
        let tbl = hols.createEmpty([]);
        let tblKeys = holidaysT.cols;
        let selectInfo = me.getSelectionInfo_(site, hols, me.curDateB_.get());
        let holidayUsage = me.createHolidayUsage_(hols);
        let selectedIndex = me.getSelectedIndex(holidayUsage, selectInfo);

        let columns = new recoil.ui.widgets.TableMetaData();
        let startCol = new recoil.ui.columns.Date2(holidaysT.cols.start, aurora.messages.START_DATE.toString());
        let stopCol = new recoil.ui.columns.Date2(holidaysT.cols.stop, aurora.messages.STOP_DATE.toString());

        columns.addColumn(startCol);
        columns.addColumn(stopCol);

        let row = new recoil.structs.table.MutableTableRow();
        let start = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(holidayUsage[selectedIndex].start));
        let stop = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(holidayUsage[selectedIndex].stop - milliPerDay));

        row.set(tblKeys.siteid, 0);
        row.set(tblKeys.start, start);
        row.set(tblKeys.stop, stop);

        tbl.addRow(row);
        let modTableB = frp.createB(columns.applyMeta(tbl));

        let td = new aurora.widgets.TableDialog(scope, modTableB, frp.createCallback(function(e) {
            let res = me.holidaysB_.get().unfreeze();
            let modTable = modTableB.get();

            modTable.forEach(function(row) {
                let origStartTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(start).getTime();
                let origStopTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(stop).getTime();
                let modStartTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(row.get(holidaysT.cols.start)).getTime();
                let modStopTime = recoil.ui.widgets.DateWidget2.convertLocaleDate(row.get(holidaysT.cols.stop)).getTime();
                let millisPerDay = + 3600000 * 24;

                if (modStopTime < origStopTime || modStartTime > origStartTime) {
                    holidayUsage.splice(selectedIndex, 1);
                }
                holidayUsage.push({start: modStartTime, stop: modStopTime + millisPerDay});
            });

            me.mergeDayUsage_(holidayUsage, true);
            me.holidaysB_.set(me.updateHolidayUsage_(site, hols, holidayUsage));


        }, modTableB, me.siteB_, me.holidaysB_), aurora.messages.MODIFY.toString(), function() {return null;},  aurora.messages.MODIFY_HOLIDAY.toString());
        td.show(true);

    }, this.siteB_, this.curDateB_, this.holidaysB_));

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


    this.loadingContainer_ = cd('div', {class: 'budget-loading'}, cd('div'));
    this.errorContainer_ = cd('div', {class: 'budget-error'}, 'Error');
    this.container_ = budget.widgets.BusinessHours.createWidgetDom('div', {}, this.dateWidget_, this.calendarDiv_, this.loadingContainer_, this.errorContainer_);

    let isLeftPressed = function(e) {
        return e.getBrowserEvent().buttons === undefined
            ? e.getBrowserEvent().which === 1
            : e.getBrowserEvent().buttons === 1;
    };


    goog.events.listen(me.calendarDiv_, goog.events.EventType.MOUSEUP, frp.accessTransFunc(function(e) {
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
        let dayEndIndex = Math.ceil(Math.max(highlighted.start.x, highlighted.stop.x) * 7 / width);
        let hourStartIndex = Math.max(0, Math.round(Math.floor(Math.min(highlighted.start.y, highlighted.stop.y) * 24 / height * hourRes) / hourRes * 3600000));
        let hourEndIndex = Math.round(Math.ceil(Math.max(highlighted.start.y, highlighted.stop.y) * 24 / height * hourRes) / hourRes * 3600000);


        highlightedB.set({start: null, stop: null, add: true});
        let sq = function(x) {return x * x;};
        let dist = Math.sqrt(sq(highlighted.start.x - highlighted.stop.x) + sq(highlighted.start.y - highlighted.stop.y));
        if (dist < 5) {
            return;
        }

        let dayUsage = me.createDayUsage_(site);

        let milliPerDay = 3600000 * 24;
        let milliPerWeek = milliPerDay * 7;


        for (let i = dayStartIndex; i < dayEndIndex; i++) {

            let start = (i * milliPerDay) % milliPerWeek;
            let startTime = start + hourStartIndex;
            let stopTime = start + hourEndIndex;

            if (highlighted.add) {
                dayUsage.push({start: startTime, stop: stopTime});
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

        if (!isLeftPressed(e)) {
            return;
        }
        let pos = calcPos(e);
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

    goog.events.listen(this.calendarDiv_, goog.events.EventType.MOUSEMOVE, frp.accessTransFunc(function(e) {

        if (!isLeftPressed(e)) {
            highlightedB.set({start: null, stop: null, add: true});
        }
        let oldPos = /** @type {{add: ?boolean, start:?{x:number,y:number},stop:?{x:number,y:number}}} */ (goog.object.clone(highlightedB.get()));
        if (oldPos.start === null) {
            return;
        }
        let pos = calcPos(e);
        oldPos.stop = pos;
        oldPos.add = !e.ctrlKey;
        highlightedB.set(oldPos);
    }, highlightedB));

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);
    let contentSizeB = frp.createB(/** @type {?{width:number, height:number}} */ (null));

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);
    this.highlightedB_ = highlightedB;
    this.helper_.attach(this.siteB_, highlightedB, this.curDateB_, contentSizeB, this.holidaysB_);
    let resizeObserver = new ResizeObserver(frp.accessTransFunc(function(e) {
        contentSizeB.set({width: Math.round(e[0].contentRect.width), height: Math.round(e[0].contentRect.height)});

    }, contentSizeB));
    resizeObserver.observe(this.calendarDiv_);

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
    let milliPerDay = 3600000 * 24;
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
    let milliPerDay = 3600000 * 24;
    let zeroDay = new Date(0);
    zeroDay.setHours(0);
    return ((7 + day - zeroDay.getDay()) % 7) * milliPerDay + zeroDay.getTime();
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
            div.style.height = Math.abs(range.start.y - range.stop.y) + 'px';
            div.style.width = Math.abs(range.start.x - range.stop.x) + 'px';
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
        let holidayUsage = this.createHolidayUsage_(holidays);

        let milliPerDay = 3600000 * 24;
        let milliPerWeek = milliPerDay * 7;

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
            let avail = days[i];
            let availDivs = goog.dom.getElementsByClass('avail', this.days_[i].div);
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
                    curDiv = cd('div', 'avail');
                    this.days_[i].div.appendChild(curDiv);
                }
                let yStart = (minY + hourH * avail[j].start / 3600000);
                let yEnd = (minY + hourH * avail[j].stop / 3600000);

                curDiv.style.top = yStart + 'px';
                curDiv.style.height = (yEnd - yStart) + 'px';
                curDiv.style.width = hourDim.width + 'px';
            }

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

                    let curDiv = cd('div', {class: 'budget-holiday'}, cd('div', {class: 'holiday-text'}, aurora.messages.HOLIDAY.toString()));

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

