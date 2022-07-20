goog.provide('budget.widgets.BusinessHours');

goog.require('aurora.Client');
goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableDialog');
goog.require('budget.appointments');
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
 * @param {number=} opt_clientId
 * @param {aurora.widgets.Chat=} opt_chat
 * @implements {recoil.ui.Widget}
 */
budget.widgets.BusinessHours = function(scope, opt_type, opt_clientId, opt_chat) {
    this.scope_ = scope;
    // types can be:
    //     admin - used to administer business hours and holidays
    //     mentor - used to set available hours for a mentor
    //     client - used to schedule and view appointments for a client

    this.type_ = opt_type || 'admin';
    this.clientId_ = opt_clientId;
    this.chat_ = opt_chat;
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let siteT = aurora.db.schema.tables.base.site;
    let holidaysT = aurora.db.schema.tables.base.site_holidays;
    let appointmentsT = aurora.db.schema.tables.base.secure_appts;
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let userT = aurora.db.schema.tables.base.user;
    this.contextB_ = aurora.permissions.getContext(scope);
    this.borderDimsB_ = frp.createB({x: 0, y: 0});
    let highlightedB = frp.createB(/** @type {{add: ?boolean, start:?{x:number,y:number},stop:?{x:number,y:number}}} */({start: null, stop: null}));
    this.highlightedB_ = highlightedB;

    let pad = function(v, len) {
        let str = ('0'.repeat(len) + v);
        return str.substring(str.length - len);
    };
    if (this.clientId_ != undefined) {
        let query = new recoil.db.Query();

        this.clientB_ = frp.liftB(function(tbl) {
            let res = null;
            tbl.forEach(function(row) {
                res = (row.get(userT.cols.firstName) || '') + ' ' + (row.get(userT.cols.lastName) || '') + ' (' + row.get(userT.cols.username) + ')';
            });
            return res.trim();
        }, scope.getDb().get(userT.key, query.eq(userT.cols.id, query.val(this.clientId_))));
    }
    else {
        this.clientB_ = frp.createB(null);
    }

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

    me.mentorsB_ = budget.widgets.UserManagement.getMentors(scope);
    this.timezoneWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.dateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.mentorWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    

    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
    let weekdayize = budget.widgets.BusinessHours.lastMonday;

    this.curDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(weekdayize()));
    this.dateWidget_.attachStruct({value: this.curDateB_, min: 19700105, step: 7});
    this.mentorWidget_.attachStruct({value: this.mentorB_, list: mentorListB, renderer: budget.widgets.UserManagement.getMentorRenderer(scope)});

    this.siteB_ = scope.getDb().get(siteT.key);

    this.timezoneB_ = frp.liftBI(function (site) {
        let res = null;
        site.forEach(function(row) {
            res = row.get(siteT.cols.timezone);
        });
        return res;
        
    }, function (tz) {
        let res = me.siteB_.get().createEmpty();
        me.siteB_.get().forEachModify(function (row) {
            row.set(siteT.cols.timezone, tz);
            res.addRow(row);
        });
        me.siteB_.set(res.freeze());
    }, this.siteB_);
    this.timezoneWidget_.attachStruct({value: this.timezoneB_, list : budget.widgets.BusinessHours.timeZoneNames});
    this.scheduleActionB_ = scope.getDb().get(aurora.db.schema.actions.base.schedule.add.key);
    this.unscheduleActionB_ = scope.getDb().get(aurora.db.schema.actions.base.schedule.remove.key);

    // do this because later on we will change so we can have multiple sites
    this.siteIdB_ = frp.liftB(function(site) {
        let res = null;
        site.forEach(function(row) {
            res = row.get(siteT.cols.id);
        });
        return res;
    }, this.siteB_);

    let isClient = this.type_ === 'client';
    this.hoursTblB_ = budget.Client.instance.createSubTableB(this.siteB_, frp.createB(
        /** @type {Array} */ (null)), siteT.cols.regular);

    let cls = budget.widgets.BusinessHours;

    this.holidaysB_ = frp.switchB(frp.liftB(function(date, timezone) {
        let query = new recoil.db.Query();
        let startTime = cls.convertDateToSite(
            recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime(),
            timezone,
            useSiteTime);

        let endTime = startTime + 7 * milliPerDay;

        return scope.getDb().get(holidaysT.key, query.and(
            query.gt(query.field(holidaysT.cols.stop), query.val(startTime)),
            query.lt(query.field(holidaysT.cols.start), query.val(endTime))
        ));

    }, this.curDateB_, this.timezoneB_));

    if (this.clientId_ != undefined) {
        let query = new recoil.db.Query();
        let userT = aurora.db.schema.tables.base.user;
        this.mentorIdB_ = frp.liftB(function(tbl) {
            let res = null;
            tbl.forEach(function(r) {
                let m = r.get(userT.cols.mentorid);
                res = m ? m.db : null;
            });
            return res;
        }, scope.getDb().get(userT.key, query.eq(query.field(userT.cols.id), query.val(this.clientId_))));
    }
    else {
        this.mentorIdB_ = frp.createB(null);
    }

    this.availableB_ = frp.switchB(frp.liftB(function(date, mentor, timezone) {
        let query = new recoil.db.Query();
        let startTime =
            cls.convertDateToSite(
                recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime(),
                timezone,
                useSiteTime);

        let endTime = startTime + 7 * milliPerDay;
        let rangeQuery = query.and(
            query.or(
                query.gt(query.field(availT.cols.stop), query.val(startTime)),
                query.null(query.field(availT.cols.stop))),
            query.lt(query.field(availT.cols.start), query.val(endTime)));
        if (isClient) {
            return scope.getDb().get(availT.key, rangeQuery);
        }

        return scope.getDb().get(availT.key, query.and(rangeQuery,
            query.eq(availT.cols.mentorid, query.val(me.mentorB_.get())),

        ));

    }, this.curDateB_, this.mentorB_, this.timezoneB_));

    this.appointmentsB_ = frp.switchB(frp.liftB(function(date, timezone) {
        let query = new recoil.db.Query();
        let startTime = cls.convertDateToSite(
            recoil.ui.widgets.DateWidget2.convertLocaleDate(date).getTime(),
            timezone, useSiteTime);

        let endTime = startTime + 7 * milliPerDay;

        return scope.getDb().get(appointmentsT.key, query.and(
            query.gt(query.field(appointmentsT.cols.stop), query.val(startTime)),
            query.lt(query.field(appointmentsT.cols.start), query.val(endTime))
        ));

    }, this.curDateB_));



    this.yAxis_ = cd('div', 'budget-calendar-hour-labels');
    this.highlightDiv_ = cd('div', 'budget-calendar-highlight');
    this.calendarDiv_ = cd('div', {class: 'budget-calendar goog-menu-noicon goog-menu-noaccel'}, this.yAxis_, this.highlightDiv_);

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

    let holidaysLegend =
        cd('div', {class: 'legend-item'},
           cd('div', {class: 'legend-key holidays'}),
           cd('div', {class: 'legend-name'}, mess.HOLIDAY.toString()));

    let hoursLegend =
        cd('div', {class: 'legend-item'},
           cd('div', {class: 'legend-key hours'}),
           cd('div', {class: 'legend-name'}, mess.OFFICE_HOURS.toString()));

    let availableLegend =
        cd('div', {class: 'legend-item'},
           cd('div', {class: 'legend-key mentor-avail'}),
           cd('div', {class: 'legend-name'}, mess.FREE_SESSION.toString()));

    let yourAvailableLegend =
        cd('div', {class: 'legend-item'},
           cd('div', {class: 'legend-key your-mentor-avail'}),
           cd('div', {class: 'legend-name'}, mess.YOUR_MENTOR.toString()));

    let appointmentLegend
        = cd('div', {class: 'legend-item'},
             cd('div', {class: 'legend-key mentor-appoint'}),
             cd('div', {class: 'legend-name'}, mess.APPOINTMENT.toString()));

    this.legendDiv_ = cd('div', {class: 'budget-legend'}, holidaysLegend, hoursLegend);

    if (this.type_ == 'mentor' || this.type_ == 'client') {
        this.legendDiv_.appendChild(availableLegend);
    }
    if (this.clientId_ != undefined) {
        this.legendDiv_.appendChild(yourAvailableLegend);
    }
    if (this.type_ === 'client' && this.clientId_ != undefined) {
        this.legendDiv_.appendChild(appointmentLegend);
    }

    let dateDiv = cd('div', 'budget-date');
    let timezoneDiv = cd('div', 'budget-cal-timezone');
    let mentorDiv = cd('div', 'budget-cal-mentor goog-inline-block');
    this.mentorDiv_ = cd('div', {}, cd('div', {class: 'budget-calendar-mentor-label'}, mess.MENTOR.toString()), mentorDiv);
    this.dateWidget_.getComponent().render(dateDiv);
    this.timezoneWidget_.getComponent().render(timezoneDiv);
    this.mentorWidget_.getComponent().render(mentorDiv);
    const useSiteTime = this.type_ === 'admin';
    goog.style.setElementShown(timezoneDiv, useSiteTime);
    this.calendarHeader_ = cd('div', {class: 'budget-calendar-header'}, dateDiv, timezoneDiv, this.mentorDiv_, this.legendDiv_);
