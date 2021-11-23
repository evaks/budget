goog.provide('budget.widgets.calc.Income');


goog.require('aurora.db.schema.tables.base.tax');
goog.require('goog.dom');
goog.require('recoil.frp.Frp');


/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number} userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.calc.Income = function(scope, userid) {
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

    const INCOME_TYPE = {
        NET: 'Net Income (What you get in your account)',
        GROSS: 'Gross (Income before tax and other deductions)'
    };
    let amountB = frp.createB(0);
    let periodB = frp.createB(periodMeta.enum.fortnightly);
    let outPeriodB = frp.createB(periodMeta.enum.fortnightly);
    let typeB = frp.createB(INCOME_TYPE.GROSS);
    let savingsB = frp.createB(0);
    let studentLoanB = frp.createB(false);
    let otherB = frp.createB(0);
    const cls = budget.widgets.calc.Income;



    let taxB = scope.getDb().get(taxT.key);
    let studentLoanTblB = scope.getDb().get(studentT.key);
    let accB = scope.getDb().get(accT.key);
    this.inPeriodWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.outPeriodWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.incomeTypeWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.amountWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.outAmountWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.checkAmountWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.otherWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.studentLoanWidget_ = new recoil.ui.widgets.CheckboxWidget(scope);
    this.dateWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.savingsWidget_ = new recoil.ui.widgets.NumberWidget(scope);
    this.totalTypeWidget_ = new recoil.ui.widgets.LabelWidget(scope);
    /**
     * @param {...} var_els
     * @return {!Element}
     */
    let makeRow = function(var_els) {
        let td1 = cd('th');
        let td2 = cd('td', {class: 'calc-data'});
        let row = cd('tr', {}, td1, td2);

        for (let i = 0; i < arguments.length; i++) {
            let arg = arguments[i];
            let td = i == 0 ? td1 : td2;
            if (goog.isFunction(arg.getComponent)) {
                arg.getComponent().render(td);
            }
            else if (goog.isString(arg)) {
                td.appendChild(goog.dom.createTextNode(arg));
            }
            else {
                td.appendChild(arg);
            }
        }
        return row;
    };
    let container = cd(
        'table', {class: 'calc-results'},
        makeRow('Amount', this.amountWidget_, this.inPeriodWidget_, this.incomeTypeWidget_),
        makeRow('Date', this.dateWidget_),
        makeRow('Student Loan', this.studentLoanWidget_),
        makeRow('Retirement Savings (Kiwisaver)', this.savingsWidget_, '%'),
        makeRow('Other Deductions', this.otherWidget_),
        cd('tr', {}, cd('td', {colspan: 2, class: 'calc-result-sep'})),
        makeRow(this.totalTypeWidget_, this.outAmountWidget_, this.outPeriodWidget_),
//        makeRow('', this.checkAmountWidget_),
    );

    let outAmountB = frp.liftB(function(type, date, amount, period, savings, hasStudentLoan, other, outPeriod, tax, acc, studentLoanTable) {
        let studentLoan = hasStudentLoan ? studentLoanTable : null;
        if (type === INCOME_TYPE.NET) {
            return cls.calcGrossIncome(tax, acc, studentLoan, date, amount, period, savings, other, outPeriod);
        }
        else {
            return cls.calcNetIncome(tax, acc, studentLoan, date, amount, period, savings, other, outPeriod);

        }
    }, typeB, dateB, amountB, periodB, savingsB, studentLoanB, otherB, outPeriodB, taxB, accB, studentLoanTblB);

    let checkAmountB = frp.liftB(function(type, date, amount, period, savings, hasStudentLoan, other, outPeriod, tax, acc, studentLoanTable) {
        let outRate = periodMeta.enumInfo[outPeriod].rate;
        let inRate = periodMeta.enumInfo[period].rate;
        let newOther = Math.round(other * 100 * outRate / inRate) / 100;
        let studentLoan = hasStudentLoan ? studentLoanTable : null;
        if (type !== INCOME_TYPE.NET) {
            return cls.calcGrossIncome(tax, acc, studentLoan,
                                       date, amount, outPeriod, savings, newOther, period);
        }
        else {
            return cls.calcNetIncome(tax, acc, studentLoan, date, amount, outPeriod, savings, newOther, period);

        }
    }, typeB, dateB, outAmountB, periodB, savingsB, studentLoanB, otherB, outPeriodB, taxB, accB, studentLoanTblB);

    let ex = function(valueB) {
        let v = {};
        goog.object.extend(v, periodMeta, {value: valueB});
        return v;
    };
    this.studentLoanWidget_.attachStruct({value: studentLoanB});
    this.inPeriodWidget_.attachStruct(ex(periodB));
    this.outPeriodWidget_.attachStruct(ex(outPeriodB));
    this.incomeTypeWidget_.attachStruct({
        list: [INCOME_TYPE.GROSS, INCOME_TYPE.NET],
        value: typeB});

    this.amountWidget_.attachStruct({value: amountB, min: 0, max: 999999999, step: 0.01});

    this.outAmountWidget_.attachStruct({value: outAmountB, editable: false, displayLength: -1, step: 0.01});
    this.checkAmountWidget_.attachStruct({value: checkAmountB, editable: false, displayLength: -1, step: 0.01});
    this.otherWidget_.attachStruct({value: otherB, min: 0, max: 9999999, step: 0.01});

    this.dateWidget_.attachStruct({value: dateB});
    this.savingsWidget_.attachStruct({value: savingsB, min: 0, max: 90, step: 0.01});
    this.totalTypeWidget_.attachStruct({name: frp.liftB(x => x == INCOME_TYPE.NET ? 'Gross Income' : 'Net Income', typeB)});

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

};

