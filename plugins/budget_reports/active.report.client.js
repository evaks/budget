goog.provide('budget.widgets.ActiveClientReport');


goog.require('aurora.Client');
goog.require('aurora.db.schema.tables.base.client_report');
goog.require('budget.messages');
goog.require('budget.widgets.Report');
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
budget.widgets.ActiveClientReport = function(scope) {
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
    const reportT = aurora.db.schema.tables.base.client_closed;
    let fromDiv = cd('div',{class: 'goog-inline-block'});
    let toDiv = cd('div',{class: 'goog-inline-block'});
    let dateDiv = cd('div',{}, cd('b', {},'From '), fromDiv, cd('b', {},' To '), toDiv);
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    this.endDateB_ = frp.createB(recoil.ui.widgets.DateWidget2.convertDateToLocal(today));

    // always 3 months
    this.startTimeB_ = frp.liftB(local => {
        let d = recoil.ui.widgets.DateWidget2.convertLocaleDate(local);
        d.setMonth(d.getMonth() - 3);
        d.setDate(d.getDate() + 1);
        return d.getTime();
    }, this.endDateB_);

    this.reportB_ = frp.switchB(frp.liftB((startTime, stop) => {
        let stopDate = recoil.ui.widgets.DateWidget2.convertLocaleDate(stop);
        // the query is exclusive increment the stopdate by 1
        stopDate.setDate(stopDate.getDate() + 1);
        let query = new recoil.db.Query();
        return scope.getDb().get(reportT.key, undefined, new recoil.db.QueryOptions({binds: {
            start: startTime, stop: stopDate.getTime()
        }}));
    }, this.startTimeB_, this.endDateB_));                     
                                          
    this.containerDiv_ = cd('div', {class: 'budget-report'}, dateDiv);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.containerDiv_);
    this.reportBody_ = new budget.widgets.Report(scope);
    const NAME = new recoil.structs.table.ColumnKey('name');
    let calcInt = recoil.util.ExpParser.instance.eval.bind(recoil.util.ExpParser.instance);
    let calc = v => {
        let res = calcInt(v);
        if (res == null) {
            return 0;
        }
        return res * 100;
    };
    
    let userCols = [reportT.cols.opened, reportT.cols.closed];
    
    let dataB = frp.liftB(function(tbl) {
        let  resTbl = tbl.createEmpty([], userCols.concat([NAME]));
        tbl.forEachModify(row => {
            row.set(NAME, (row.get(reportT.cols.firstName) + ' ' +row.get(reportT.cols.lastName)));
            resTbl.addRow(row);
        });
        return resTbl.freeze();
    }, this.reportB_);
    
    this.reportBody_.attach([
        {col: NAME, title: 'Name'},
        {col: reportT.cols.opened, title: 'Became New', sum: true},
        {col: reportT.cols.closed, title: 'Became Closed', sum: true},
        {col: reportT.cols.active, title: 'Active at end of period', sum: true},
        {col: reportT.cols.used, title: 'Used Service', sum: true},
        ], dataB);
    this.reportBody_.getComponent().render(this.containerDiv_);

    this.endWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.endWidget_.attachStruct({value: this.endDateB_, min: 19700105, step: 1});
    this.endWidget_.getComponent().render(toDiv);

    this.startWidget_ = new recoil.ui.widgets.DateWidget2(scope);
    this.startWidget_.attachStruct({value: frp.liftB(v => {
        return recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(v));
    }, this.startTimeB_), min: 19700105, step: 1, editable: false});
    this.startWidget_.getComponent().render(fromDiv);


};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.ActiveClientReport.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */
budget.widgets.ActiveClientReport.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