//    this.dateWidget_.getComponent().render(this.calendarHeader_);

    this.yourAvailableLegend_ = yourAvailableLegend;
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

    this.selHelper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);

    this.highlightedB_ = highlightedB;
    this.contentSizeB_ = contentSizeB;
    this.attachHelper_(null);
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
 * @param {number} time milli since epoch
 * @param {string} timezone 
 * @return {number}
 */
budget.widgets.BusinessHours.getDayOffset = function (time, timezone) {

    let d = new Date(time);

    let getItem = function (format) {
        let opts = {};
        if (timezone) {
            opts.timeZone = timezone;
        }
        goog.object.extend(opts, format);
        let res = parseInt(d.toLocaleString(
            'en-NZ', opts));
        if (opts.hour12 != undefined) {
            res = res % 24;
        }
        return res;
    };
    return ((getItem({hour:'numeric' ,hour12: false}) * 60 + getItem({minute: 'numeric'})) * 60 + getItem({second: 'numeric'})) * 1000 + d.getMilliseconds();
};

/**
 * @param {number} time milli since epoch
 * @param {?string} timezone 
 * @param {boolean} doAdjustment if false returns zero
 * @return {number}
 */
budget.widgets.BusinessHours.getTZAdjustment = function (time, timezone, doAdjustment) {
    if (!doAdjustment || !timezone) {
        return 0;
    }
    let d = new Date(time);
    let milli = d.getMilliseconds();
    d.setMilliseconds(0);
    
    let getItem = function (format) {
        let opts = {timeZone: timezone};
        goog.object.extend(opts, format);
        let res = parseInt(d.toLocaleString(
            'en-NZ', opts));
        if (opts.hour12 != undefined) {
            res = res % 24;
        }
        return res;
    };
    let wrongSiteDate = new Date(
        getItem({year: 'numeric'}),
        getItem({month: 'numeric'}) - 1, // months are zero based
        getItem({day: 'numeric'}),
        getItem({hour:'numeric' ,hour12: false}),
        getItem({minute: 'numeric'}),
        getItem({second: 'numeric'}));
    
    return d.getTime() - wrongSiteDate.getTime();
};

/**
 * @param {number} time milli since epoch
 * @param {string} timezone 
 * @param {boolean} useSiteTime if false returns zero
 * @return {number}
 */

budget.widgets.BusinessHours.convertDateToSite = function (time, timezone, useSiteTime) {
    return time + budget.widgets.BusinessHours.getTZAdjustment(time, timezone, useSiteTime);
};



/**
 * @param {number} time milli since epoch
 * @param {string} timezone 
 * @return {number}
 */

budget.widgets.BusinessHours.convertSiteToDate = function (time, timezone) {
    return time - budget.widgets.BusinessHours.getTZAdjustment(time, timezone, true);
};

/**
 * @final
 */
