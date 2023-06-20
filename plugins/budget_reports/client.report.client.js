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
    this.scope_ = scope;
    let me = this;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let amess = aurora.messages;
    let cd = goog.dom.createDom;
    let reportT = aurora.db.schema.tables.base.client_report;
    let fromDiv = cd('div',{class: 'goog-inline-block'});
    let toDiv = cd('div',{class: 'goog-inline-block'});
    let dateDiv = cd('div',{},  cd('b', {},'From '), fromDiv, cd('b', {}, 'To '),  toDiv);
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    this.endDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(today));

    today.setMonth(today.getMonth() - 1);
    this.startDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(today));    

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
    let NAME = new recoil.structs.table.ColumnKey('name');
    let LAST_OWING = new recoil.structs.table.ColumnKey('last owing');
    let calcInt = recoil.util.ExpParser.instance.eval.bind(recoil.util.ExpParser.instance);
    let calc = v => {
        let res = calcInt(v);
        if (res == null) {
            return 0;
        }
        return res * 100;
    };
    

    let dataB = frp.liftB(function(tbl) {
        let res = new recoil.structs.table.MutableTable([reportT.cols.id], [reportT.cols.userid, NAME,  LAST_OWING, reportT.cols.owing, reportT.cols.referralFrom]);



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
                outRow.set(reportT.cols.userid, prevRow.get(reportT.cols.userid).db);
                outRow.set(NAME, (prevRow.get(reportT.cols.firstName) + ' ' + prevRow.get(reportT.cols.lastName)));
                outRow.set(reportT.cols.owing,
                           curUser.firstBudget.budgetid == null ? '-' : (curUser.firstBudget.owing/100).toFixed(2));
                outRow.set(LAST_OWING,
                           curUser.lastBudget.budgetid == null ? '-' : (curUser.lastBudget.owing/100).toFixed(2));
                outRow.set( reportT.cols.referralFrom, prevRow.get( reportT.cols.referralFrom) || 'Unknown');
                res.addRow(outRow);
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
        return res.freeze();
    }, this.reportB_);
    this.reportBody_.attach([
        {col: reportT.cols.userid, title: 'ID'},
        {col: NAME, title: 'Name'},
        {col:  reportT.cols.referralFrom, title: 'Referred From'},
        {col: reportT.cols.owing, title: 'Initial Owing'},
        {col: LAST_OWING, title: 'Final Owing'},
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
    let stringify = v => {
        if (v instanceof Element) {
            return v;
        }
        else {
            return '' + v;
        }
    };
    if (this.helper_.isGood()) {
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
                    tr.appendChild(cd('td', {}, stringify(data)));
                });
                
            });
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
