goog.provide('budget.widgets.import.ReviewBudget');

goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableWidget');
goog.require('budget.ImportRow');
goog.require('recoil.frp.logic');



/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.import.ReviewBudget = function(scope) {
    this.scope_ = scope;
    this.tableWidget_ = new recoil.ui.widgets.table.TableWidget(scope);    
};

/**
* @const
*/
budget.widgets.import.ReviewBudget.CALC_TYPES = {
        auto: 'Auto',
        manual: 'Manual',
        average: 'Average',
        total: 'Total',
        last: 'Last',
        perPeriod: 'Per Period'
            
};

/**
 * @const
 */
budget.widgets.import.ReviewBudget.TYPE_CALC = (function () {
    const budgetT = aurora.db.schema.tables.base.budget;
    const TYPES = budget.widgets.import.ReviewBudget.CALC_TYPES;
    let res = {};
    
    const periodInfo = aurora.db.schema.getMeta(budgetT.cols.period).enumInfo;
    const sum = (arr) => arr.reduce((a,v) => a + v.amount, 0);
    res[TYPES.auto] = (period, src, amount, days, override) => amount;
    res[TYPES.manual] = (period, src, amount, days, override) => override.amount;
    res[TYPES.average] = (period, src, amount, days, override) => sum(src) / src.length;
    res[TYPES.total] = (period, src, amount, days, override) => sum(src);
    res[TYPES.last] = (period, src, amount, days, override) => src[src.length -1].amount;
    res[TYPES.perPeriod] = (period, src, amount, days, override) => sum(src)/days * periodInfo[period].rate;
    return res;
})();    

/**
* @const
*/
budget.widgets.import.ReviewBudget.COLS = {
    ID: new recoil.structs.table.ColumnKey('id'),
    TYPE: new recoil.structs.table.ColumnKey('type'),
    CATEGORY: new recoil.structs.table.ColumnKey('cat'),
    PERIOD: new recoil.structs.table.ColumnKey('period'),
    CALC_TYPE: new recoil.structs.table.ColumnKey('type'),
    AMOUNT: new recoil.structs.table.ColumnKey('amount'),
    DETAIL: new recoil.structs.table.ColumnKey('detail'),
};

/**
 *
 * @param {!recoil.frp.Behaviour<!budget.widgets.BudgetImportCategory.Mappings>} mappingsB
 * @param {!recoil.frp.Behaviour} overridesB
 * @param {!recoil.frp.Behaviour<number>} startB
 * @param {!recoil.frp.Behaviour<number>} endB
 */
