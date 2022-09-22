goog.provide('budget.widgets.calc.Loan');


goog.require('goog.dom');
goog.require('recoil.frp.Frp');
goog.require('recoil.ui.renderers.NullRenderer');


/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number} userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.calc.Loan = function(scope, userid) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    const taxT = aurora.db.schema.tables.base.tax;
    const accT = aurora.db.schema.tables.base.acc;
    const studentT = aurora.db.schema.tables.base.student_loan;
    const tierT = taxT.tiers;

    let budgetT = aurora.db.schema.tables.base.budget;

    const TOCOL = new recoil.structs.table.ColumnKey('to');
    let dateB = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date()));
    let periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);

    let today = recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date());
    let d = new Date();
    d.setDate(d.getDate() + 7);
    let nextWeek = recoil.ui.widgets.DateWidget2.convertDateToLocal(d);
    
    let amountB = frp.createB(null);
    let drawdownDateB = frp.createB(today);
    let firstPaymentDateB = frp.createB(nextWeek);
    this.showInterestCalcB_ =frp.createB(false);
    
    let repaymentFrequencyB = frp.createB(periodMeta.enum.weekly);
    let compoundFrequencyB = frp.createB(periodMeta.enum.monthly);
    this.feeFrequencyB_ = frp.createB(periodMeta.enum.monthly);
    let feeAmountB = frp.createB(null);
    let paymentAmountB = frp.createB(null);
    let feeStartDateB = frp.createB(today);
    let interestRateB = frp.createB(null);
    let interestPeriodB = frp.createB(periodMeta.enum.yearly);
    
    const cls = budget.widgets.calc.Loan;

    this.detail_ = cd('table', {});

    this.amountWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.interestRateWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.interestPeriodWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.repaymentAmountWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.drawDownDateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.firstPaymentDateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.repaymentFrequencyWidget_ = new recoil.ui.widgets.SelectorWidget(scope),
    this.compoundFrequencyWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.showInterestCalcWidget_ = new recoil.ui.widgets.CheckboxWidget(scope);
    this.feeFrequencyWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.feeStartDateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.feeAmountWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.showInterestCalcDiv_ = cd('div', 'goog-inline-block');
    this.showInterestCalcWidget_.getComponent().render(this.showInterestCalcDiv_);
    this.showInterestCalcWidget_.attachStruct({value: this.showInterestCalcB_});
    /**
     * @param {...} var_els
     * @return {!Element}
     */
    let makeRow = function(var_els) {
        let row = cd('tr', {});

        for (let i = 0; i < arguments.length; i++) {
            let arg = arguments[i];
            let td = i == 0 || arg.heading ? cd('th') : cd('td', {class: 'calc-data', colspan: i == 1 ? 2 : 1});
            arg = arg.heading || arg;
            
            if (goog.isFunction(arg.getComponent)) {
                arg.getComponent().render(td);
            }
            else if (goog.isString(arg)) {
                td.appendChild(goog.dom.createTextNode(arg));
            }
            else {
                td.appendChild(arg);
            }
            row.appendChild(td);
        }
        return row;
    };

    /**
     * @param {...} var_els
     * @return {!Element}
     */
    let makeExtra = function(var_els) {
        let row = cd('span', {});

        for (let i = 0; i < arguments.length; i++) {
            let arg = arguments[i];
            let td = goog.isString(arg) ? cd('b') : cd('span');
            arg = arg.heading || arg;
            
            if (goog.isFunction(arg.getComponent)) {
                let div = cd('div', 'goog-inline-block');
                td.appendChild(div);
                arg.getComponent().render(div);
            }
            else if (goog.isString(arg)) {
                td.appendChild(goog.dom.createTextNode(arg));
            }
            else {
                td.appendChild(arg);
            }
            row.appendChild(td);
            row.appendChild(goog.dom.createTextNode(' '));
        }
        return row;
    };
    this.resultsSep_ = cd('tr', {}, cd('td', {colspan: 3, class: 'calc-result-sep'}));
    let container = cd(
        'table', {class: 'calc-results'},
        makeRow('Loan Amount', this.amountWidget_),
        makeRow('Draw Down Date', this.drawDownDateWidget_),
        makeRow('Repayment', makeExtra(this.repaymentAmountWidget_, this.repaymentFrequencyWidget_, 'Start Date', this.firstPaymentDateWidget_)),
        makeRow('Interest Rate', makeExtra(
            this.interestRateWidget_, this.interestPeriodWidget_,
            'Compounding', this.compoundFrequencyWidget_,
            cd('div', 'goog-inline-block budget-info', 'How often is the interest added to the balance.'))),
        makeRow('Fee', makeExtra(this.feeAmountWidget_, this.feeFrequencyWidget_, 'Start Date', this.feeStartDateWidget_)),
        this.resultsSep_,
//        makeRow('', this.checkAmountWidget_),
    );
    this.tableDiv_ = container;

    const convertDate = recoil.ui.widgets.DateWidget2.convertLocaleDate;

    
    this.repaymentTableB_ = frp.liftB(function (
        amountDolars, drawdown,
        firstPayment, paymentFreq, paymentDollars,
        rate, ratePeriod, compoundFreq,
        feeFrequency, feeStart, feeAmountDollars
    ) {
        let payment = Math.round(paymentDollars * 100);
        let amount = Math.round(amountDolars * 100);
        let dailyRate = rate/periodMeta.enumInfo[ratePeriod].rate;
        let curDate = convertDate(drawdown);
        let feeDate = convertDate(feeStart);
        

        let valid = amountDolars != null && paymentDollars != null && rate != null;

        let detail = valid ? budget.widgets.calc.Loan.calcDetails(
            amount, curDate,
            convertDate(firstPayment), paymentFreq, payment,
            dailyRate, ratePeriod, compoundFreq, feeFrequency, feeDate, feeAmountDollars,
            false) : {entries: [], canPay: true};
        let intDetail = valid ? budget.widgets.calc.Loan.calcDetails(
            amount, curDate,
            convertDate(firstPayment), paymentFreq, payment,
            dailyRate, ratePeriod, compoundFreq, feeFrequency, feeDate, feeAmountDollars,
            true) : {entries: [], canPay: true};

        let compoundRate = periodMeta.enumInfo[compoundFreq].rate;
        let compoundInterestRate = dailyRate * compoundRate / 100;

        let interest = (Math.pow(compoundInterestRate + 1, 365/compoundRate) - 1) * 100;
        return {amount, entries: detail.entries, calcEntries: intDetail.entries, interest, canPay: detail.canPay, valid};
        
    }, amountB, drawdownDateB, firstPaymentDateB, repaymentFrequencyB, paymentAmountB, interestRateB, interestPeriodB, compoundFrequencyB, this.feeFrequencyB_, feeStartDateB, feeAmountB);

    /**
     * @param {!recoil.frp.Behaviour} valueB
     * @param {boolean=} opt_null
     * @return {Object}
     */
    let ex = function(valueB, opt_null) {
        let v = {};
        goog.object.extend(v, periodMeta, {value: valueB});
        if (opt_null) {
            v.list = [null].concat(v.list);
            v.renderer = recoil.ui.renderers.NullRenderer('None', periodMeta.renderer);
        }
        return v;
    };
    const maxDollar = Math.floor(Number.MAX_SAFE_INTEGER/100);
    this.amountWidget_.attachStruct({value: amountB, min: 0, max: maxDollar, step: 0.01, allowNull: true});
    this.interestRateWidget_.attachStruct({value: interestRateB, min: 0, max: 2000, step: 0.01, allowNull: true});
    this.interestPeriodWidget_.attachStruct(ex(interestPeriodB));
    this.repaymentAmountWidget_.attachStruct({value: paymentAmountB, min: 0, max: maxDollar, step: 0.01, allowNull: true});
    this.drawDownDateWidget_.attachStruct(ex(drawdownDateB));
    this.firstPaymentDateWidget_.attachStruct(ex(firstPaymentDateB));
    this.repaymentFrequencyWidget_.attachStruct(ex(repaymentFrequencyB));
    this.compoundFrequencyWidget_.attachStruct(ex(compoundFrequencyB));
    this.feeFrequencyWidget_.attachStruct(ex(this.feeFrequencyB_));
    this.feeStartDateWidget_.attachStruct({
        value: feeStartDateB
    });
    this.feeAmountWidget_.attachStruct({value: feeAmountB, min:0, max: maxDollar, allowNull: true});


    
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);
    this.helper_.attach(this.repaymentTableB_, this.feeFrequencyB_, this.showInterestCalcB_);

};
/**
 * @param {number} amount
 * @param {Date} drawdownDate
 * @param {Date} firstPaymentDate
 * @param {number} paymentFreq
 * @param {number} payment the amount in cents of the repayment
 * @param {number} dailyRate interest rate per day
 * @param {number} ratePeriod how long the interest is for
 * @param {number} compoundFreq how often the interest compounds
 * @param {number?} feeFrequency
 * @param {Date} feeDate
 * @param {number?} feeAmountDollars
 * @param {boolean} calcInterest
 * @return {{entries:!Array, canPay:boolean}}
 */