/**
 * @param {!Array<{amount:number, rate: number, net:number}>} taxTiers
 * @param {number} grossAmount in cents
 * @return {{amount:number, rate: number, net:number}}
 */

budget.widgets.calc.Income.getGrossTier = function(taxTiers, grossAmount) {
    let tier = taxTiers[0];

    for (let i = 0; i < taxTiers.length; i++) {
        if (grossAmount < taxTiers[i].amount) {
            break;
        }
        tier = taxTiers[i];
    }
    return tier;
};


/**
 * @param {boolean} weekly
 * @param {number} p
 * @return {number}
 */
budget.widgets.calc.Income.toYearly = function(weekly, p) {
    const budgetT = aurora.db.schema.tables.base.budget;
    const periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);
    if (weekly) {
        return 52 / periodMeta.enumInfo[p].weeklyRate;
    }
    return 365 / periodMeta.enumInfo[p].rate;
};


/**
 * @param {!recoil.structs.table.TableInterface} tax
 * @param {!recoil.structs.table.TableInterface} acc
 * @param {recoil.structs.table.TableInterface} studentLoan
 * @param {number} date
 * @param {number} amount in $, net
 * @param {number} period
 * @param {number} savings as 100 * %
 * @param {number} other in $ other deductions after tax
 * @param {number} outPeriod
 * @return {number}
 */
budget.widgets.calc.Income.calcGrossIncome = function(tax, acc, studentLoan, date, amount, period, savings, other, outPeriod) {
    let taxTiers = budget.widgets.calc.Income.getTiers(tax, acc, studentLoan, date);
    const budgetT = aurora.db.schema.tables.base.budget;
    let weekly = true;

    const toYearly = budget.widgets.calc.Income.toYearly;
    const outAdj = 1 / toYearly(weekly, outPeriod);
    const adj = toYearly(weekly, period);

    let otherYearly = Math.round(other * adj * 100);
    let yearlyNet = Math.round(Math.round(amount * 100) * adj) + otherYearly;

    // savings is hard its a percent of original amount but that is tiered
    // but we need to add it back now

    //77,192.54

    let yearlyGross = 0;
    for (let i = 0; i < taxTiers.length; i++) {
        let tier = taxTiers[i];
        yearlyGross = Math.round((yearlyNet + tier.amount - tier.rate * tier.amount - tier.net) / (1 - tier.rate - savings / 100));
        if (i + 1 === taxTiers.length || taxTiers[i + 1].amount > yearlyGross) {
            break;
        }
    }
    return Math.round(yearlyGross * outAdj) / 100;

};


/**
 * @param {!recoil.structs.table.TableInterface} tax
 * @param {!recoil.structs.table.TableInterface} acc
 * @param {recoil.structs.table.TableInterface} studentLoan
 * @param {number} date
 * @param {number} amount in $, gross
 * @param {number} period
 * @param {number} savings as 100 * %
 * @param {number} other in $ other deductions after tax
 * @param {number} outPeriod
 * @return {number}
 */
budget.widgets.calc.Income.calcNetIncome = function(tax, acc, studentLoan, date, amount, period, savings, other, outPeriod) {
    let taxTiers = budget.widgets.calc.Income.getTiers(tax, acc, studentLoan, date);
    const budgetT = aurora.db.schema.tables.base.budget;
    const periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);
    const toYearly = budget.widgets.calc.Income.toYearly;
    const weekly = true;
    const adj = toYearly(weekly, period);
    const outAdj = 1 / toYearly(weekly, outPeriod);

    let yearly = Math.round(Math.round(amount * 100) * adj);
    let otherYearly = Math.round(other * 100 * adj + yearly * savings / 100);

    let taxPaid = 0;
    let tier = taxTiers[0];

    for (let i = 0; i < taxTiers.length; i++) {
        if (yearly < taxTiers[i].amount) {
            break;
        }

        tier = taxTiers[i];
    }



    let preSavings = tier.net + (yearly - tier.amount) * (1 - tier.rate);

    return Math.round((preSavings - otherYearly) * outAdj) / 100;

};

