goog.provide('budget.widgets.ClientReport');
goog.provide('budget.widgets.Report');

goog.require('aurora.Client');
goog.require('aurora.db.schema.tables.base.client_report');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.dom.classlist');
goog.require('goog.object');
goog.require('recoil.frp.Util');
goog.require('recoil.ui.frp.LocalBehaviour');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.ClientReport = function(scope) {
    /* gets appointments with users who are repeat active
       
       encase in another select to get active on maxdate
       

select id , userid, max(start) > $enddate - 5months active, max(if(userid is NULL, 0, 1) ) active, max(showed), max(missed) from (select a1.id id, a2.userid userid, a1.start, a1.showed showed, MOD(a1.showed + 1,2) as missed from appointments a1 LEFT join appointments a2 ON a1.userid = a2.userid and a2.start < a1.start and a2.start > a1.start - 5months ) a3 group by id, userid, a3.start;
*/
    this.scope_ = scope;
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let amess = aurora.messages;
    let cd = goog.dom.createDom;
    let reportT = aurora.db.schema.tables.base.client_report;
    const hoursT = aurora.db.schema.tables.base.client_hours;
    let fromDiv = cd('div',{class: 'goog-inline-block'});
    let toDiv = cd('div',{class: 'goog-inline-block'});
    let dateDiv = cd('div',{},  cd('b', {},'From '), fromDiv, cd('b', {}, 'To '),  toDiv);
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    this.endDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(today));

    today.setMonth(today.getMonth() - 1);
    this.startDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(today));    

    this.hoursB_ = frp.switchB(frp.liftB((start, stop) => {
        let query = new recoil.db.Query();
        return scope.getDb().get(hoursT.key, undefined, new recoil.db.QueryOptions({binds: {
            start: start, stop: stop
        }}));
        
    }, this.startDateB_, this.endDateB_));
    
    this.reportB_ = frp.switchB(frp.liftB((start, stop) => {
        let startDate = recoil.ui.widgets.DateWidget2.convertLocaleDate(start);
        let stopDate = recoil.ui.widgets.DateWidget2.convertLocaleDate(stop);
        stopDate.setDate(stopDate.getDate() + 1);
        let query = new recoil.db.Query();
//        let q = query.gte(query.field(reportT.cols.start), start);
        return scope.getDb().get(reportT.key, undefined, new recoil.db.QueryOptions({binds: {
            start: startDate.getTime(), stop: stopDate.getTime()
        }}));
    }, this.startDateB_, this.endDateB_));                     
                                          

    this.containerDiv_ = cd('div', {class: 'budget-report'}, dateDiv);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.containerDiv_);
    this.reportBody_ = new budget.widgets.Report(scope);
    const NAME = new recoil.structs.table.ColumnKey('name');
    const DISCHARGED = new recoil.structs.table.ColumnKey('discharged');
    const ATTENDED = hoursT.cols.scheduled;
    const MISSED = hoursT.cols.missed;
    let LAST_OWING = new recoil.structs.table.ColumnKey('last owing');
    let calcInt = recoil.util.ExpParser.instance.eval.bind(recoil.util.ExpParser.instance);
    let calc = v => {
        let res = calcInt(v);
        if (res == null) {
            return 0;
        }
        return res * 100;
    };
    
    let userCols = [LAST_OWING, DISCHARGED, reportT.cols.owing, reportT.cols.referralFrom];
    
    let dataB = frp.liftB(function(tbl, hours) {
        let  resTbl = hours.createEmpty([], userCols.concat([NAME]));
        let resUsers = new Map();


        let newRowInfo = () => ({
            id: null, userid: null, firstBudget: {}, lastBudget: {}});
        
        let curUser = newRowInfo();
        let prevRow = null;

        let budgetMatches = (info, id, when, min) => {
            if (info.budgetid == null) {
                info.budgetid = id;
                info.owing = 0;
                info.when = when;
                return true;
            }
            if (id === info.budgetid) {
                return true;
            }
            if ((min && when  < info.when) || (!min && when  > info.when ))  {
                info.budgetid = id;
                info.owing = 0;
                info.when = when;
                return true;
            }
            return false;
            
        };
        let pos =0;
        let doLastRow = () => {
            if (curUser.id !== null) {

                let outRow = new recoil.structs.table.MutableTableRow(pos++);
                let userId = prevRow.get(reportT.cols.userid).db;
                
                outRow.set(reportT.cols.userid, userId);

                let owing = curUser.firstBudget.budgetid == null ? null : (curUser.firstBudget.owing/100);
                let lastOwing = curUser.lastBudget.budgetid == null ? null : (curUser.lastBudget.owing/100);
                outRow.set(reportT.cols.owing,owing);
                outRow.set(LAST_OWING, lastOwing);
                outRow.set(DISCHARGED,owing == null || lastOwing == null ? null : Math.max(0, owing - lastOwing));
                outRow.set( reportT.cols.referralFrom, prevRow.get( reportT.cols.referralFrom) || 'Unknown');
                
                resUsers.set(userId, outRow);
                curUser = newRowInfo();
                
            }
        };
        tbl.forEach(row => {
            let id = row.get(reportT.cols.userid).db;
            let budgetid = row.get(reportT.cols.budgetid);

            // no budgets for this user
            if (!budgetid) {
                // if we had another client built up add it to the output
                doLastRow();
                prevRow = row;
                curUser.id = id;
                doLastRow();
                prevRow = null;
                return;
            }
            
            if (curUser.id !== id || budgetid === null) {
                doLastRow();
            }
            curUser.id = id;
            let when = budgetid ? BigInt(row.get(reportT.cols.createTime)) : null;
            budgetid = budgetid ? budgetid.db: null;
            
            
            if (budgetMatches(curUser.firstBudget, budgetid, when, true)) {
                curUser.firstBudget.owing += calc(row.get(reportT.cols.owing));
            } else if (budgetMatches(curUser.lastBudget, budgetid, when, false)) {
                curUser.lastBudget.owing += calc(row.get(reportT.cols.owing));
            }
            prevRow = row;
        });
        doLastRow();
        
        hours.forEachModify(row => {
            let id = row.get(hoursT.cols.userid);
            let usrRow = id ? resUsers.get(id.db) : null;
            userCols.forEach(c => {
                row.set(c, usrRow ? usrRow.get(c) : null);
            });
            let scheduled = Math.round(row.get(hoursT.cols.scheduled));
            let missed = Math.round(row.get(hoursT.cols.missed));
            row.set(ATTENDED, Math.round((scheduled - missed) / 6) / 10);
            row.set(MISSED, Math.round(missed / 6)/10);
            row.set(hoursT.cols.slots, row.get(hoursT.cols.slots) - row.get(hoursT.cols.missedSlots));
            row.set(NAME, (row.get(hoursT.cols.firstName) + ' ' +row.get(hoursT.cols.lastName)));
            resTbl.addRow(row);
        });

        return resTbl.freeze();
    }, this.reportB_, this.hoursB_);
    const currency = budget.widgets.Report.currency;
    
    this.reportBody_.attach([
        {col: hoursT.cols.userid, title: 'Link', render: v => {
            if (v) {
                return cd('a', {class: 'aurora-link-widget', href: '/client?id=' + v.db},cd('div'));
            }
            return '';
        }},
        {col: NAME, title: 'Name'},
        {col: ATTENDED, title: 'Hours Attended', sum: true},
        {col: MISSED, title: 'Hours Missed', sum: true},
        {col: hoursT.cols.slots, title: 'Sessions Attended', sum: true},
        {col: hoursT.cols.missedSlots, title: 'Sessions Missed', sum: true},
        {col: reportT.cols.referralFrom, title: 'Referred From' },
        {col: reportT.cols.owing, title: 'Initial Owing', render: currency, sum: true},
        {col: LAST_OWING, title: 'Final Owing', render: currency, sum: true},
        {col: DISCHARGED, title: 'Debt Retired', render: currency, sum: true},
        ], dataB);
    this.reportBody_.getComponent().render(this.containerDiv_);

    this.startWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.startWidget_.attachStruct({value: this.startDateB_, min: 19700105, step: 1});
    this.startWidget_.getComponent().render(fromDiv);

    this.endWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.endWidget_.attachStruct({value: this.endDateB_, min: 19700105, step: 1});
    this.endWidget_.getComponent().render(toDiv);


};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.ClientReport.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.ClientReport.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Report = function(scope) {
    this.scope_ = scope;
    let me = this;
    let cd = goog.dom.createDom;
    this.tableDiv_ = cd('table', {});
    this.errorsDiv_ = cd('div', {class: 'recoil-error'});
    this.containerDiv_ = cd('div', {class: 'budget-report'}, this.tableDiv_, this.errorsDiv_);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.containerDiv_);
    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);

    
};