budget.widgets.BusinessHours.timeZoneNames = (function () { return [
  'Europe/Andorra',
  'Asia/Dubai',
  'Asia/Kabul',
  'Europe/Tirane',
  'Asia/Yerevan',
  'Antarctica/Casey',
  'Antarctica/Davis',
  //'Antarctica/DumontDUrville', // https://bugs.chromium.org/p/chromium/issues/detail?id=928068
  'Antarctica/Mawson',
  'Antarctica/Palmer',
  'Antarctica/Rothera',
  'Antarctica/Syowa',
  'Antarctica/Troll',
  'Antarctica/Vostok',
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Salta',
  'America/Argentina/Jujuy',
  'America/Argentina/Tucuman',
  'America/Argentina/Catamarca',
  'America/Argentina/La_Rioja',
  'America/Argentina/San_Juan',
  'America/Argentina/Mendoza',
  'America/Argentina/San_Luis',
  'America/Argentina/Rio_Gallegos',
  'America/Argentina/Ushuaia',
  'Pacific/Pago_Pago',
  'Europe/Vienna',
  'Australia/Lord_Howe',
  'Antarctica/Macquarie',
  'Australia/Hobart',
  'Australia/Currie',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Australia/Broken_Hill',
  'Australia/Brisbane',
  'Australia/Lindeman',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Australia/Perth',
  'Australia/Eucla',
  'Asia/Baku',
  'America/Barbados',
  'Asia/Dhaka',
  'Europe/Brussels',
  'Europe/Sofia',
  'Atlantic/Bermuda',
  'Asia/Brunei',
  'America/La_Paz',
  'America/Noronha',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Araguaina',
  'America/Maceio',
  'America/Bahia',
  'America/Sao_Paulo',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Santarem',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Manaus',
  'America/Eirunepe',
  'America/Rio_Branco',
  'America/Nassau',
  'Asia/Thimphu',
  'Europe/Minsk',
  'America/Belize',
  'America/St_Johns',
  'America/Halifax',
  'America/Glace_Bay',
  'America/Moncton',
  'America/Goose_Bay',
  'America/Blanc-Sablon',
  'America/Toronto',
  'America/Nipigon',
  'America/Thunder_Bay',
  'America/Iqaluit',
  'America/Pangnirtung',
  'America/Atikokan',
  'America/Winnipeg',
  'America/Rainy_River',
  'America/Resolute',
  'America/Rankin_Inlet',
  'America/Regina',
  'America/Swift_Current',
  'America/Edmonton',
  'America/Cambridge_Bay',
  'America/Yellowknife',
  'America/Inuvik',
  'America/Creston',
  'America/Dawson_Creek',
  'America/Fort_Nelson',
  'America/Vancouver',
  'America/Whitehorse',
  'America/Dawson',
  'Indian/Cocos',
  'Europe/Zurich',
  'Africa/Abidjan',
  'Pacific/Rarotonga',
  'America/Santiago',
  'America/Punta_Arenas',
  'Pacific/Easter',
  'Asia/Shanghai',
  'Asia/Urumqi',
  'America/Bogota',
  'America/Costa_Rica',
  'America/Havana',
  'Atlantic/Cape_Verde',
  'America/Curacao',
  'Indian/Christmas',
  'Asia/Nicosia',
  'Asia/Famagusta',
  'Europe/Prague',
  'Europe/Berlin',
  'Europe/Copenhagen',
  'America/Santo_Domingo',
  'Africa/Algiers',
  'America/Guayaquil',
  'Pacific/Galapagos',
  'Europe/Tallinn',
  'Africa/Cairo',
  'Africa/El_Aaiun',
  'Europe/Madrid',
  'Africa/Ceuta',
  'Atlantic/Canary',
  'Europe/Helsinki',
  'Pacific/Fiji',
  'Atlantic/Stanley',
  'Pacific/Chuuk',
  'Pacific/Pohnpei',
  'Pacific/Kosrae',
  'Atlantic/Faroe',
  'Europe/Paris',
  'Europe/London',
  'Asia/Tbilisi',
  'America/Cayenne',
  'Africa/Accra',
  'Europe/Gibraltar',
  'America/Godthab',
  'America/Danmarkshavn',
  'America/Scoresbysund',
  'America/Thule',
  'Europe/Athens',
  'Atlantic/South_Georgia',
  'America/Guatemala',
  'Pacific/Guam',
  'Africa/Bissau',
  'America/Guyana',
  'Asia/Hong_Kong',
  'America/Tegucigalpa',
  'America/Port-au-Prince',
  'Europe/Budapest',
  'Asia/Jakarta',
  'Asia/Pontianak',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Europe/Dublin',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Indian/Chagos',
  'Asia/Baghdad',
  'Asia/Tehran',
  'Atlantic/Reykjavik',
  'Europe/Rome',
  'America/Jamaica',
  'Asia/Amman',
  'Asia/Tokyo',
  'Africa/Nairobi',
  'Asia/Bishkek',
  'Pacific/Tarawa',
  'Pacific/Enderbury',
  'Pacific/Kiritimati',
  'Asia/Pyongyang',
  'Asia/Seoul',
  'Asia/Almaty',
  'Asia/Qyzylorda',
  //'Asia/Qostanay', // https://bugs.chromium.org/p/chromium/issues/detail?id=928068
  'Asia/Aqtobe',
  'Asia/Aqtau',
  'Asia/Atyrau',
  'Asia/Oral',
  'Asia/Beirut',
  'Asia/Colombo',
  'Africa/Monrovia',
  'Europe/Vilnius',
  'Europe/Luxembourg',
  'Europe/Riga',
  'Africa/Tripoli',
  'Africa/Casablanca',
  'Europe/Monaco',
  'Europe/Chisinau',
  'Pacific/Majuro',
  'Pacific/Kwajalein',
  'Asia/Yangon',
  'Asia/Ulaanbaatar',
  'Asia/Hovd',
  'Asia/Choibalsan',
  'Asia/Macau',
  'America/Martinique',
  'Europe/Malta',
  'Indian/Mauritius',
  'Indian/Maldives',
  'America/Mexico_City',
  'America/Cancun',
  'America/Merida',
  'America/Monterrey',
  'America/Matamoros',
  'America/Mazatlan',
  'America/Chihuahua',
  'America/Ojinaga',
  'America/Hermosillo',
  'America/Tijuana',
  'America/Bahia_Banderas',
  'Asia/Kuala_Lumpur',
  'Asia/Kuching',
  'Africa/Maputo',
  'Africa/Windhoek',
  'Pacific/Noumea',
  'Pacific/Norfolk',
  'Africa/Lagos',
  'America/Managua',
  'Europe/Amsterdam',
  'Europe/Oslo',
  'Asia/Kathmandu',
  'Pacific/Nauru',
  'Pacific/Niue',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'America/Panama',
  'America/Lima',
  'Pacific/Tahiti',
  'Pacific/Marquesas',
  'Pacific/Gambier',
  'Pacific/Port_Moresby',
  'Pacific/Bougainville',
  'Asia/Manila',
  'Asia/Karachi',
  'Europe/Warsaw',
  'America/Miquelon',
  'Pacific/Pitcairn',
  'America/Puerto_Rico',
  'Asia/Gaza',
  'Asia/Hebron',
  'Europe/Lisbon',
  'Atlantic/Madeira',
  'Atlantic/Azores',
  'Pacific/Palau',
  'America/Asuncion',
  'Asia/Qatar',
  'Indian/Reunion',
  'Europe/Bucharest',
  'Europe/Belgrade',
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Simferopol',
  'Europe/Kirov',
  'Europe/Astrakhan',
  'Europe/Volgograd',
  'Europe/Saratov',
  'Europe/Ulyanovsk',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Novosibirsk',
  'Asia/Barnaul',
  'Asia/Tomsk',
  'Asia/Novokuznetsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Chita',
  'Asia/Yakutsk',
  'Asia/Khandyga',
  'Asia/Vladivostok',
  'Asia/Ust-Nera',
  'Asia/Magadan',
  'Asia/Sakhalin',
  'Asia/Srednekolymsk',
  'Asia/Kamchatka',
  'Asia/Anadyr',
  'Asia/Riyadh',
  'Pacific/Guadalcanal',
  'Indian/Mahe',
  'Africa/Khartoum',
  'Europe/Stockholm',
  'Asia/Singapore',
  'America/Paramaribo',
  'Africa/Juba',
  'Africa/Sao_Tome',
  'America/El_Salvador',
  'Asia/Damascus',
  'America/Grand_Turk',
  'Africa/Ndjamena',
  'Indian/Kerguelen',
  'Asia/Bangkok',
  'Asia/Dushanbe',
  'Pacific/Fakaofo',
  'Asia/Dili',
  'Asia/Ashgabat',
  'Africa/Tunis',
  'Pacific/Tongatapu',
  'Europe/Istanbul',
  'America/Port_of_Spain',
  'Pacific/Funafuti',
  'Asia/Taipei',
  'Europe/Kiev',
  'Europe/Uzhgorod',
  'Europe/Zaporozhye',
  'Pacific/Wake',
  'America/New_York',
  'America/Detroit',
  'America/Kentucky/Louisville',
  'America/Kentucky/Monticello',
  'America/Indiana/Indianapolis',
  'America/Indiana/Vincennes',
  'America/Indiana/Winamac',
  'America/Indiana/Marengo',
  'America/Indiana/Petersburg',
  'America/Indiana/Vevay',
  'America/Chicago',
  'America/Indiana/Tell_City',
  'America/Indiana/Knox',
  'America/Menominee',
  'America/North_Dakota/Center',
  'America/North_Dakota/New_Salem',
  'America/North_Dakota/Beulah',
  'America/Denver',
  'America/Boise',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Juneau',
  'America/Sitka',
  'America/Metlakatla',
  'America/Yakutat',
  'America/Nome',
  'America/Adak',
  'Pacific/Honolulu',
  'America/Montevideo',
  'Asia/Samarkand',
  'Asia/Tashkent',
  'America/Caracas',
  'Asia/Ho_Chi_Minh',
  'Pacific/Efate',
  'Pacific/Wallis',
  'Pacific/Apia',
    'Africa/Johannesburg'].sort();})();


/**
 * @param {Date=} opt_date if provided will use this date instead of today
 * @return {Date}
 */
budget.widgets.BusinessHours.lastMonday = function(opt_date) {
    let today = opt_date || new Date();
    let monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7);
    return monday;
};

/**
 * @typedef {{dayIndex:number, hourIndex:number, clickPosMilli:number, clickPosTime:number}}
 */
budget.widgets.BusinessHours.MenuInfo;

/**
 * @return {!recoil.frp.Behaviour<number>}
 */
budget.widgets.BusinessHours.prototype.getStartDateB = function() {
    return this.curDateB_;
};

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
            if (!aurora.permissions.has('site-management')(me.contextB_.get())) {
                return;
            }
            
            if (!isLeftPressed(e)) {
                return;
            }
            let pos = me.calcPos_(e);
            highlightedB.set({start: pos, stop: pos, add: !e.ctrlKey });
        

    }, highlightedB, this.contextB_));


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
        let selDate = budget.widgets.BusinessHours.convertDateToSite(me.getSelectionDate_(menuInfo, me.curDateB_.get()), me.timezoneB_.get(), true);
        let holidayUsage = me.createHolidayUsage_(holidays);

        let selectedStopTime = selDate + budget.widgets.BusinessHours.MILLI_PER_DAY;

        let res = me.removeDateRange_(holidayUsage, selDate, selectedStopTime);
        me.holidaysB_.set(me.updateHolidayUsage_(me.siteB_.get(), holidays, res));
    }, this.siteB_, this.curDateB_, this.holidaysB_, this.timezoneB_);

};



/**
 * returns a function that will remove a holiday
 * @private
 * @param {!budget.widgets.BusinessHours.MenuInfo} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doUnscheduleAppointmentFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let HOUR_RES = budget.widgets.BusinessHours.HOUR_RES;
    let scope = me.scope_;
    return frp.accessTransFunc(function(e) {
        let selDate = me.getSelectionDate_(menuInfo, me.curDateB_.get());
        let appointments = me.createAppointments_(true);

        let when = menuInfo.clickPosTime;
        let found = null;
        for (let i = 0; i < appointments.length; i++) {
            let entry = appointments[i];

            if (entry.start <= when && entry.stop >= when) {
                found = entry.id;
            }
        }
        let selectedStopTime = selDate + budget.widgets.BusinessHours.MILLI_PER_DAY;
        if (found !== null) {
            me.unscheduleActionB_.set({action: {
                id: found
            }});
        }

    }, this.siteB_, this.curDateB_, this.appointmentsB_, this.unscheduleActionB_);

};

/**
 * returns a function that will remove a holiday
 * @private
 * @param {!budget.widgets.BusinessHours.MenuInfo} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.showScheduleAppointmentDialog_ = function(menuInfo) {

};

/**
 * @typedef {{ranges:!Array<{start:number, stop: number}>,
 *       lengths:!Array<number>,
 *       mentor:number}}
 */