budget.widgets.calc.Loan.calcDetails = function (
    amount, drawdownDate,
    firstPaymentDate, paymentFreq, payment,
    dailyRate, ratePeriod, compoundFreq,
    feeFrequency, feeDate, feeAmountDollars, calcInterest) {
    let yearOnDate = moment(drawdownDate).add(1, 'y').toDate();
    let curDate = drawdownDate;
    
    const getNextDay = function (date, repeats) {
        let minDate = new Date(date.getTime());
        minDate.setDate(minDate.getDate() + 1);
        let minNext = null;
        
        for (let i = 0; i < repeats.length; i++) {
            let repeat = repeats[i];
            let d = budget.widgets.calc.Loan.next(minDate, repeat.start,  repeat.freq);
            if (minNext === null || d.getTime() < minNext.getTime()) {
                minNext = d;
            }
            
        }
        return minNext;
            
    };
    
    let accured = 0;
    let entries = [{description: 'Opening Balance', amount: null, balance: Math.round(amount), accured: 0, date: curDate}];

    let calcInterestFunc = (name) => {
        return (date, prev) => {
            let amount = Math.round(prev.accured);
            return {description: name, amount: amount, balance: prev.balance + amount, accured: 0};
        };
    };
    
    // this is in priority order
    let repeats = [
        {
            start: curDate,
            freq: compoundFreq,
            calc: calcInterestFunc('Interest')
        }];

   
    
    if (feeFrequency != null && feeAmountDollars)  {
        repeats.push({
                start: feeDate,
            freq: feeFrequency,
            calc: (date, prev) => {
                let amount = Math.round(feeAmountDollars * 100);
                return {description: 'Fee',  amount, balance: prev.balance + amount, accured: prev.accured};
                
            }
            
        });
    }

    if (!calcInterest) {
        repeats.push({
            start: firstPaymentDate,
            freq: paymentFreq,
            calc: (date, prev) => {
                let actualPayment = Math.min(prev.balance , payment);
                let accured = prev.accured;
                let balance = prev.balance -  actualPayment;
                if (prev.balance < payment) {
                    actualPayment = Math.min(payment, prev.balance + accured);
                    accured -= actualPayment - prev.balance;
                    balance = 0;
                }
                // deal with accured interest we can pay that off too
                // if we are over
                return {description: 'Payment',  amount: -actualPayment, balance: balance, accured: accured};
            }});
    }

    if (calcInterest) {
        repeats.push({start: yearOnDate, freq: compoundFreq, calc: calcInterestFunc('Year End')});
    }


    let prev = entries[0];
    let prevDate = new Date(curDate.getTime());
    let canPay = true;

    
    let check = () => {
        if (calcInterest) {
            return curDate.getTime() <= yearOnDate.getTime();
        }
        else {
            return (prev.balance > 0 || Math.round(prev.accured) > 0) && canPay;
        }
    };
    
    while (check())  {
        let nextDay = getNextDay(curDate, repeats);
        let diffDays = moment(nextDay).diff(moment(curDate), 'd');
        prev = goog.object.clone(prev);
        prev.accured = prev.accured + prev.balance * (dailyRate/100) * diffDays;

        if (calcInterest && nextDay.getTime() > yearOnDate.getTime()) {
            // get out of the loop
            curDate = nextDay;
            break;
        }
            
        for (let i = 0; i < repeats.length; i++) {
            let repeat = repeats[i];
            let next = getNextDay(curDate, [repeat]);
            // this happens on this day
            if (next.getTime() === nextDay.getTime()) {
                prev = repeat.calc(nextDay, prev);
                prev.date = nextDay;
                
                entries.push(prev);
                if (entries.length > 1000 && prev.balance > amount && !calcInterest) {
                    canPay = false;
                    break;
                }
            }
        }
        prevDate = prev.date;
            // progress date by at least 1
        curDate = prevDate;
    }

        

    return {entries, canPay};
};
/**
 * @param {Date} startD
 * @param {Date} stopD
 * @return {string}
 */
