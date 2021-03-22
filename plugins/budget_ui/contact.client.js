goog.provide('budget.widgets.Contact');

goog.require('aurora.Client');
goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableDialog');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.dom.classlist');
goog.require('goog.object');goog.require('recoil.ui.columns.Expr');
goog.require('recoil.ui.frp.LocalBehaviour');
/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Contact = function(scope) {
    this.scope_ = scope;
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let siteT = aurora.db.schema.tables.base.site;
    this.hoursT_ = siteT.regular;

    this.siteTblB_ = scope.getDb().get(siteT.key);
    this.hoursB_ = budget.Client.instance.createSubTableB(this.siteTblB_, frp.createB(/** @type {Array} **/ (null)), siteT.cols.regular);

    let header = cd('h2', {class: 'page-heading'}, 'CONTACT US');
    let subHeader = cd('h3', {class: 'page-heading'}, 'Get in touch, we are here for you!');
    let headerDiv = cd('div', {class: 'headerDiv'}, header, subHeader);

    let contactTable = cd('table', {class: 'contact-table contact'});

    this.map_ = cd('iframe', {class: 'center', width: '900px', height: 400, frameborder: 0, allowfullscreen: '', 'aria-hidden': false, tabindex: 0, style: 'border:0;'});
    let mapDiv = cd('div', {class: 'mapDiv'}, this.map_);

    this.phone_ = cd('a', {class: 'phone'});
    this.email_ = cd('a', {class: 'email'});
    this.address_ = cd('td', {class: 'address'});
    this.officeHours_ = cd('table', {class: 'office-hours'});

    let phoneLabel = cd('td', {class: 'label'}, 'Phone');
    let phone = cd('tr', {class: 'contact-item'}, phoneLabel, cd('td', {class: 'info-data'}, this.phone_));

    let emailLabel = cd('td', {class: 'label'}, 'Email');
    let email = cd('tr', {class: 'contact-item'}, emailLabel, cd('td', {class: 'info-data'}, this.email_));

    let addressLabel = cd('td', {class: 'label'}, 'Address');
    let address = cd('tr', {class: 'contact-item'}, addressLabel, this.address_);

    let officeHoursLabel = cd('td', {class: 'label'}, 'Office Hours', this.officeHours_);

    let calLink = cd('td', {}, cd('a', {href: '/hours'}, budget.messages.FULL_CALENDAR.toString()));
    let linkLabel = cd('tr', {class: 'contact-item'}, cd('td'), calLink);


    let officeHours = cd('tr', {class: 'contact-item'}, officeHoursLabel, this.officeHours_);
    let contactDiv = cd('table', {class: 'budget-contact'}, phone, email, address, officeHours, linkLabel);

    this.container_ = cd('div', {class: 'container'}, headerDiv, mapDiv, contactDiv);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);
    this.helper_.attach(this.siteTblB_, this.hoursB_);

};

/**
 * @private
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 */
budget.widgets.Contact.prototype.update_ = function(helper) {
    let siteT = aurora.db.schema.tables.base.site;
    let cd = goog.dom.createDom;

    let getRow = function(tbl) {
        let res = null;
        tbl.forEach(function(r) {
            res = r;
        });
        return res;

    };
    if (helper.isGood()) {
        let site = getRow(this.siteTblB_.get());
        let hours = this.hoursB_.get();
        let me = this;

        // Monday to Wednesday, Friday 9am to 5pm
        // Thursday 9am to 7pm

        this.phone_.innerText = site.get(siteT.cols.phone);
        this.phone_.setAttribute('href', 'tel:' + site.get(siteT.cols.phone));
        this.email_.innerText = site.get(siteT.cols.email);
        this.email_.setAttribute('href', 'mailto:' + site.get(siteT.cols.email));
        this.address_.innerText = site.get(siteT.cols.mapAddress);


        this.map_.setAttribute('src', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3001.46733756455!2d174.90554621601007!3d-41.211585143724555!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6d38aa57748009a5%3A0x1654e6e37bbcdf1b!2s' + encodeURIComponent(site.get(siteT.cols.mapAddress)) + '!5e0!3m2!1sen!2snz!4v1595367482164!5m2!1sen!2snz');
        let days = [];
        let map = new goog.structs.AvlTree(recoil.util.object.compareKey);
        let format = new Intl.DateTimeFormat(undefined, {
            weekday: 'long'
        });


        for (let day = 0; day < 7; day++) {
            let dayStart = day * budget.widgets.BusinessHours.MILLI_PER_DAY;
           let dayStop = (day + 1) * budget.widgets.BusinessHours.MILLI_PER_DAY;
            let keys = [];

            hours.forEach(function(row) {


                let start = row.get(me.hoursT_.cols.start);
                let stop = row.get(me.hoursT_.cols.stop);

                if (stop <= dayStart || start >= dayStop) {
                    return;
                }

                let relStart = Math.max(0, start - dayStart);
                let relStop = Math.min(budget.widgets.BusinessHours.MILLI_PER_DAY, stop - dayStart);

                keys.push({start: relStart, stop: relStop});
            });

            keys.sort(recoil.util.object.compare);
            map.safeFind({key: keys, days: []}).days.push(day);

        }


        let list = map.toList().filter(function(x) {return x.key.length > 0;});
        list.sort(function(x, y) {
            // this works because a day can only appear in 1 element
            // and the first element is always the smallest
            return x.days[0] - y.days[0];
        });


        let getDays = function(arr) {
            let res = [];
            let cd = goog.dom.createDom;


            let len = 1;
            let retArr = [];
            let aa = [];

            let formatDate = function(day) {

                return new Intl.DateTimeFormat(undefined, {weekday: 'short'}).format(new Date([2001, 1, arr[day] + 1]));
            };

            let makeRange = function(start, stop) {
                if (start === stop) {
                    return formatDate(start);
                }

                let start1 = formatDate(start);
                let stop1 = formatDate(stop);

                return budget.messages.X_TO_Y.toString({x: start1, y: stop1});
            };

            let start = 0;
            for (let i = 1; i < arr.length; i++) {
                if (arr[i - 1] + 1 !== arr[i]) {
                    res.push(makeRange(start, i - 1));
                    start = i;
                }
            }
            res.push(makeRange(start, arr.length - 1));


            return recoil.ui.messages.join(res, budget.messages.X_COMMA_Y).toString();
        };

        let formatTime = function(time) {
            let format = {hour: 'numeric'};
            if (time % 3600000 !== 0) {
                format.minute = '2-digit';

            }
            return new Date(
                new Date('2000,01, 01').getTime() + time).toLocaleTimeString([], format);
        };

        let getHours = function(hours) {
            let res = [];


            for (let i = 0; i < hours.length; i++) {
                let startHour = formatTime(hours[i].start);

                let stopHour = formatTime(hours[i].stop);

                res.push(budget.messages.X_TO_Y.toString({x: startHour, y: stopHour}));
            }


            return recoil.ui.messages.join(res, budget.messages.X_COMMA_Y).toString();
        };

        list.forEach(function(v) {
            let days = getDays(v.days);
            let hours = getHours(v.key);
            let weekdays = cd('tr', {class: 'weekdays'}, cd('td', {class: 'days'}, days));
            weekdays.appendChild(cd('td', {class: 'daily-hours'}, hours));
            me.officeHours_.appendChild(weekdays);

        });

    }

};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Contact.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.Contact.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