budget.widgets.BusinessHours.AvailSlot;


/**
 * returns a function that will remove a holiday
 * @private
 * @param {number} when when did the user click
 * @param {!recoil.structs.table.Table} avail
 * @param {!Array<{start: number,stop: number,mentorid:number}>} appointments
 * @return {!Array<!budget.widgets.BusinessHours.AvailSlot>}
 */
budget.widgets.BusinessHours.getAvailableSlots_ = function(when, avail, appointments) {
    let ORIG_MENTOR = budget.widgets.BusinessHours.ORIG_MENTOR;
    let time = new Date(when);
    let start = new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
    let stop = new Date(time.getFullYear(), time.getMonth(), time.getDate() + 1).getTime();
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    // we have to remove existing appointments
    let mentorTimes = {};
    let mentorLengths = {};
    let mentorAppointments = {};
    avail.forEach(function(row) {
        // appointmentLen in minutes
        let len = row.get(availT.cols.appointmentLen) * 60000;
        budget.widgets.BusinessHours.iterateOverPeriod(
            row, start, stop,
            function(start, stop, mentorid) {
                recoil.util.map.safeGet(mentorTimes, mentorid, []).push({start: start, stop: stop});
                recoil.util.map.safeGet(mentorLengths, mentorid, []).push(len);
            });
    });
    appointments.forEach(function(appt) {
        recoil.util.map.safeGet(mentorAppointments, appt.mentorid, []).push(appt);
    });

    let res = [];

    for (let mentorStr in mentorTimes) {
        let mentor = BigInt(mentorStr);
        budget.appointments.mergeDayUsage(mentorTimes[mentor], true);
        // remove existing appointments with mentor

        mentorTimes[mentor] = budget.widgets.BusinessHours.removeAllOverlaps(
            mentorTimes[mentor],
            mentorAppointments[mentor] || []);


        let times = mentorTimes[mentor];
        if (times.length === 0) {
            continue;
        }
        let seen = {};
        let lengths = mentorLengths[mentor].filter(len => {
            let res = !seen[len];
            seen[len] = true;
            return res;
        }).sort((x,y) => x - y);

        let item = {
            mentor, lengths, ranges: []};
        
        times.forEach(function (entry) {
            item.ranges.push({start: entry.start, stop: entry.stop, mentor, lengths});
        });
        res.push(item);
    }
    return res;
    
};
/**
 * @private
 */
budget.widgets.BusinessHours.ORIG_MENTOR = new recoil.structs.table.ColumnKey('orig-mentor');
/** 
 * @param {number} when when the user clicked
 * @param {!recoil.structs.table.Table} avail
 * @return {{slots:!Array<!budget.widgets.BusinessHours.AvailSlot>, 
 *           mentors:!Array<number>,
 *           setupEntryRow:function(budget.widgets.BusinessHours.AvailSlot, recoil.structs.table.MutableTableRow, number),
 *           setupRow:function(number,recoil.structs.table.MutableTableRow,number),
*            getMentorInfo:function(number):{start:number, stop:number, len: number, ranges:!Array<{start: number,stop:number}>}
 * }}
 */
budget.widgets.BusinessHours.prototype.createScheduleHelper_ = function(when, avail) {
    let apptsC = aurora.db.schema.tables.base.secure_appts.cols;
    let ORIG_MENTOR = budget.widgets.BusinessHours.ORIG_MENTOR;
    let slots = budget.widgets.BusinessHours.getAvailableSlots_(
        when, avail,
        /** @type {!Array<{mentorid: number, start: number, stop: number}>} */(this.createAppointments_(false)));
    
    let minFunc = (a, v) => a === null ? v : Math.min(a, v);
    let maxFunc = (a, v) => a === null ? v : Math.max(a, v);
    let setupEntryRow = function (entry, row, when) {
        let ranges = entry ? entry.ranges : [];
        let lengths = entry ? entry.lengths : [];
            row.set(apptsC.mentorid, entry ? entry.mentor : null);
        row.set(ORIG_MENTOR, row.get(apptsC.mentorid));
        let start = ranges.map(x => x.start).reduce(minFunc, null) || 0;
        let len = lengths.reduce(minFunc, null) || 0;
        if (when !== null) {
            ranges.forEach(function (r) {
                if (r.start <= when && when <= r.stop) {
                    start = Math.max(Math.floor((when - r.start) /len) * len + r.start, r.start);
                }
            });
                               
        }
        row.set(apptsC.start, start);
        row.set(apptsC.stop, start + len);
        row.set(apptsC.mentorid, entry ? entry.mentor : null);
    };


    let getMentorInfo = function (mentorid) {
        let found = null;
        slots.forEach(function (entry) {
            if (entry.mentor === mentorid) {
                found = entry;
            }
        });
        if (found) {
            return {
                start: found.ranges.map(x=>x.start).reduce(minFunc, null),
                stop: found.ranges.map(x=>x.stop).reduce(maxFunc, null),
                len: found.lengths.reduce(minFunc, null),
                ranges: found.ranges
            };
            
        }
        return {
            start: 0, stop: 0, len: 0, ranges: []
        };
        
    };
    let setupRow = function (mentorid, row, when) {
        let found = false;
        slots.forEach(function (entry) {
            if (entry.mentor === mentorid) {
                setupEntryRow(entry, row, when);
                found = true;
            }
        });
        return found;
    };
    let mentors = slots.map(x => x.mentor);

    return {slots, mentors, setupEntryRow, setupRow, getMentorInfo};
};

/**
 * @return {function():boolean}
 */
budget.widgets.BusinessHours.prototype.loggedIn_ = function() {
    let me = this;
    return function() {
        let context = me.scope_.getFrp().accessTrans(function() {
            return me.contextB_.get();
        }, me.contextB_);
        return context !== null && aurora.permissions.loggedIn(true)(context);
    };
};
/**
 * returns a function that will remove a holiday
 * @private
 * @param {!budget.widgets.BusinessHours.MenuInfo} menuInfo
 * @return {function(?)}
 */