/**
 * things like acc and student loan require
 * the tiers to be adjusted
 * @param {!Array<{amount:number, rate: number, net:number}>} tiers
 * @param {{min:?number, max:?number, rate: number}} adjIn
 * @return {!Array<{amount:number, rate: number, net:number}>}
 */
budget.widgets.calc.Income.adjustTiers_ = function(tiers, adjIn) {
    let res = [];
    let prev = {amount: 0, net: 0, rate: 0};
    let adj = {rate: adjIn.rate, min: adjIn.min, max: adjIn.max};
    let prevNonAccRate = 0;
    tiers.sort(function(x, y) {return x.amount - y.amount;});

    for (let i = 0; i < tiers.length; i++) {
        let t = tiers[i];

        let tMin = t.amount;
        let tMax = i + 1 === tiers.length ? null : tiers[i + 1].amount;

        if (adj.min != null) {
            if (adj.min < tMax && adj.min >= tMin) {
                res.push({
                    amount: tMin,
                    rate: t.rate
                });
                res.push({amount: adj.min, rate: t.rate + adj.rate});
            }
            else if (adj.min < tMin) {
                res.push({amount: tMin, rate: t.rate + adj.rate});
            }
            else {
                res.push({amount: tMin, rate: t.rate});
            }
        }
        else if (adj.max != null && adj.max >= tMin) {
            res.push({
                amount: tMin,
                rate: t.rate + adj.rate
            });
            if (adj.max < tMax) {
                res.push({
                    amount: adj.max,
                    rate: t.rate
                });
            }
        }
        else {
            res.push({amount: t.amount, rate: t.rate});
        }
    }

    res.sort(function(x, y) {return x.amount - y.amount;});
    return res;
};

/**
 * @param {!recoil.structs.table.TableInterface} taxInfo
 * @param {!recoil.structs.table.TableInterface} accInfo
 * @param {recoil.structs.table.TableInterface} studentLoanInfo
 * @param {number} date
 * @return {!Array<{amount:number, rate: number, net:number}>}
 */
budget.widgets.calc.Income.getTiers = function(taxInfo, accInfo, studentLoanInfo, date) {
    const taxT = aurora.db.schema.tables.base.tax;
    const accT = aurora.db.schema.tables.base.acc;
    const studentT = aurora.db.schema.tables.base.student_loan;
    let tRow = null;
    let maxRow = null;
    let minRow = null;
    taxInfo.forEach(function(row) {
        if (!minRow || row.get(taxT.cols.start) < minRow.get(taxT.cols.start)) {
            minRow = row;
        }
        if (!maxRow || row.get(taxT.cols.start) > maxRow.get(taxT.cols.start)) {
            maxRow = row;
        }
        if (row.get(taxT.cols.start) <= date && date < row.get(taxT.cols.stop)) {
            tRow = row;
        }
    });
    let acc = {min: null, max: 0, rate: 0};
    accInfo.forEach(function(row) {
        if (row.get(accT.cols.start) <= date && date < row.get(accT.cols.stop)) {
            acc = {
                min: null,
                max: row.get(accT.cols.limit),
                rate: row.get(accT.cols.rate)
            };
        }

    });

    let student = null;
    if (studentLoanInfo) {
        studentLoanInfo.forEach(function(row) {
            if (row.get(studentT.cols.start) <= date && date < row.get(studentT.cols.stop)) {
                student = {
                    min: row.get(studentT.cols.weeklyMin) * 52,
                    max: null,
                    rate: row.get(studentT.cols.rate)
                };
            }

        });

    }
    if (!tRow) {
        if (date < minRow.get(taxT.cols.start)) {
            tRow = minRow;
        }
        else {
            tRow = maxRow;
        }
    }

    let tiers = goog.array.clone(tRow.get(taxT.cols.tiers));
    let res = budget.widgets.calc.Income.adjustTiers_(
        tiers, acc);

    if (student) {
        res = budget.widgets.calc.Income.adjustTiers_(
            res, /** @type {?} */ (student));
    }
    let prevNet = 0;
    return res.map(function(v, idx) {
        let prevAmount = idx == 0 ? 0 : res[idx - 1].amount;
        let prevRate = idx == 0 ? 0 : res[idx - 1].rate;

        let net = prevNet + Math.round((v.amount - prevAmount) * (1 - prevRate / 10000));
        prevNet = net;
        return {amount: v.amount, rate: v.rate / 10000, net: net};
    });
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.calc.Income.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.calc.Income.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