/**
 * @private
 */
budget.widgets.Report.prototype.update_ = function() {
        let cd = goog.dom.createDom;
    goog.dom.removeChildren(this.tableDiv_);
    goog.dom.removeChildren(this.errorsDiv_);
    let stringify = (v, info) => {
        if (info.render) {
            return info.render(v);
        }
        if (v instanceof Element) {
            return v;
        }
        else if (v == null) {
            return '-';
        }
        else {
            return '' + v;
        }
    };
    if (this.helper_.isGood()) {
        let sums = new Map();
        
        let tbl = this.rowsB_.get();
        if (tbl.size() > 0) {
            let columns = this.columnsB_.get();
            let header = cd('tr',{});
            this.tableDiv_.appendChild(header);
            columns.forEach(info => {
                header.appendChild(cd('th', {}, info.title));
            });
            
            tbl.forEach(row => {
                let tr = cd('tr', {});
                this.tableDiv_.appendChild(tr);
                columns.forEach(info => {
                    let data = row.get(info.col);
                    if (info.sum) {
                        let v = (sums.get(info) || 0) + (data || 0);
                        sums.set(info, v);
                    }
                    tr.appendChild(cd('td', {}, stringify(data, info)));
                });
                
            });
            if (sums.size > 0) {
                let tr = cd('tr', {class: 'total'});
                this.tableDiv_.appendChild(tr);
                columns.forEach(info => {
                    let total = sums.get(info);
                    if (total == undefined) {
                        tr.appendChild(cd('td', {}));
                    }
                    else {
                        tr.appendChild(cd('td', {}, stringify(total, info)));
                    }
                });
            }
            
        }
    }
    else if (this.helper_.errors().length > 0) {
        this.helper_.errors().forEach(error => {
            let e = cd('div', {}, error.message ? error.message : error.toString());
            
            goog.events.listen(e, goog.events.EventType.CLICK, () => {
                console.error(error);
            });
            this.errorsDiv_.appendChild(e);
        });
    }
        

};
/**
 * @param {number} v
 * @return {string}
 */
budget.widgets.Report.currency = function (v) {
    return v == undefined ? '-' : v.toFixed(2);
};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Report.prototype.getComponent = function() {
    return this.component_;
};

/**
 * @param {recoil.frp.Behaviour<Array>|Array} columns
 * @param {recoil.frp.Behaviour<recoil.structs.table.Table>} rowsB
 */
budget.widgets.Report.prototype.attach = function(columns, rowsB) {
    let util = new recoil.frp.Util(this.scope_.getFrp());
    
    this.columnsB_ = util.toBehaviour(columns).debug('columns');
    this.rowsB_ = rowsB;
    this.helper_.attach(this.columnsB_, this.rowsB_);
};
 
/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.Report.prototype.flatten = recoil.frp.struct.NO_FLATTEN;