budget.widgets.BusinessHours.prototype.doScheduleAppointmentFunc_ = function(menuInfo) {
    let me = this;
    let frp = me.scope_.getFrp();
    let HOUR_RES = budget.widgets.BusinessHours.HOUR_RES;
    let scope = me.scope_;
    let ORIG_MENTOR = budget.widgets.BusinessHours.ORIG_MENTOR;
    let apptsC = aurora.db.schema.tables.base.secure_appts.cols;
    let FREE_COL = new recoil.structs.table.ColumnKey('orig-mentor');
    let cd = goog.dom.createDom;

    let freeCol = new recoil.ui.widgets.table.LabelColumn(FREE_COL, 'Available', {
        formatter: function (v) {
            return cd.apply(null, ['div', {}].concat(v.map(x => cd('div', {}, x))));
        }});
    return frp.accessTransFunc(function(e) {
        let selDate = me.getSelectionDate_(menuInfo, me.curDateB_.get());
        let mentorC = aurora.db.schema.tables.base.mentor.cols;

        if (me.clientId_ == null) {
            // maybe take user to signup screen
            if (!me.loggedIn_()()) {
                window.location = "/account/signup";
            }
            return;
        }
        
        let when = menuInfo.clickPosTime;
        let dayStartTime = new Date(when).setHours(0,0,0,0);
        
        let newAppointments = me.appointmentsB_.get().createEmpty([],[ORIG_MENTOR]);
        let toTime = function (absolute) {
            let d = new Date(absolute);
            return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
        };
        let toAbsolute = function (rel) {
            let remaining = rel;
            let div = function (divisor) {
                let res = remaining % divisor;
                remaining = Math.floor(remaining/divisor);
                return res;
            };
            let milli = div(1000);
            let sec = div(60);
            let min = div(60);
            let hour = remaining;
            return new Date(dayStartTime).setHours(hour, min, sec, milli);
        };
        let helper = me.createScheduleHelper_(when, me.availableB_.get());
        {
            let row = new recoil.structs.table.MutableTableRow();
            row.set(apptsC.userid, me.clientId_);
            helper.setupEntryRow(helper.slots[0], row, when);
        // override with user mentor if we can
            let mentorid = me.mentorIdB_.get();
            helper.setupRow(mentorid, row, when);
            newAppointments.addRow(row);
        }
            
            



        

        
        // set the default row to be our mentor if they exist
        
        let newAppointmentsB = frp.createB(newAppointments.freeze());
        
        let validatedTableB = frp.liftBI(function(tbl, mentorsTbl) {
            let mentorList = [];
            let helper = me.createScheduleHelper_(when, me.availableB_.get());
            mentorsTbl.forEach(function (row) {
                mentorList.push({name:me.getMentorDisplayName(row), val: row.get(mentorC.id).db});
            });

            
            let res = tbl.createEmpty([], [FREE_COL]);
            res.addColumnMeta(apptsC.start, {editable: true});
            res.addColumnMeta(apptsC.stop, {editable: true});
            res.addColumnMeta(FREE_COL, {editable: false});
            
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.addColumn(new recoil.ui.widgets.table.SelectColumn(apptsC.mentorid, 'Mentor', helper.mentors));
            columns.addColumn(freeCol);
            columns.addColumn(new recoil.ui.columns.Time(apptsC.start, 'Start'));
            columns.addColumn(new recoil.ui.columns.Time(apptsC.stop, 'Finish'));
            
            res.addColumnMeta(apptsC.mentorid, {renderer: new recoil.ui.renderers.ListRenderer(mentorList)});
            let mess = budget.messages;
            tbl.forEachModify(function(mrow) {
                let startAbs = mrow.get(apptsC.start);
                let stopAbs = mrow.get(apptsC.stop);
                let startV = toTime(mrow.get(apptsC.start));
                let stopV = toTime(mrow.get(apptsC.stop));

                res.addColumnMeta(apptsC.start, {editable: true});
                res.addColumnMeta(apptsC.stop, {editable: true});
                let mInfo = helper.getMentorInfo(mrow.get(apptsC.mentorid));
                let minTime = toTime(mInfo.start);
                let maxTime = toTime(mInfo.stop);
                
                let startErrors = [];
                let stopErrors = [];
                let validSlots = mInfo.ranges.filter(r => r.start <= startAbs && stopAbs <= r.stop);
                if (mrow.get(apptsC.stop) < new Date().getTime()) {
                    stopErrors.push(mess.APPOINTMENT_IN_PAST);
                }
                else if (startV > stopV) {
                    stopErrors.push(mess.FINISH_DATE_CANNOT_BE_BEFORE_START_DATE);
                }
                else if (startV < minTime) {
                    startErrors.push(mess.MENTOR_NOT_FREE_AT_THAT_TIME);
                }
                else if (stopV > maxTime) {
                    stopErrors.push(mess.MENTOR_NOT_FREE_AT_THAT_TIME);
                }
                else if (stopV - startV < mInfo.len) {
                    stopErrors.push(mess.APPOINTMENT_NOT_LONG_ENOUGH);
                } else if (validSlots.length == 0) {
                    stopErrors.push(mess.MENTOR_NOT_FREE_AT_THAT_TIME);
                }
                
                mrow.addCellMeta(apptsC.start, {
                    min: minTime,
                    max: maxTime - mInfo.len,
                    errors: startErrors
                });
                mrow.addCellMeta(apptsC.stop, {
                    min: minTime + mInfo.len,
                    max: maxTime,
                    errors: stopErrors
                });
                mrow.set(FREE_COL, mInfo.ranges.map(
                    r => new Date(r.start).toLocaleTimeString() + ' to '
                        + new Date(r.stop).toLocaleTimeString()));
                mrow.set(ORIG_MENTOR, mrow.get(apptsC.mentorid));
                mrow.set(apptsC.start, startV);
                mrow.set(apptsC.stop, stopV);
                res.addRow(mrow);
            });
            return columns.applyMeta(res);
        }, function (v) {
            let res = newAppointmentsB.get().createEmpty();
            let helper = me.createScheduleHelper_(when, me.availableB_.get());
            v.forEachModify(function (mrow) {
                let absStart = toAbsolute(mrow.get(apptsC.start));
                if (mrow.get(ORIG_MENTOR) != mrow.get(apptsC.mentorid)) {
                    if (helper.setupRow(mrow.get(apptsC.mentorid), mrow, absStart)) {
                        // time is now in absolute
                        res.addRow(mrow);
                        return;
                    }
                }
                mrow.set(apptsC.start, absStart);
                mrow.set(apptsC.stop, toAbsolute(mrow.get(apptsC.stop)));
                res.addRow(mrow);
            });
            
            newAppointmentsB.set(res.freeze());
        }, newAppointmentsB, me.mentorsB_, me.mentorIdB_, me.availableB_, me.appointmentsB_);
            
        var td = new aurora.widgets.TableDialog(scope, validatedTableB, frp.createCallback(function(e) {
            newAppointmentsB.get().forEach(function (row) {
                
                me.scheduleActionB_.set({action: {
                    mentorid: row.get(apptsC.mentorid),
                    userid: row.get(apptsC.userid),
                    start: row.get(apptsC.start),
                    stop: row.get(apptsC.stop)
                    
                }});
            });
                                          
        }, me.scheduleActionB_, newAppointmentsB), 'Schedule', function() {return null;}, 'Schedule Appointent', undefined, {blockErrors: true});
        td.show(true);
    }, this.siteB_, this.curDateB_, this.appointmentsB_, this.scheduleActionB_, me.availableB_, me.mentorIdB_);

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
        let selectDate = budget.widgets.BusinessHours.convertDateToSite(me.getSelectionDate_(menuInfo, me.curDateB_.get()), me.timezoneB_.get(), true);
        // might be wrong when we have daylight savings not sure how to deal with this if we are not in the
        // timezone of the site
        
        holidays.push({start: selectDate, stop: selectDate + milliPerDay});
        me.mergeDayUsage_(holidays, true);
        me.holidaysB_.set(me.updateHolidayUsage_(site, hols, holidays));

    }, this.siteB_, this.curDateB_, this.holidaysB_, this.timezoneB_);
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
    const cls = budget.widgets.BusinessHours;

    let td = new aurora.widgets.TableDialog(scope, modTableB, frp.createCallback(function(e) {
        let res = me.holidaysB_.get().unfreeze();
        let modTable = modTableB.get();

        modTable.forEach(function(row) {
            let origStartTime = cls.convertDateToSite(recoil.ui.widgets.DateWidget2.convertLocaleDate(start).getTime(), me.timezoneB_.get(), true);
            let origStopTime = cls.convertDateToSite(recoil.ui.widgets.DateWidget2.convertLocaleDate(stop).getTime(), me.timezoneB_.get(), true);
            let modStartTime = cls.convertDateToSite(recoil.ui.widgets.DateWidget2.convertLocaleDate(row.get(holidaysT.cols.start)).getTime(), me.timezoneB_.get(), true);
            let modStopTime = cls.convertDateToSite(recoil.ui.widgets.DateWidget2.convertLocaleDate(row.get(holidaysT.cols.stop)).getTime(), me.timezoneB_.get(), true);
            //            let millisPerDay = + 3600000 * 24;
            let millisPerDay = 3600000 * 24;


            if (selectedIndex !== null && (modStopTime < origStopTime || modStartTime > origStartTime)) {

                holidayUsage.splice(selectedIndex, 1);
            }
            holidayUsage.push({start: modStartTime, stop: modStopTime + millisPerDay});
        });

        me.mergeDayUsage_(holidayUsage, true);
        me.holidaysB_.set(me.updateHolidayUsage_(site, hols, holidayUsage));

    }, modTableB, me.siteB_, me.holidaysB_, me.timezoneB_), title, function() {return null;}, title);
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

    let td = new aurora.widgets.TableDialog(scope, modTableB, callbackB, title, function() {return null;}, title, undefined, {blockErrors: true});
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
        let endTime = budget.widgets.BusinessHours.addDays(startTime, 7);
        let when = menuInfo.clickPosTime;
        let res = avail.createEmpty();
        avail.forEach(function(row) {

            let found = null;
            budget.widgets.BusinessHours.iterateOverPeriod(row, startTime, endTime, function(start, stop) {
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
 * @param {!recoil.structs.table.TableRowInterface} row
 * @return {string} 
 */
budget.widgets.BusinessHours.prototype.getMentorDisplayName = function(row) {
    let mentorC = aurora.db.schema.tables.base.mentor.cols;
    return row.get(mentorC.firstName) || row.get(mentorC.username) || '';
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
        row.set(tblKeys.appointmentLen, 60);
        row.set(tblKeys.len, stopTime);
        row.set(tblKeys.stop, null);

        tbl.addRow(row);
        let modTableB = frp.createB(tbl.freeze());
        let validTableB = frp.liftBI(function(tbl) {
            let res = tbl.createEmpty();
            let columns = new recoil.ui.widgets.TableMetaData();
            columns.addColumn(new recoil.ui.columns.Time(availT.cols.start, budget.messages.START_DATE.toString()));
            columns.addColumn(new recoil.ui.columns.Time(availT.cols.len, budget.messages.STOP_DATE.toString()));
            columns.addColumn(new recoil.ui.widgets.table.NumberColumn(availT.cols.appointmentLen, budget.messages.APPOINTMENT_LENGTH.toString()));
            columns.add(availT.cols.repeat, budget.messages.REPEAT.toString());
            res.addColumnMeta(availT.cols.appointmentLen, {min: 10, max: 120});

            let doesRepeat = false;
            tbl.forEachModify(function(row) {
                let start = row.get(tblKeys.start);
                let stop = row.get(tblKeys.len);
                let appointmentLen = row.get(tblKeys.appointmentLen);
                let stopErrors = [];
                let endErrors = [];
                if (stop < start + appointmentLen * 60000) {
                    stopErrors.push(budget.messages.YOU_MUST_BE_AVAILABLE_FOR_ONE_APPOINTMENT_LENGTH);
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
    const cls = budget.widgets.BusinessHours;
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
        let startTime = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(cls.convertSiteToDate(holidayUsage[selectedIndex].start, me.timezoneB_.get())));
        let stopTime = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(cls.convertSiteToDate(holidayUsage[selectedIndex].stop - budget.widgets.BusinessHours.MILLI_PER_DAY, me.timezoneB_.get())));

        row.set(tblKeys.siteid, 0);
        row.set(tblKeys.start, startTime);
        row.set(tblKeys.stop, stopTime);

        tbl.addRow(row);
        let modTableB = frp.createB(columns.applyMeta(tbl));

        let td = me.makeDateDialog_(modTableB, startTime, stopTime, selectedIndex, budget.messages.MODIFY_HOLIDAY.toString());
        td.show(true);

    }, this.siteB_, this.curDateB_, this.holidaysB_, this.timezoneB_);
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
budget.widgets.BusinessHours.prototype.isAppointment_ = function(menuInfo) {
    

    let usage = this.createAppointments_(true);
    let startOfWeekMilli = recoil.ui.widgets.DateWidget2.convertLocaleDate(this.curDateB_.get()).getTime();
    return this.timeInDateRange_(usage, (startOfWeekMilli + menuInfo.clickPosMilli));

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
    let isAppointment = this.isAppointment_.bind(this);
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

    let or = function(f1, f2) {
        return function(menuInfo) {
            return f1(menuInfo) || f2(menuInfo);
        };
    };

    

    let checkPerm = function(perms) {
        return function() {
            if (perms === null) {
                return true;
            }
            let context = null;
            frp.accessTrans(function() {
                context = me.contextB_.get();
            }, me.contextB_);
            if (context !== null) {
                for (let i = 0; i < perms.length; i++) {
                    if (aurora.permissions.has(perms[i])(/** @type {{permissions: !Object<string,boolean>, userid: ?}} */ (context))) {
                        return true;
                    }
                }
            }
            return false;

        };
    };
    let addMenu = function(name, show, func, perm) {
        menus.push({item: new goog.ui.MenuItem(name.toString()), show: and(show, checkPerm(perm)), func: func});
    };
    let mess = budget.messages;
    if (this.type_ === 'admin') {
        addMenu(mess.REMOVE_HOURS, regHoursExists, this.doRemoveHoursFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.MODIFY_HOURS_DIALOG, regHoursExists, this.doModifyHoursDialogFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.ADD_HOURS_DIALOG, not(regHoursExists), this.doAddHoursDialogFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.REMOVE_HOLIDAY, holidayExists, this.doRemoveHolidayFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.MODIFY_HOLIDAY_DIALOG, holidayExists, this.doModifyHolidayDialogFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.MAKE_HOLIDAY, not(holidayExists), this.doMakeHolidayFunc_(menuInfo), ['site-management']);
        addMenu(budget.messages.ADD_HOLIDAYS_DIALOG, not(holidayExists), this.doAddHolidaysDialogFunc_(menuInfo), ['site-management']);
    }

    if (this.type_ === 'client') {
        let perms = ['client', 'mentor', 'site-management'];
        let clientIdFunc = function () {
            return me.clientId_ != undefined;
        };
        addMenu(mess.UNSCHEDULE_APPOINTMENT,
                and(isAppointment, clientIdFunc),
                this.doUnscheduleAppointmentFunc_(menuInfo), perms);
        addMenu(mess.SCHEDULE_APPOINTMENT,  and(
            and(or(clientIdFunc, not(this.loggedIn_())), isAvailable),
            and(not(holidayExists), not(isAppointment))), this.doScheduleAppointmentFunc_(menuInfo), null);
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
    this.contextMenu_.render(this.calendarDiv_);
    let menuEvents = [goog.events.EventType.CONTEXTMENU];
    if (this.type_ !== 'admin') {
        menuEvents.push(goog.events.EventType.MOUSEDOWN);
    }
    goog.events.listen(
        this.calendarDiv_, menuEvents, frp.accessTransFunc(function(e) {


            
            if (e.ctrlKey) {
                return;
            }

            if (goog.dom.contains(me.contextMenu_.getElement(), e.target)) {
                e.preventDefault();
                e.stopPropagation();
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
            menuInfo.clickPosTime = budget.widgets.BusinessHours.addDays(startOfWeekMilli, dayIndex, milliInDay);
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
    budget.appointments.mergeDayUsage(dayUsage, opt_absolute);
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
budget.widgets.BusinessHours.addMonths_ = budget.appointments.addMonths;

/**
 * add days to start taking into consideration day lengths, if the lenght is shorter it will go
 * to the last day of the day
 * @param {number} start
 * @param {number} days number of days to add
 * @param {number=} opt_millInDay if specified will set the time of day
 * @return {number}
 */
budget.widgets.BusinessHours.addDays = function(start, days, opt_millInDay) {
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
budget.widgets.BusinessHours.getMonths_ = budget.appointments.getMonths;


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
 * @param {function(number,number,?number)} callback - params start and stop, mentorid
 */
budget.widgets.BusinessHours.iterateOverPeriod = function(entry, periodStart, periodStop, callback) {
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let repType = entry.get(availT.cols.repeat);
    let startRep = entry.get(availT.cols.start);
    let stopRep = entry.get(availT.cols.stop);
    let len = entry.get(availT.cols.len);
    let mentorid = entry.get(availT.cols.mentorid) ? entry.get(availT.cols.mentorid).db : null;
    budget.appointments.iterateOverPeriod(
        mentorid, startRep, stopRep, repType, len,
        periodStart, periodStop, callback);
};


/**
 * @private
 * @return {boolean}
 */
budget.widgets.BusinessHours.prototype.isClient_ = function() {
    return this.type_ == 'client';
};

/**
 * @param {number} start start of week
 * @param {number} time
 * @return {number}
 */
budget.widgets.BusinessHours.toWeekTime = function (start, time) {

    let timeM = moment(time);
    let dayDiff = Math.floor(timeM.diff(moment(start), 'd', true));
    let dayOffset = ((timeM.hour() * 60 + timeM.minute()) * 60 + timeM.seconds()) * 1000 + timeM.millisecond();

    return dayOffset + Math.round(dayDiff) * budget.widgets.BusinessHours.MILLI_PER_DAY;
};
/**
 * @param {!Array<{start:number,stop:number}>} dayUsage
 * @param {number} periodStart
 * @param {number} startTime
 * @param {number} stopTime
 * @param {function(?):boolean=} opt_match
 * @return {!Array}
 */
budget.widgets.BusinessHours.removeOverlaps_ = function(dayUsage, periodStart, startTime, stopTime, opt_match) {
    let start = budget.widgets.BusinessHours.toWeekTime(periodStart, startTime);
    let stop = budget.widgets.BusinessHours.toWeekTime(periodStart, stopTime);
    return budget.widgets.BusinessHours.removeOverlaps(dayUsage, start, stop, opt_match);
};


/**
 * @param {!Array<{start:number,stop:number}>} removeFrom
 * @param {!Array<{start:number,stop:number}>} toRemove
 * @return {!Array}
 */
budget.widgets.BusinessHours.removeAllOverlaps = function(removeFrom, toRemove) {
    let res = removeFrom;
    toRemove.forEach(function (e) {
        res = budget.widgets.BusinessHours.removeOverlaps(res, e.start, e.stop);
    });
    return res;
};
/**
 * like removeOverlaps_ but doesn't use period start
 * @param {!Array<{start:number,stop:number}>} dayUsage
 * @param {number} start
 * @param {number} stop
 * @param {function(?):boolean=} opt_match
 * @return {!Array}
 */
budget.widgets.BusinessHours.removeOverlaps = function(dayUsage, start, stop, opt_match) {
    let newDayUsage = [];
    // we need to convert times to their ms offset in the week
    function addNonEmpty(list, entry) {
        if (entry.start < entry.stop) {
            list.push(entry);
        }
    }

    dayUsage.forEach(function (usage) {
        if (!opt_match || opt_match(usage)) {
            if (stop <= usage.start || start >= usage.stop || start >= stop) {
                // happens out of range of usage
                newDayUsage.push(usage);
            }
            else {
                
                /**
                 *   aaaa         aaaa    case(1,2)
                 *      uuuu   uuuu
                 *
                 *    aa          aaaa    case(3,4)  
                 *   uuuu          uu
                 * 
                 *   aaa           aaa    case(5,6)
                 *   uuuuu       uuuuu 
                 *
                 *   aaaaa       aaaaa    case(7,8)
                 *   uuu           uuu 
                 *
                 *         aaa            case(9)
                 *         uuu
                 */
                        
                let newUsage = goog.object.clone(usage);
                if (start <= usage.start) {
                    // 1=>ok,4=>empty,5=>ok,7=>empty,9=>empty
                    newUsage.start = stop;
                    addNonEmpty(newDayUsage, newUsage);
                }
                else if (stop >= usage.stop) {
                    // 2=>ok,6=>ok,8=>empty
                    newUsage.stop = start;
                    addNonEmpty(newDayUsage, newUsage);
                }
                else {
                    // 3 remaining
                    goog.object.extend(newUsage, {start: usage.start, stop: start});
                    newDayUsage.push(newUsage);
                    newUsage = {};
                    goog.object.extend(newUsage, usage, {start: stop, stop: usage.stop});                    
                    newDayUsage.push(newUsage);
                }
            }
        }
        else {
            newDayUsage.push(usage);
        }
    });
    return newDayUsage;
};
/**
 * @param {boolean} userOnly if true only shows the current users appointment
 * @return {!Array<{start: number, stop: number, id:number, mentor:number}>}
 */
budget.widgets.BusinessHours.prototype.createAppointments_ = function(userOnly) {
    if (!this.isClient_()) {
        return [];
    }
    let apptsT = aurora.db.schema.tables.base.secure_appts;
    let appointments = this.appointmentsB_.get();
    let res = [];
    let toNum = x => x ? x.db : null;
    let clientId = this.clientId_;
    if (clientId != undefined) {
        appointments.forEach(function (appt) {
            let id = toNum(appt.get(apptsT.cols.id));
            let mentor = toNum(appt.get(apptsT.cols.mentorid));
            let userid = toNum(appt.get(apptsT.cols.userid));
            let start = appt.get(apptsT.cols.start);
            let stop = appt.get(apptsT.cols.stop);
            if (!userOnly || clientId == userid) {
                res.push({mentorid: mentor, userid, start, stop, id: id});
            }
        });
    }

    return res;
};

/**
 * @private
 * @param {!recoil.structs.table.Table} avail
 * @param {number} periodStart
 * @param {number} periodStop
 * @param {function(?number):boolean=} opt_filterMentors
 * @return {!Array<{start: number, stop: number}>}
 */
budget.widgets.BusinessHours.prototype.createAvailable_ = function(avail, periodStart, periodStop, opt_filterMentors) {
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let apptsT = aurora.db.schema.tables.base.secure_appts;

    let iterateOverPeriod = budget.widgets.BusinessHours.iterateOverPeriod;
    let me = this;
    let dayUsage = [];
    // the end time here is where the repeat stops not the appointment
    avail.forEach(function(entry) {
        iterateOverPeriod(entry, periodStart, periodStop, function(start, stop, mentor) {
            if (stop > periodStart && start < periodStop) {
                if (!opt_filterMentors || opt_filterMentors(mentor)) {
                    dayUsage.push({start: start - periodStart, stop: stop - periodStart, mentor});
                }
            }
        });
    });

    if (this.isClient_()) {
        // if client view filter out appointments and holidays
        // don't worry about a particular clients appointments that will be added later
        let appointments = this.appointmentsB_.get();
        let holidaysT = aurora.db.schema.tables.base.site_holidays;

        appointments.forEach(function (appt) {
            let mentor = appt.get(apptsT.cols.mentorid);
            let start = appt.get(apptsT.cols.start);
            let stop = appt.get(apptsT.cols.stop);
            dayUsage = budget.widgets.BusinessHours.removeOverlaps_(
                dayUsage, periodStart,
                start, stop, usage => mentor && usage.mentor == mentor.db);
        });
        this.holidaysB_.get().forEach(function (row) {
            dayUsage = budget.widgets.BusinessHours.removeOverlaps_(
                dayUsage, periodStart,
                row.get(holidaysT.cols.start),
                row.get(holidaysT.cols.stop));
        });
    }

    
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
    const cls = budget.widgets.BusinessHours;
    let timezone = null;
    
    site.forEach(function(row) {
        timezone = row.get(siteT.cols.timezone);
    });

    
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
 * @param {{permissions: !Object<string,boolean>, userid: ?}} context
 * @return {boolean}
 */
budget.widgets.BusinessHours.prototype.shouldShowOfficeHoursOnHolidays_ = function(context) {
    return aurora.permissions.hasAny(['mentor', 'user-management'])(context);
};

/**
 * @param {number} time
 * @param {Array<{start: number, stop: number}>} holidays
 * @return {boolean}
 */
budget.widgets.BusinessHours.prototype.isHoliday_ = function(time, holidays) {

    for (let i = 0; i < holidays.length; i++) {
        let hol = holidays[i];

        if (time >= hol.start && time < hol.stop) {
            return true;
        }
    }
    return false;
};



/**
 * @param {!Array<{start: number, stop: number}>} dayUsage
 * @param {?} calDim
 * @param {?} hourDim
 * @param {string} cls the class of the div to add
 * @param {boolean} handleDaylightSaving
 * @param {?string} timezone
 */
budget.widgets.BusinessHours.prototype.updateUsage_ = function(dayUsage, calDim, hourDim, cls, handleDaylightSaving, timezone) {
    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
    let milliPerWeek = milliPerDay * 7;
    let cd = goog.dom.createDom;
    let hourH = hourDim.height;
    let minY = hourDim.top - calDim.top;
    let weekStart = this.dateWidget_.convertLocaleDate(this.curDateB_.get()).getTime();
    const isAdmin = this.type_ === 'admin';
    let getDstAdjust = function(day) {
        if (!handleDaylightSaving) {
            // if we are not handling daylight savings we are repeating times
            // so adjust for time zone
            return budget.widgets.BusinessHours.getTZAdjustment(weekStart, timezone, !!timezone);
        }
        let dayEnd = budget.widgets.BusinessHours.addDays(weekStart, day + 1);
        return (weekStart + milliPerDay * (day + 1)) - dayEnd;
    };


    let holidays = this.holidaysB_.get();
    let holidayUsage = this.createHolidayUsage_(holidays);

    let days = {};
    for (let i = 0; i < 7; i++) {
        let dayStart = i * milliPerDay;
        let dayEnd = dayStart + milliPerDay;
        days[i] = [];

        if (!budget.widgets.BusinessHours.prototype.shouldShowOfficeHoursOnHolidays_(this.contextB_.get())) {
            if (this.isHoliday_(budget.widgets.BusinessHours.addDays(weekStart, i), holidayUsage)) {
                continue;
            }
        }

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
 * should be able to refactor so holidays and appointments use same code
 * @param {!Array<{start:number, stop: number}>} list
 * @param {string} cls
 * @param {number} startDateMillis
 * @param {{height:number, width:number, top:number, left:number}} hourDim
 * @param {{height:number, width:number, top:number, left:number}} calDim
 * @param {!Array<number>} callUsers
 * @param {?string} timezone
 */
budget.widgets.BusinessHours.prototype.updateRanges_ = function (list, cls, startDateMillis, hourDim, calDim, callUsers, timezone) {
    let milliPerDay = budget.widgets.BusinessHours.MILLI_PER_DAY;
    let hourH = hourDim.height;
    let minY = hourDim.top - calDim.top;
    let cd = goog.dom.createDom;
    let me = this;
    let frp = this.scope_.getFrp();
    let html = new recoil.ui.HtmlHelper(this.scope_);
    let divs = goog.dom.getElementsByClass(cls, this.calendarDiv_);
    for (let j = 0; j < divs.length; j++) {
        goog.dom.removeNode(divs[j]);
    }

    let myId = BigInt(goog.net.cookies.get('userid'));

    for (let day = 0; day < 7; day++) {
        let curDateStart = moment(startDateMillis).add(day, 'd').toDate().getTime();
        let curDateEnd = moment(startDateMillis).add(day + 1, 'd').toDate().getTime();

        function getOffset(val) {
            // handles daylight savings
            return budget.widgets.BusinessHours.getDayOffset(val, timezone);
        }
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let start = item.start;
            let stop = item.stop;
            if (curDateEnd <= start || curDateStart >= stop) {
                
            } else {
                let startOffsetMillis = start < curDateStart ? 0 : Math.max(getOffset(start), 0);
                let stopOffset = getOffset(stop);
                let endOffsetMillis = Math.min(milliPerDay, stop  >= curDateEnd ? milliPerDay : stopOffset);
                
                let yStart = (minY + hourH * startOffsetMillis / 3600000);
                let yEnd = (minY + hourH * endOffsetMillis / 3600000);


                let canCall = (aurora.permissions.has('mentor')(this.contextB_.get()) ||
                               myId === item.userid) && item.mentorid != undefined;


                let curDiv = cd('div', {class: cls});
                
                curDiv.style.top = (1 + yStart) + 'px';
                curDiv.style.height = (yEnd - yStart - 1) + 'px';
                curDiv.style.left = '1px';
                curDiv.style.width = (hourDim.width -1) + 'px';

                if (canCall && me.chat_) {
                    let userT = aurora.db.schema.tables.base.user;
                    let enabled = aurora.widgets.Chat.State.idle === me.chat_.getState().get().state;
                    let toCall = myId === item.userid ? item.mentorid : item.userid;
                    let video = cd('i', 'fas fa-video budget-calendar-chat-button');
                    let voice = cd('i', 'fas fa-phone budget-calendar-chat-button');
                    let disabledB = frp.liftB(function (avail) {
                        return !(enabled && avail[toCall]);
                    }, me.chat_.getAvailableB());
                    html.enableClass(video, 'disabled', disabledB);
                    html.enableClass(voice, 'disabled', disabledB);

                    let toCallName = me.clientB_.get();

                    callUsers.push(toCall);
                    me.mentorsB_.get().forEach(function (row) {
                        if (row.get(aurora.db.schema.tables.base.mentor.cols.id).db == toCall) {
                            toCallName = me.getMentorDisplayName(row);
                        }
                    });

                    let makeDoCall = function (media) {
                        return function(e) {
                            let disabled = frp.accessTrans(function () {return disabledB.get();}, disabledB);
                            if (disabled || e.button !== 0) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                            }
                            me.chat_.doCall(media, toCall, toCallName);
                            e.preventDefault();
                            e.stopPropagation();
                        };
                    };
                    goog.events.listen(video, goog.events.EventType.MOUSEDOWN, makeDoCall({audio: true, video: true}));
                    goog.events.listen(voice, goog.events.EventType.MOUSEDOWN, makeDoCall({audio: true, video: false}));

                    curDiv.appendChild(cd('div', 'budget-calendar-chat-buttons', video,voice));
                }

                this.days_[day].div.appendChild(curDiv);
                
            }
        }
    }
};
/**
 * @private
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 */
budget.widgets.BusinessHours.prototype.update_ = function(helper) {
    const cls = budget.widgets.BusinessHours;
    goog.style.setElementShown(this.loadingContainer_, !helper.isGood() && helper.errors().length === 0);
    goog.style.setElementShown(this.errorContainer_, !helper.isGood() && helper.errors().length !== 0);
    goog.style.setElementShown(this.calendarDiv_, helper.isGood());
    let cd = goog.dom.createDom;
    let me = this;
    if (helper.isGood()) {
        goog.style.setElementShown(this.yourAvailableLegend_, me.mentorIdB_.get() != null);
        goog.style.setElementShown(this.mentorDiv_, me.type_ == 'mentor' && aurora.permissions.has('user-management')(this.contextB_.get()));
        let timezone = this.timezoneB_.get();
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
        me.updateUsage_(dayUsage, calDim, hourDim, 'avail', false, me.type_ === 'admin' ? null : timezone);
        if (me.type_ === 'mentor' || me.type_ === 'client') {
            let pStart = this.dateWidget_.convertLocaleDate(curDate).getTime();
            let mainFilter = function (mentor) {
                return me.type_ !== 'client' || mentor != me.mentorIdB_.get();
            };
            let myFilter = function (mentor) {
                return me.type_ === 'client' && mentor == me.mentorIdB_.get();
            };
            
            me.updateUsage_(
                this.createAvailable_(this.availableB_.get(), pStart, pStart + milliPerWeek, mainFilter, null),
                calDim, hourDim, 'mentor-avail', true);
            me.updateUsage_(
                this.createAvailable_(this.availableB_.get(), pStart, pStart + milliPerWeek, myFilter, null),
                calDim, hourDim, 'your-mentor-avail', true);

        }

        
        let startDateMillis =
            cls.convertDateToSite(
                this.dateWidget_.convertLocaleDate(curDate).getTime(), timezone, me.type_ == 'admin');

        let callUsers = [];
        this.updateRanges_(holidayUsage, 'budget-holiday', startDateMillis, hourDim, calDim, [], me.type_ == 'admin' ? timezone : null);
        this.updateRanges_(this.createAppointments_(true), 'budget-cal-appoint', startDateMillis, hourDim, calDim, callUsers, me.type_ == 'admin' ? timezone : null);

        if (this.chat_) {
            this.chat_.interestedIn(callUsers);
        }

    }
};

/**
 * @param {recoil.frp.Behaviour<string>} selectionB
 */
budget.widgets.BusinessHours.prototype.attachHelper_ = function(selectionB) {

    this.selAppB_ = selectionB;

    let bs = [this.siteB_, this.siteIdB_, this.highlightedB_, this.curDateB_,
              this.contentSizeB_, this.holidaysB_,
              this.borderDimsB_, this.hoursTblB_, this.appointmentsB_, this.availableB_,
              this.contextB_, this.unscheduleActionB_, this.scheduleActionB_, this.mentorIdB_, this.clientB_, this.mentorsB_, this.timezoneB_];


    if (selectionB) {
        bs.push(selectionB);
    }
    if (this.chat_) {
        bs.push(this.chat_.getState());
    }
    this.helper_.attach.apply(this.helper_, bs);
};

/**
 * @param {!recoil.frp.Behaviour<string>} selApp
 * @param {(!recoil.ui.BoolWithExplanation|!recoil.frp.Behaviour<!recoil.ui.BoolWithExplanation>)=} opt_enabled
 */
budget.widgets.BusinessHours.prototype.attach = function(selApp, opt_enabled) {
    var frp = this.helper_.getFrp();

    this.selAppB_ = selApp;
    this.attachHelper_(selApp);

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