budget.widgets.import.ReviewBudget.prototype.attach = function(mappingsB, overridesB, startB, endB) {
    let frp = this.scope_.getFrp();
    const budgetT = aurora.db.schema.tables.base.budget;
    const entryT = budgetT.entries;
    const storedT = aurora.db.schema.tables.base.budget_mappings;

    const COLS = budget.widgets.import.ReviewBudget.COLS;
    const valueColumn = new recoil.ui.columns.Expr(COLS.AMOUNT, 'Amount', {decimalPlaces: 2});
    const detailColumn = new budget.widgets.import.CategorySumaryCol(COLS.DETAIL, 'Detail');
    
    const EntryType = aurora.db.schema.getEnum(storedT.entries.cols.importType);
    const periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);
    const entryMeta = aurora.db.schema.getMeta(storedT.entries.cols.importType);

    const TYPES = budget.widgets.import.ReviewBudget.CALC_TYPES;
    let TYPE_CALC = budget.widgets.import.ReviewBudget.TYPE_CALC;

    let toDate = recoil.ui.widgets.DateWidget2.convertLocaleDate;
    
    const decorator = function() {
        return new recoil.ui.RenderedDecorator(
            decorator,
            goog.dom.createDom('table', {class: 'budget-review'}));
    };
    
    let tableB = frp.liftBI((mappings, overrides, start, end) => {
        let tbl = new recoil.structs.table.MutableTable([COLS.ID], [
            COLS.CATEGORY, COLS.PERIOD, COLS.TYPE, COLS.CALC_TYPE, COLS.AMOUNT, COLS.DETAIL]);
        tbl.setMeta({'typeFactories': aurora.Client.typeFactories, tableDecorator: decorator});



        let days = Math.abs(moment(toDate(end)).diff(toDate(start), 'd')) + 1; // range is inclusive so ad
        
        tbl.setColumnMeta(COLS.CATEGORY, {type: 'string', editable: false});
        tbl.addColumnMeta(COLS.PERIOD, periodMeta);
        tbl.addColumnMeta(COLS.PERIOD, {editable: false});
        tbl.addColumnMeta(COLS.TYPE, entryMeta);
        tbl.addColumnMeta(COLS.TYPE, {editable: false});
        tbl.setColumnMeta(COLS.CALC_TYPE, {type: 'enum', list:[
            TYPES.auto, TYPES.manual, TYPES.average, TYPES.total, TYPES.last, TYPES.perPeriod]});
        tbl.setColumnMeta(COLS.AMOUNT, {type: 'string', editable: false});
        tbl.setColumnMeta(COLS.DETAIL, {days: days});


        let columns = new recoil.ui.widgets.TableMetaData();

        columns.add(COLS.TYPE, 'Type');
        columns.add(COLS.CATEGORY, 'Category');
        columns.add(COLS.CALC_TYPE, 'Calc Type');
        columns.add(COLS.PERIOD, 'Period');
        columns.addColumn(valueColumn);
        columns.addColumn(detailColumn);


        let byType = {};

        for (let cat in mappings) {
            for (let type in mappings[cat]) {
                let items = mappings[cat][type];
                byType[type] = byType[type] || {};
                byType[type][cat] = items;
            }
        }
        let pos = 0;
        for (let typeStr in byType) {
            for (let cat in byType[typeStr]) {
                let entry = byType[typeStr][cat];
                let row = new recoil.structs.table.MutableTableRow(pos++);
                let type = parseInt(typeStr,10);
                
                row.set(COLS.CATEGORY, cat);
                row.set(COLS.ID, pos);
                row.set(COLS.PERIOD, entry.period);
                row.set(COLS.TYPE, type);
                row.set(COLS.CALC_TYPE, TYPES.auto);
                let sign = type == EntryType.income ? 1 : - 1;
                row.set(COLS.AMOUNT, (sign * entry.amount / 100).toFixed(2));
                row.set(COLS.DETAIL, entry.src);

                let override = recoil.util.map.safeRecGet(overrides, [type, cat]);
                if (override) {
                    row.set(COLS.CALC_TYPE, override.calcType);
                    let calculator = TYPE_CALC[override.calcType];
                    let amount = calculator(override.period, entry.src, entry.amount/100, days, override);
                    
                    row.set(COLS.AMOUNT, typeof(amount) == 'string'? amount : (sign * amount).toFixed(2));

                    row.set(COLS.PERIOD, override.period);
                    row.addCellMeta(COLS.AMOUNT, {editable: override.calcType === TYPES.manual});
                    row.addCellMeta(COLS.PERIOD, {editable: true});
                    row.addCellMeta(COLS.DETAIL, {period: override.period, days});
                }
                

                tbl.addRow(row);
            }
        }
        
        
        
        return columns.applyMeta(tbl);
                                        
    }, (tbl) => {
        let newOverrides = {};

        tbl.forEach(row => {

            let calcType = row.get(COLS.CALC_TYPE);
            if (TYPES.auto != calcType) {
                let type = row.get(COLS.TYPE);
                let cat = row.get(COLS.CATEGORY);
                
                recoil.util.map.safeRecGet(newOverrides,[type, cat], {
                    amount: row.get(COLS.AMOUNT),
                    calcType: calcType,
                    period: row.get(COLS.PERIOD)
                });
            }
        });
        overridesB.set(newOverrides);
    }, mappingsB, overridesB, startB, endB);
                            

    this.tableWidget_.attachStruct(tableB);
};



/**
 * @return {!goog.ui.Component}
 */
budget.widgets.import.ReviewBudget.prototype.getComponent = function() {
    return this.tableWidget_.getComponent();
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.import.ReviewBudget.prototype.flatten = recoil.frp.struct.NO_FLATTEN;


/**
 * @private
 * @param {budget.widgets.BudgetImportCategory.CalculatedMap} calculatedCategory
 * @param {Object} entry an entry in the budget
 * @param {!budget.widgets.BudgetImportCategory.Calculated} info
 * @param {?} override
 * @param {number} days
 * @param {string} desc 
 * @param {number|string} type the import type
 */
budget.widgets.import.ReviewBudget.updateEntry_ = function (calculatedCategory, entry, info, override,days, desc, type) {
    let entryT = aurora.db.schema.tables.base.budget.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);

    let mul = entry.type == EntryType.income ? 1 : -1;
    entry.description = desc;
    
    if (override) {
        entry.period = override.period;
        const calculator = budget.widgets.import.ReviewBudget.TYPE_CALC[override.calcType];
        let res = calculator(override.period, info.src, info.amount, days, override);

        if (typeof (res) == 'string') {
            entry.value = res;
        }
        else {
            entry.value = '' + (mul * res).toFixed(2);
        }
        
    } else {
        entry.value = '' + (mul * info.amount / 100);
        entry.period = info.period;
    }

    
    if (calculatedCategory) {
        recoil.util.map.safeRecRemove(calculatedCategory, [desc, type], () => true);
    }
};