budget.widgets.calc.Loan.formatDiff = function (startD, stopD) {
    let start = moment(startD);
    let stop = moment(stopD);

    let diff = {};
    let keys = ['years', 'months', 'days'];
    keys.forEach(unit => {
        let val = stop.diff(start, unit, false);
        start.add(val, unit);
        diff[unit] = val;
    });
    
    let res = [];
    keys.forEach(key => {


        let val = diff[key];

        if (val) {
            let unit = val != 1 ? key : key.substring(0, key.length - 1); // remove the s
            res.push(val + ' ' + unit);
        }
    });
    if (res.length == 0) {
        return 'None';
    }
    return res.join(' ');
};
/**
 * does update
 */

budget.widgets.calc.Loan.prototype.update_ = function() {
    let cd = goog.dom.createDom;
    goog.dom.removeChildren(this.detail_);
    while (this.resultsSep_.nextSibling) {
        goog.dom.removeNode(this.resultsSep_.nextSibling);
    }

    if (this.helper_.isGood()) {

        
        let table = cd('table', {});
        let repayments = this.repaymentTableB_.get();
        
        table.appendChild(
            cd('tr', {},
               cd('th', {}, 'Date'),
               cd('th', {}, 'Description'),
               cd('th', {}, 'Amount'),
               cd('th', {}, 'Balance')));

        let paid = 0;
        let last;
        let showWorking = this.showInterestCalcB_.get();
        let entries = showWorking ? repayments.calcEntries : repayments.entries;
        entries.forEach((entry, idx) => {
            if (!showWorking && !repayments.canPay && idx > 100) {
                return;
            }
            table.appendChild(
                cd('tr', {},
                   cd('td', {}, moment(entry.date).format('DD-MM-YY')),
                   cd('td', {}, entry.description),
                   cd('td', 'calc-number', entry.amount == null ? '' : (entry.amount/100).toFixed(2)),
                   cd('td', 'calc-number', (entry.balance/100).toFixed(2)),
//                   cd('td', 'calc-number', (entry.accured/100).toFixed(2))
                  ));
        });

        repayments.entries.forEach((entry, idx) => {
            paid += entry.amount < 0 ? -entry.amount : 0;
            last = entry;
        });

        if (repayments.valid) {
            this.detail_.appendChild(table);
        }
        if (!repayments.valid) {
            this.tableDiv_.appendChild(
                cd('tr', {}, cd('td', 'recoil-error', 'Please fill in missing fields.')));
        }
        else {
            if (repayments.canPay) {
                this.tableDiv_.appendChild(
                    cd('tr', {}, cd ('th', {}, 'Total Cost'), cd('td', 'calc-number', ((paid - repayments.amount)/100).toFixed(2))));
                this.tableDiv_.appendChild(
                    cd('tr', {}, cd ('th', {}, 'Total Payments'), cd('td', 'calc-number', (paid/100).toFixed(2))));

                
                let diff = budget.widgets.calc.Loan.formatDiff(repayments.entries[0].date, last.date); 
                this.tableDiv_.appendChild(
                    cd('tr', {}, cd ('th', {}, 'Time to pay'), cd('td', {colspan: 2}, diff)));

            }
            else {
                this.tableDiv_.appendChild(
                    cd('tr', {}, cd ('th', {}, 'Total Cost'), cd('td', 'recoil-error', 'Loan will never be repaid.')));
            }

            let lastE = repayments.calcEntries[repayments.calcEntries.length -1].balance;
            let firstE = repayments.calcEntries[0].balance;
            let effInt = ((lastE - firstE)/firstE * 100);
            this.tableDiv_.appendChild(
                cd('tr', {}, cd ('th', {}, 'Effective Yearly Interest'),
                   cd('td', 'calc-number', effInt.toFixed(2) + '%'),
                   cd('td', 'budget-info', 'If you borrowed at this interest rate for a year, without making repayment what interest would you pay for the year? This does not include penalities. ', this.showInterestCalcDiv_,' Show working')));

            if (showWorking) {
                this.tableDiv_.appendChild(
                    cd('tr', {}, cd ('th', {}, 'Working'),
                       cd('td', {colspan: 2}, '100 * (Year End Amount - Loan Amount)/Loan Amount')));

                this.tableDiv_.appendChild(
                    cd('tr', {}, cd ('th', {}),
                       cd('td', {colspan: 2},  '= 100 * ('
                          + (lastE /100).toFixed(2) + ' - ' + (firstE/100).toFixed(2) + ') / ' +
                          (firstE/100).toFixed(2)
                         )));

                this.tableDiv_.appendChild(
                    cd('tr', {}, cd ('th', {}),
                       cd('td', {}, '= ' + effInt.toFixed(2) +'%')));

                
            }
        
        }
        this.tableDiv_.appendChild(cd('tr', {}, cd('td', {colspan: 3}, this.detail_)));
    }
    else {
        console.error('errors', this.helper_.errors());
    }
};


/**
 * @param {Date} date the first day that it can start on
 * @param {Date} start the actual start of the repeat
 * @param {number} period
 * @return {number}
 */
budget.widgets.calc.Loan.next = function(date, start, period) {
    const budgetT = aurora.db.schema.tables.base.budget;
    const periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);

    const rate = periodMeta.enumInfo[period].rate;
    let diffDays = Math.round(moment(start).diff(moment(date), 'd', true));

    if (diffDays >= 0) {
        return start;
    }

    let newDate = new Date(start.getTime());
    
    if (period == periodMeta.enum.monthly || period == periodMeta.enum.quarterly || period == periodMeta.enum.yearly) {
        let diffMonths = Math.ceil(-moment(start).diff(moment(date), 'M', true));
        let months = Math.round(rate  * 12/ 365);
        newDate.setMonth(newDate.getMonth() + Math.max(1, Math.ceil(diffMonths/months)) * months);
        return newDate;
    }
    let days = Math.floor(rate);

    newDate.setDate(newDate.getDate() + Math.max(1, Math.ceil(-diffDays/days)) * rate);

    return newDate;
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.calc.Loan.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.calc.Loan.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

