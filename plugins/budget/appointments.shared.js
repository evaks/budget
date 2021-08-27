goog.provide('budget.appointments');

/**
 * @final
 * number of milliseconds per day
 */
budget.appointments.MILLI_PER_DAY = 3600000 * 24;
/**
 * add months to start taking into consideration month lengths, if the lenght is shorter it will go
 * to the last day of the month
 * @param {number} start
 * @param {number} months number of months to add
 * @return {number}
 */
budget.appointments.addMonths = function(start, months) {
    let startDate = new Date(start);
    let month = startDate.getMonth();
    startDate.setMonth(month + months + 1, 0);
    let maxDate = startDate.getDate();
    startDate = new Date(start);
    startDate.setMonth(month + months, Math.min(maxDate, startDate.getDate()));
    return startDate.getTime();

};

/**
 * gets the number of months since 0000
 * @param {number} when
 * @return {number}
 */
budget.appointments.getMonths = function(when) {
    let date = new Date(when);
    return date.getFullYear() * 12 + date.getMonth();
};

/**
 * @param {?number} mentorid
 * @param {number} startRep
 * @param {?number} stopRep
 * @param {number} repType
 * @param {number} len
 * @param {number} periodStart millis since epoc
 * @param {number} periodStop millis since epoc
 * @param {function(number,number,?number)} callback - params start and stop, mentorid
 */
budget.appointments.iterateOverPeriod = function(mentorid, startRep, stopRep, repType, len, periodStart, periodStop, callback) {
    let availT = aurora.db.schema.tables.base.mentor_availablity;
    let RepeatType = aurora.db.schema.getEnum(availT.cols.repeat);
    let repeatMeta = aurora.db.schema.getMeta(availT.cols.repeat);

    const REGULAR = [RepeatType.weekly, RepeatType.fortnightly, RepeatType.daily];

    if (periodStop < periodStart) {
        return;
    }
    if (repType == null) {
        if (startRep >= periodStart && startRep < periodStop) {
            callback(startRep, startRep + len, mentorid);
        }
        return;
    }

    let stopTime = stopRep == null ? periodStop : stopRep;
    let regularIdx = REGULAR.indexOf(repType);
    if (regularIdx !== -1) {
        let interval = repeatMeta.enumInfo[repType].rate * budget.appointments.MILLI_PER_DAY;
        let curStart = startRep;
        if (startRep < periodStart) {
            let numIntervals = Math.ceil((periodStart - startRep) / interval);
            curStart = numIntervals * interval + startRep;
        }
        for (let i = curStart; i < stopTime; i += interval) {
            // deal with daylight savings
            let dayDiff = Math.round((i - startRep) / budget.appointments.MILLI_PER_DAY);

            let time = new Date(startRep);
            time.setDate(time.getDate() + dayDiff);
            callback(time.getTime(), time.getTime() + len, mentorid);
        }
    }
    else if (repType === RepeatType.monthly || repType === RepeatType.quarterly || repType === RepeatType.yearly) {
        // we will work in months and compare
        let repMonths = budget.appointments.getMonths(startRep);
        let startMonths = budget.appointments.getMonths(periodStart);
        let interval = Math.round(12 * (repeatMeta.enumInfo[repType].rate / 365));
        let curStart = repMonths;

        if (startMonths > repMonths) {
            let numIntervals = Math.ceil((startMonths - repMonths) / interval);
            curStart = repMonths + numIntervals * interval;
        }


        let curMonth = curStart - repMonths;

        let curDate = budget.appointments.addMonths(startRep, curMonth);
        while (curDate < stopTime) {
            callback(curDate, curDate + len, mentorid);
            curMonth += interval;
            curDate = budget.appointments.addMonths(startRep, curMonth);

        }
    }
};


/**
 * @param {!Array<{start: number, stop: number}>} dayUsage
 * @param {boolean=} opt_absolute
 */
budget.appointments.mergeDayUsage = function(dayUsage, opt_absolute) {

    let comparator = function(x, y) {
        let res = x.start - y.start;
        if (res) {
            return res;
        }
        return x.stop - y.stop;
    };
    let milliPerDay = budget.appointments.MILLI_PER_DAY;
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