/**
 * @param {!recoil.structs.table.Table} budgetTbl an empty budget create from the template
 * @param {!budget.widgets.BudgetImportCategory.CalculatedMap} calculatedCategory cat->type->data
 * @param {number} days the number of days the import is for
 * @param {!budget.widgets.BudgetImportCategory.OverrideMap} overrides type->cat->data
 * @return {!recoil.structs.table.Table} the populated budgete
 */
budget.widgets.import.ReviewBudget.createBudgetEntries = function (budgetTbl, calculatedCategory, days, overrides) {
    const budgetT = aurora.db.schema.tables.base.budget;
    const entryT = budgetT.entries;
    const EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    const getPossibleTypes = budget.widgets.BudgetImportCategory.getPossibleTypes_;
    const TYPES = aurora.db.schema.getEnum(budget.widgets.BudgetImportCategory.COLS.TYPE);

    let newCats = {};
    for (let k in calculatedCategory) {
        newCats[k] =  {};
        for (let j in calculatedCategory[k]) {
            newCats[k][j] = calculatedCategory[k][j];
        }
    }
    calculatedCategory = newCats;
    
    // first find all the categories in the budget that already exist
    let entries;
    let bPeriod;
    
    budgetTbl.forEach(function(row) {
        entries = recoil.util.object.clone(row.get(budgetT.cols.entries));
        bPeriod = row.get(budgetT.cols.period);
    });
    entries.sort((x, y) => x.order - y.order);

    let entryMap = {};
    let freeEntries = {};
    
    // first
    let max = 0;
    entries.forEach(function(entry, idx) {
        max = Math.max(entry.order, max);
        let isIncome = true;
        let desc = entry.description.trim();
        let infos = calculatedCategory[desc];
        let possibleTypes = getPossibleTypes(entry.type);
        let info = null;
        let type = null;
        let override = null;
        for (let i = 0; !info && infos && i < possibleTypes.length; i++) {
            type = possibleTypes[i];
            info = infos[type];
            override = recoil.util.map.safeRecGet(overrides, [type, desc]);
        }
        if (info) {
            budget.widgets.import.ReviewBudget.updateEntry_(calculatedCategory, entry, info, override,  days, desc, /** @type {number} */(type));
        } else if (desc === '') {
            recoil.util.map.safeRecGet(freeEntries, [entry.type], []).push(entry);
        }
        else {
            entry.value = '';
            entry.period = null;
        }
    });
    budget.widgets.import.ReviewBudget.updateFreeEntries_(days, freeEntries, calculatedCategory, overrides);
    
    // update left over entries
    for (let desc in calculatedCategory) {
        for (let type in calculatedCategory[desc]) {
            let info = calculatedCategory[desc][type];
            let override =  recoil.util.map.safeRecGet(overrides, [type, desc]);
            let entryType = EntryType.household;
            if (type == TYPES.income) {
                entryType = EntryType.income;
            }
            else if (type == TYPES.debt) {
                entryType = EntryType.debt;
            }
            let entry = {
                type: entryType,
                order: ++max,
                id: entryT.cols.id.getDefault(),
                notes: '',
                arrears: '',
                owing: ''
            };
            budget.widgets.import.ReviewBudget.updateEntry_(null, entry, info, override, days, desc, type);
            entries.push(entry);
        }
        
    }
    return entries;
};


/**
 * @private
 * @param {number} days
 * @param {!Object<string,Object<string,?>>} freeEntries
 * @param {!budget.widgets.BudgetImportCategory.CalculatedMap} calculatedCategory
 * @param {!budget.widgets.BudgetImportCategory.OverrideMap} overrides
 */
