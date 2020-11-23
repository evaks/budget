goog.provide('budget.widgets.BusinessHours');


goog.require('aurora.db.schema.tables.base.user');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.dom.classlist');
goog.require('recoil.frp.logic');
goog.require('recoil.structs.table.Filter');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.columns.Expr');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');
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
    let highlightedB = frp.createB(/** @type {{add: ?boolean, start:?{x:number,y:number},stop:?{x:number,y:number}}} */({start: null, stop: null}));

    let pad = function(v, len) {
        let str = ('0'.repeat(len) + v);
        return str.substring(str.length - len);
    };


    let format = new Intl.DateTimeFormat(undefined , {
        weekday: 'short'
    });

    this.siteB_ = scope.getDb().get(siteT.key).debug("site");
    this.yAxis_ = cd('div', 'budget-calendar-hour-labels');
    this.highlightDiv_ = cd('div', 'budget-calendar-highlight');
    this.calendarDiv_ = cd(
        'div', {class: 'budget-calendar'}, this.yAxis_, this.highlightDiv_);
    goog.dom.setFocusableTabIndex(this.calendarDiv_, true);
    this.yAxis_.appendChild(cd('div', {class: 'budget-calendar-hour'}));
    for (let h = 0; h < 24; h++) {
        let hour = cd('div', {class: 'budget-calendar-hour'}, pad(h, 2) + ':00');
        this.yAxis_.appendChild(hour);
    }

    let calcPos = function(e) {

        let minY = me.days_[0].hours[0].getBoundingClientRect().top;
        let minX = me.days_[0].div.getBoundingClientRect().left;
        return {x: Math.max(0, e.clientX - minX), y: Math.max(e.clientY - minY)};
    };


    this.days_ = [];
    let dt = new Date(0, 0, 1, 0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
        let dayStart = new Date(dt.getTime() + 3600000 * 24 * (i + (dt.getDay() + 6) % 7));
        let day = cd('div', {class: 'budget-calendar-day'}, cd('div', 'budget-calendar-day-name', format.format(dayStart)));
        let hours = [];
        this.calendarDiv_.appendChild(day);

        for (let h = 0; h < 24; h++) {
            let hour = cd('div', {class: 'budget-calendar-hour' + (h == 23 ? ' budget-calendar-bottom' : '')});
            day.appendChild(hour);
            hours.push(hour);

        }
        this.days_.push({div: day, hours: hours});
    }


    this.loadingContainer_ = cd('div', {class: 'budget-loading'}, cd('div'));
    this.errorContainer_ = cd('div', {class: 'budget-error'}, 'Error');
    this.container_ = cd('div', {}, this.calendarDiv_, this.loadingContainer_, this.errorContainer_);
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
        let hourStartIndex = Math.max(0,Math.round(Math.floor(Math.min(highlighted.start.y, highlighted.stop.y) * 24 / height * hourRes) / hourRes * 3600000));
        let hourEndIndex = Math.round(Math.ceil(Math.max(highlighted.start.y, highlighted.stop.y) * 24 / height * hourRes) / hourRes * 3600000);


        highlightedB.set({start: null, stop: null , add: true});
        console.log('up day', dayStartIndex, '-', dayEndIndex, 'hour', hourStartIndex, '-', hourEndIndex);

        let dayUsage = me.createDayUsage_(site);
        for(let i = dayStartIndex; i < dayEndIndex; i++) {
            let idx = (i + 1) % 7;
            
            if(dayUsage[idx] === undefined) {
                dayUsage[idx] = [];
            }
            
            dayUsage[idx].push({start: hourStartIndex, stop: hourEndIndex});
            
        }
        
        me.siteB_.set(me.updateDayUsage_(site, dayUsage));
        
        console.log(dayUsage);
        
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
    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);
    this.highlightedB_ = highlightedB;
    this.helper_.attach(this.siteB_, highlightedB);
    let resizeObserver = new ResizeObserver(function(e) {
        me.helper_.forceUpdate();
    });
    resizeObserver.observe(this.calendarDiv_);
    
};

/**
 * @private
 * @param {?} dayUsage
 */
budget.widgets.BusinessHours.prototype.mergeDayUsage_ = function(dayUsage) {    
    let comparator = function(x, y) {
        let res = x.start - y.start;
        if (res) {
            return res;
        }
        return x.stop - y.stop;
    };

    // merge entries
    for (let k in dayUsage) {
        let entries = dayUsage[k];
        entries.sort(comparator);
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
        dayUsage[k] = newEntries;        
    }
};

/**
 * @private
 * @param {!recoil.structs.table.Table} site
 * @return {Object<Array<{start: number, stop: number}>>}
 */
budget.widgets.BusinessHours.prototype.createDayUsage_ = function(site) {
    let siteT = aurora.db.schema.tables.base.site;
    let regT = siteT.regular;
    let dayUsage = {};
    
    site.forEach(function(row) {
        let reg = row.get(siteT.cols.regular);
        reg.forEach(function(entry) {
            let day = entry[regT.cols.day.getName()];
            let entries = dayUsage[day] = dayUsage[day] || [];
            entries.push({start: entry.start, stop: entry.stop});
        });
    });
    
    this.mergeDayUsage_(dayUsage);
    return dayUsage;
};

/**
 * 
 * @private
 * @param {!recoil.structs.table.Table} site
 * @param {Object<Array<{start: number, stop: number}>>} dayUsage
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
        for (let dayIdx in dayUsage) {
            let day = dayUsage[dayIdx];
            for (let i = 0; i < day.length; i++) {
                let newEntry = {};
                if(reg[pos] !== undefined) {
                    newEntry = goog.object.clone(reg[pos++]);
                }
                else {
                    newEntry.id = regT.cols.id.getDefault();
                }
                newEntry.day =  dayIdx;
                newEntry.start =day[i].start;
                newEntry.stop= day[i].stop;
                entries.push(newEntry);
            }
            
        }

        row.set(siteT.cols.regular, entries);
        result.addRow(row);
    });
    
    return result.freeze();
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


        let dayUsage = this.createDayUsage_(site);

        for (let i = 0; i < 7; i++) {
            let lookupDay = (i + 1) % 7;
            let avail = dayUsage[lookupDay];
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
                curDiv.style.top =  yStart + 'px';
                curDiv.style.height =  (yEnd - yStart ) + 'px';
                curDiv.style.width = hourDim.width + 'px';
            }

        }

//        console.log('reg', dayUsage);

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