budget.widgets.import.ReviewBudget.updateFreeEntries_ = function(days, freeEntries, calculatedCategory, overrides) {
    let getPossibleTypes = budget.widgets.BudgetImportCategory.getPossibleTypes_;
    let indexes = {};
    for (let desc in calculatedCategory) {
        for (let catType in calculatedCategory[desc]) {
            let info = calculatedCategory[desc][catType];
            let override =  recoil.util.map.safeRecGet(overrides, [catType, desc]);
            for (let entryType in freeEntries) {
                let entries = freeEntries[entryType];
                let possibleTypes = getPossibleTypes(entryType);
                if (possibleTypes.indexOf(parseInt(catType,10)) != -1) {
                    let idx = indexes[entryType] || 0;
                    if (idx < entries.length) {

                        budget.widgets.import.ReviewBudget.updateEntry_(calculatedCategory, entries[idx], info, override, days, desc, catType);
                        indexes[entryType] = ++idx;
                        break;
                    }
                }
            }
        }
    }
};

/**
 * @constructor
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.import.CategorySumary = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    const cd = goog.dom.createDom;

    this.table_ = cd('table', {class:'budget-category-summary budget-category-summary-collapse'});
    this.expandB_ = frp.createB(false);
    this.expandHelper_ = new recoil.ui.ComponentWidgetHelper(
        scope, this.table_, this,
        (helper) => {
            let v = this.expandB_.get();
            goog.dom.classlist.enable(this.table_, 'budget-category-summary-expand', v);
            goog.dom.classlist.enable(this.table_, 'budget-category-summary-collapse', !v);

        }
    );

    this.expandHelper_.attach(this.expandB_);

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.table_);

    
    this.open_ = cd('span', {class: 'budget-category-open'}, '\u25BC');
	this.close_ = cd('span', {class: 'budget-category-close'}, '\u25B2');

	this.open_.addEventListener("click", e => frp.accessTrans(() =>  this.expandB_.set(true)));
	this.close_.addEventListener("click", e => frp.accessTrans(() =>  this.expandB_.set(false)));

    this.dataHelper_ = new recoil.ui.ComponentWidgetHelper(scope, this.table_, this, this.updateData_);


        
};

budget.widgets.import.CategorySumary.options = recoil.ui.util.StandardOptions(
    'value', 'days'
);

/**
 *
 * @param {!Object| !recoil.frp.Behaviour<Object>} options
 */
budget.widgets.import.CategorySumary.prototype.attachStruct = function(options) {
    let frp = this.scope_.getFrp();
    let bound = budget.widgets.import.CategorySumary.options.bind(frp, options);


    this.dataHelper_.attach(bound.value(), bound.days());
};


/**
 *
 * @param {recoil.ui.WidgetHelper} helper
 * @param {!recoil.frp.Behaviour<!Array>} dataB
 * @param {!recoil.frp.Behaviour<number>} daysB
 * @private
 */

budget.widgets.import.CategorySumary.prototype.updateData_ = function(helper, dataB, daysB) {
    const cd = goog.dom.createDom;
    goog.dom.removeChildren(this.table_);
    
    if (helper.isGood()) {
	    let total = 0;
        let items = dataB.get();
        let days = daysB.get();
        
	    items.forEach(data => {
	        total += data.amount;
	    });
        
        this.table_.appendChild(
	        cd('tr', {class: 'budget-category-summary-total'},
		       cd('th', {colspan: 4},
		          'Total: $' + (total).toFixed(2) +
                  ', Average: $' + (total/(items.length)).toFixed(2) +
                  ', Per Week: $' + (7 * total/days).toFixed(2),
		          this.open_, this.close_
		          
		         )));
        items.forEach(data => {
	        let row = cd(
		        'tr', {class: 'budget-category-summary'},
		        cd('td', {},  recoil.ui.widgets.DateWidget2.convertLocaleDate(data.date).toDateString()),
		        cd('td', {}, data.particulars),
		        cd('td', {}, data.reference),
		        cd('td', {}, (data.amount).toFixed(2)));
	        this.table_.appendChild(row);
	    });

        
    }
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.import.CategorySumary.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.import.CategorySumary.prototype.flatten = recoil.frp.struct.NO_FLATTEN;



/**
 * @implements {recoil.ui.widgets.table.Column}
 * @template T
 * @constructor
 * @param {!recoil.structs.table.ColumnKey} key
 * @param {!recoil.ui.message.Message|string} name
 * @param {Object=} opt_meta
 */
budget.widgets.import.CategorySumaryCol = recoil.ui.widgets.table.makeStructColumn(budget.widgets.import.CategorySumary);
