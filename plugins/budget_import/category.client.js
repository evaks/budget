goog.provide('budget.widgets.BudgetImportCategory');


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
budget.widgets.BudgetImportCategory = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let catContainer = cd('div', {class: 'budget-import-category-list'});
    let dateContainer = cd('div', {class: 'budget-import-category-dates'});
    let container = cd('div', {}, cd('h2', {}, 'Select Categories'), dateContainer, catContainer);

    this.pager_ = new recoil.ui.widgets.table.PagedTableWidget(scope, true, false);

    this.dateWidgets_ = [new recoil.ui.widgets.DateWidget2(scope), new recoil.ui.widgets.DateWidget2(scope)];
    this.dateWidgets_[1].getComponent().render(dateContainer);
    dateContainer.appendChild(goog.dom.createTextNode('To'));
    this.dateWidgets_[0].getComponent().render(dateContainer);
    dateContainer.appendChild(goog.dom.createTextNode('Statement Dates From'));


    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);

    //    this.tableWidget_.getComponent().render(catContainer);
    this.pager_.getComponent().render(catContainer);
};

/**
 * @private
 * @return {!recoil.ui.RenderedDecorator}
 */
budget.widgets.BudgetImportCategory.linkCellDecorator_ = function() {
    return new recoil.ui.RenderedDecorator(
        budget.widgets.BudgetImportCategory.linkCellDecorator_,
        goog.dom.createDom('td', {class: 'budget-import-link'}));
};

/**
 * a map particulars->ref->array of ids
 * @typedef {Object<string,Object<string,!Array<string>>>}
 */
budget.widgets.BudgetImportCategory.LinkMap;

/**
 * @typedef {{description:string,row:Object}}
 */
budget.widgets.BudgetImportCategory.StoredMappingEntry;
/**
 * an import catorory once every category is joined
 * @typedef {{amount:number,period:number}} note the amount is in cents
 */
budget.widgets.BudgetImportCategory.Calculated;


/**
 * an import catorory once every category is joined
 * @typedef {Object<string,!Object<string,!budget.widgets.BudgetImportCategory.Calculated>>} 
 */
budget.widgets.BudgetImportCategory.CalculatedMap;


/**
 * lets the user override an automatic category
 * @typedef {{amount:number,period:number}} note the amount is in cents
 */
budget.widgets.BudgetImportCategory.Override;

/**
 * lets the user override an automatic category, type->cat->data
 * @typedef {Object<string,!Object<string,!budget.widgets.BudgetImportCategory.Override>>} 
 */
budget.widgets.BudgetImportCategory.OverrideMap;

/**
 * @typedef {{type: number, date: number, amount: number}}
 */
budget.widgets.BudgetImportCategory.MappingsSrc;

/**
 * @typedef {Object<string,{amount: numer, period:number, src:!Array<budget.widgets.BudgetImportCategory.MappingsSrc>}>}
 */
budget.widgets.BudgetImportCategory.Mappings;

/**
 * type is Budget Entry type
 * date in yyyymmdd format
 * amount in dollars
 * @typedef {{type:number,date:number,amount:number}}
 */
budget.widgets.BudgetImportCategory.CategoryInfo;

/**
 * category -> importType -> data
 * @typedef {Object<string,Object<string,!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>>>}
 */
budget.widgets.BudgetImportCategory.CategoryInfoMap;

/**
 * @return {!recoil.frp.Behaviour<!recoil.ui.BoolWithExplanation>}
 */
budget.widgets.BudgetImportCategory.prototype.createValidateB = function() {
    let frp = this.scope_.getFrp();
    let CATEGORY = budget.widgets.BudgetImportCategory.COLS.CATEGORY;
    const PAGE_SIZE = budget.widgets.BudgetImportCategory.PAGE_SIZE;
    return frp.liftB(function(mappings, startDate, endDate) {
        if (startDate > endDate) {
            return new recoil.ui.BoolWithExplanation(false, budget.messages.START_DATE_MUST_BE_BEFORE_END_DATE);
        }
        let remaining = 0;
        // every visible category must be filled out
        let pages = [];
        
        let pos = 0;
        mappings.forEach(function(row) {
            let factory = row.getCellMeta(CATEGORY).cellWidgetFactory;
            let val = row.get(CATEGORY) || '';

            if (val.trim().length == 0 && factory !== null) {
                remaining++;
                let page = Math.floor( pos/PAGE_SIZE + 1);
                if (pages.length == 0 || pages[pages.length -1 ] != page) {
                    pages.push(page);
                }

            }
            pos++;

        });
        if (remaining != 0) {
            return new recoil.ui.BoolWithExplanation(
                false,
                budget.messages.FILL_OUT_ALL_CATEGORIES.resolve({pages: budget.widgets.BudgetImportCategory.formatPages(pages), remaining}));
        }
        return recoil.ui.BoolWithExplanation.TRUE;
    }, this.mappingsB_, this.dateRangeBs_[0], this.dateRangeBs_[1]);

};

/**
 * @param {!Array<number>} pages
 * @return {string}
 */
budget.widgets.BudgetImportCategory.formatPages = function (pages) {
    if (pages.length == 0) {
        return '';
    }
    let res = [];
    let start = pages[0];
    let cur = start;
    for (let i = 1; i < pages.length; i++) {
        let page = pages[i];
        if (page > cur + 1) {
            if (cur == start) {
                res.push(start);
            }
            else {
                res.push(start + ' - ' + cur);
            }
            start = page;
        }
        cur = page;
    }

    if (cur == start) {
        res.push(start);
    }
    else {
        res.push(start + ' - ' + cur);
    }

    return res.join(', ');
        
};
/**
 * @param {!Array<!budget.ImportRow>} rows
 * @param {!recoil.structs.table.Table} storedMappingsIn
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 *
 */

budget.widgets.BudgetImportCategory.createDefaultMappings = function(rows, storedMappingsIn) {
    let entryT = aurora.db.schema.tables.base.budget.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let COLS = budget.widgets.BudgetImportCategory.COLS;
    var tbl = new recoil.structs.table.MutableTable([COLS.ID], [COLS.DATE, COLS.PARTICULARS, COLS.REF, COLS.CATEGORY, COLS.AMOUNT, COLS.SPLIT, COLS.TYPE, COLS.ORIG_TYPE, COLS.ORIG_CATEGORY, COLS.LINK]);
    let storedT = aurora.db.schema.tables.base.budget_mappings;
    let TYPES = aurora.db.schema.getEnum(storedT.entries.cols.importType);

    let storedMappings = budget.widgets.BudgetImportCategory.createStoredMappings(storedMappingsIn);
    tbl.setColumnMeta(COLS.DATE, {type: 'date', editable: false});
    tbl.setColumnMeta(COLS.PARTICULARS, {type: 'string', editable: false});
    tbl.setColumnMeta(COLS.REF, {type: 'string', editable: false});
    tbl.setColumnMeta(COLS.AMOUNT, {type: 'number', editable: false, displayLength: -1, min: -100000, max: 100000, step: 0.01});
    tbl.setColumnMeta(COLS.TYPE, aurora.db.schema.getMeta(COLS.TYPE));
    tbl.setColumnMeta(COLS.LINK, {type: 'boolean', cellDecorator: budget.widgets.BudgetImportCategory.linkCellDecorator_});
    let linkMap = {};
    let linkIdMap = {};
    let amountMap = {};
    rows.sort(function(x, y) { return x.date - y.date;});
    rows.forEach(function(item, i) {
        let row = new recoil.structs.table.MutableTableRow(i);

        row.set(COLS.ID, i + '');
        row.set(COLS.DATE, recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(item.date)));
        row.set(COLS.PARTICULARS, item.description);
        row.set(COLS.REF, item.memo);
        let isIncome = item.amount > 0;
        let lookupOrder = isIncome ? [EntryType.income, EntryType.household, EntryType.debt, null] : [EntryType.household, EntryType.debt, EntryType.income, null];

        let lookup = recoil.util.map.safeRecGet(storedMappings, [item.description, item.memo]);
        if (lookup) {
            for (let type in lookup) {
                row.set(COLS.CATEGORY, lookup[type].description);
                row.set(COLS.TYPE, lookup[type].importType);
                break;
            }

        }
        else {
            row.set(COLS.CATEGORY, '');
            row.set(COLS.TYPE, isIncome ? TYPES.income : TYPES.payment);
        }
        row.set(COLS.LINK, true);
        row.set(COLS.ORIG_TYPE, row.get(COLS.TYPE));
        row.set(COLS.ORIG_CATEGORY, '');
        row.set(COLS.AMOUNT, item.amount);
        row.set(COLS.SPLIT, false);
        recoil.util.map.safeRecGet(linkMap, [item.description, item.memo], []).push(i);
        recoil.util.map.safeRecGet(amountMap, [item.description, item.amount], []).push(i);
        tbl.addRow(row);

        // add extra split rows
        if (lookup) {
            for (let type in lookup) {
                budget.widgets.BudgetImportCategory.addSplitRows_(tbl, row, lookup[type], item);
                break;
            }
        }
    });

    for (let desc in linkMap) {
        // if all the memos are just 1 long they the memo may change if
        // so then link it based on the amount
        let allSingle = budget.widgets.BudgetImportCategory.addLinkIds_(linkMap[desc], linkIdMap);

        if (amountMap[desc]) {
            if (allSingle) {
                budget.widgets.BudgetImportCategory.addLinkIds_(amountMap[desc], linkIdMap);
            }
            else {
                delete amountMap[desc];
            }
        }
    }

    tbl.setMeta({'typeFactories': aurora.Client.typeFactories, linkMap: linkMap, linkAmountMap: amountMap, linkIdMap: linkIdMap});

    return tbl.freeze();

};

/**
 * @param {Object<?,!Array<number>>} map
 * @param {!Object<number,!Array<number>>} linkIdMap
 * @return {boolean} true if all the items a just single values
 */
budget.widgets.BudgetImportCategory.addLinkIds_ = function (map, linkIdMap) {
    let allSingle = true; 
    
    for (let key in map) {
        let arr = map[key];
        allSingle = allSingle && arr.length == 1;
        if (arr.length > 1) {
            
            for (let i = 0; i < arr.length; i++) {
                for (let j = 0; j < arr.length; j++) {
                    if (j !== i) {
                        recoil.util.map.safeRecGet(linkIdMap, [arr[i]], []).push(arr[j]);
                    }
                }
            }
        }
    }
    return allSingle;
};

/**
 * @return {!recoil.frp.Behaviour<!budget.widgets.BudgetImportCategory.Mappings>}
 */
budget.widgets.BudgetImportCategory.prototype.getCategories = function () {
    let frp = this.scope_.getFrp();

    return frp.liftB(
        (mappings, bPeriod, start, end) => budget.widgets.BudgetImportCategory.calculateCategories(mappings, bPeriod, start, end),
        this.mappingsB_, this.budgetPeriodB_, this.dateRangeBs_[0], this.dateRangeBs_[1]);
};
/**
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} mappingsSourceB
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} budgetB
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} storedMappingsB
 * @param {!Array<!recoil.frp.Behaviour<number>>} dateRangeBs
 */
budget.widgets.BudgetImportCategory.prototype.attach = function(mappingsSourceB, budgetB, storedMappingsB, dateRangeBs) {
    let COLS = budget.widgets.BudgetImportCategory.COLS;
    let categoryCol = new aurora.columns.Selectize(COLS.CATEGORY, 'Category', {
        maxValues: 1,
        create: function (v) { return v;},
        createOnBlur: true,
        placeholder: 'Enter a category',
        createFilter: function (v) { return v && v.length > 0;}
    });
    let TYPES = aurora.db.schema.getEnum(COLS.TYPE);
    let baseTypes = [TYPES.income, TYPES.payment, TYPES.transfer, TYPES.debt];
    let frp = this.scope_.getFrp();
    let budgetT = aurora.db.schema.tables.base.budget;
    let entryT = budgetT.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let descriptionMeta = aurora.db.schema.getMeta(entryT.cols.description);

    this.dateWidgets_[0].attachStruct({value: dateRangeBs[0]});
    this.dateWidgets_[1].attachStruct({value: dateRangeBs[1]});


    let delSplitFactory = function(scope, cellB) {
        let ico = goog.dom.createDom('i', {class: 'fas fa-minus-square'});
        var frp = scope.getFrp();
        var widget = new recoil.ui.widgets.ButtonWidget(scope);
        var value = recoil.frp.table.TableCell.getValue(frp, cellB);
        var meta = recoil.frp.table.TableCell.getMeta(frp, cellB);
        widget.attachStruct(recoil.frp.struct.extend(frp, meta, {action: value, classes: ['aurora-icon-button'], text: ico}));
        return widget;
    };

    let addSplitFactory = function(scope, cellB) {
        let ico = goog.dom.createDom('i', {class: 'fas fa-plus-square'});
        var frp = scope.getFrp();
        var widget = new recoil.ui.widgets.ButtonWidget(scope);
        var value = recoil.frp.table.TableCell.getValue(frp, cellB);
        var meta = recoil.frp.table.TableCell.getMeta(frp, cellB);
        widget.attachStruct(recoil.frp.struct.extend(frp, meta, {action: value, classes: ['aurora-icon-button'], text: ico}));
        return widget;
    };

    let delSplitDisabled = new recoil.ui.BoolWithExplanation(false, budget.messages.YOU_MUST_HAVE_AT_LEAST_2_SPLITS);

    let mappingsB = frp.liftBI(function(tbl, budget) {
        let linkMap = tbl.getMeta().linkMap;
        let linkAmountMap = tbl.getMeta().linkAmountMap;
        let columns = new recoil.ui.widgets.TableMetaData();

        columns.add(COLS.DATE, 'Date');
        columns.add(COLS.PARTICULARS, 'Particulars');
        columns.add(COLS.REF, 'Reference');
        columns.add(COLS.AMOUNT, 'Amount');
        columns.add(COLS.TYPE, 'Type');
        columns.addColumn(categoryCol);
        columns.add(COLS.SPLIT, '');
        columns.add(COLS.LINK, '');
        let payments = [];
        let income = [];
        budget.forEach(function(budgetRow) {
            let entries = budgetRow.get(budgetT.cols.entries);
            entries.forEach(function(entry) {
                if (!entry.description || entry.description.trim() === '') {
                    return;
                }
                if (entry.type == EntryType.income) {
                    income.push(entry.description);
                }
                else {
                    payments.push(entry.description);
                }
            });
        });

        function removeDups(a) {
            return a.sort((x, y) => x.localeCompare(y, undefined, {sensitivity: 'accent'}))
                .filter(function(v, idx, arr) {
                    if (!v) {
                        return false;
                    }
                    return idx === 0 || v.localeCompare(arr[idx - 1], undefined, {sensitivity: 'accent'});});
        }
        payments = removeDups(payments);
        income = removeDups(income);



        let res = tbl.createEmpty();
        let pos = 0;
        let curSplit = null;
        let subRows = [];
        let amountLen = 1;
        tbl.forEach(function(row, pks) {
            let id = row.get(COLS.ID);
            let amount = row.get(COLS.AMOUNT);
            if (id.indexOf('.') === -1) {
                amountLen = Math.max(amountLen, amount.toFixed(2).length);
            }
        });
        function appendSplitRows() {
            if (subRows.length > 0) {
                let delEnabled = subRows.length > 2 ? recoil.ui.BoolWithExplanation.TRUE : delSplitDisabled;
                for (let i = 0; i < subRows.length; i++) {
                    let row = subRows[i];
                    let last = i === (subRows.length - 1);
                    row.setCellMeta(COLS.AMOUNT, {editable: !last, displayLength: last ? -1 : amountLen});
                    row.addCellMeta(COLS.DATE, {cellWidgetFactory: null});
                    row.addCellMeta(COLS.PARTICULARS, {cellWidgetFactory: null});
                    row.addCellMeta(COLS.REF, {cellWidgetFactory: null});
                    row.addCellMeta(COLS.TYPE, {list: baseTypes});
                    row.addCellMeta(COLS.SPLIT, {cellWidgetFactory: delSplitFactory, enabled: delEnabled});
                    res.addRow(row);
                }
                subRows = [];
            }
        }
        let catLookupMap = {};
        let catLookup = {};
        for (let t in TYPES) {
            catLookupMap[TYPES[t]] = {};
        }
        
        income.forEach(v => catLookupMap[TYPES.income][v] = true);
        payments.forEach(v => catLookupMap[TYPES.payment][v] = true);
        payments.forEach(v => catLookupMap[TYPES.debt][v] = true);
        
        tbl.forEach(function(row, pks) {
            let cat = row.get(COLS.CATEGORY);
            if (cat && cat.trim().length > 0) {
                recoil.util.map.safeGet(catLookupMap, row.get(COLS.TYPE), {})[cat] = true;
            }
        });

        for (let k in catLookupMap) {
            catLookup[k] = removeDups(Object.keys(catLookupMap[k]));
        }
        
        
        


        
        tbl.forEachModify(function(row, pks) {
            row.setPos(pos++);
            let type = row.get(COLS.TYPE);
            let id = row.get(COLS.ID);
            let amount = row.get(COLS.AMOUNT);
            let particulars = row.get(COLS.PARTICULARS);
            let ref = row.get(COLS.REF);

            row.set(COLS.ORIG_TYPE, row.get(COLS.TYPE));
            row.set(COLS.ORIG_CATEGORY, row.get(COLS.CATEGORY));
            let categories = catLookup[type];
            if (type == TYPES.debt) {
                categories = [particulars].concat(categories);
            }
            row.addCellMeta(COLS.CATEGORY, {options: categories, displayLength: 15, maxLength: descriptionMeta.maxLength});

            if (curSplit !== null && id.indexOf(curSplit + '.') !== 0) {
                appendSplitRows();
            }
            if (type === TYPES.transfer) {
                row.addCellMeta(COLS.CATEGORY, {cellWidgetFactory: null});
            }

            if (type === TYPES.split) {
                row.addCellMeta(COLS.CATEGORY, {cellWidgetFactory: null});
                row.addCellMeta(COLS.LINK, {cellWidgetFactory: null});
                row.addCellMeta(COLS.SPLIT, {cellWidgetFactory: addSplitFactory});
                curSplit = id;
                res.addRow(row);
            }
            else if (curSplit !== null && id.indexOf('.') !== -1) {
                row.addCellMeta(COLS.LINK, {cellWidgetFactory: null});
                subRows.push(row);
            }
            else {
                let links = recoil.util.map.safeRecGet(linkMap, [particulars, ref]);
                if (!links || links.length < 2) {
                    links = recoil.util.map.safeRecGet(linkAmountMap, [particulars, amount]);
                }
                if (!links || links.length < 2) {
                    
                    row.addCellMeta(COLS.LINK, {cellWidgetFactory: null});
                }

                row.addCellMeta(COLS.SPLIT, {cellWidgetFactory: null});
                res.addRow(row);
            }

        });
        appendSplitRows();

        return columns.applyMeta(res);

    }, function(v) {
        let res = mappingsSourceB.get().createEmpty();
        let linkIdMap = res.getMeta().linkIdMap;
        let removeSplit = null;
        let splitRemaining = 0;
        let pos = 0;
        let prevSplit = null;
        let addSplit = null;
        function calcId(res, id) {
            let i = 0;
            while (res.getRow([id + '.' + i])) {
                i++;
            }
            return id + '.' + i;
        }
        function addLastSplit() {
            if (prevSplit && !removeSplit) {
                if (addSplit !== null) {
                    splitRemaining -= Math.round(prevSplit.get(COLS.AMOUNT) * 100);
                    res.addRow(prevSplit);
                    prevSplit.set(COLS.ID, calcId(res, addSplit));
                    prevSplit.set(COLS.CATEGORY, '');
                }

                prevSplit.set(COLS.AMOUNT, splitRemaining / 100);
                res.addRow(prevSplit);
            }
        }
        let categoryOverride = {};
        let typeOverride = {};

        v.forEach(function(row) {
            let origCat = row.get(COLS.ORIG_CATEGORY);
            let origType = row.get(COLS.ORIG_TYPE);
            let type = row.get(COLS.TYPE);
            let cat = row.get(COLS.CATEGORY);
            let id = row.get(COLS.ID);
            let link = row.get(COLS.LINK);
            if (origCat !== cat && linkIdMap[id] && link) {
                linkIdMap[id].forEach(function(linkId) {
                    categoryOverride[linkId] = cat;
                });
            }
            if (origType !== type && type !== TYPES.split && linkIdMap[id] && link) {
                linkIdMap[id].forEach(function(linkId) {
                    typeOverride[linkId] = type;
                });
            }
        });
        v.forEachModify(function(row) {
            let type = row.get(COLS.TYPE);
            let origType = row.get(COLS.ORIG_TYPE);
            let id = row.get(COLS.ID);
            let isSplit = id.indexOf('.') !== -1;
            let modifySplit = row.get(COLS.SPLIT);
            row.set(COLS.SPLIT, null);

            if (type !== TYPES.split && row.get(COLS.LINK) && categoryOverride[id] !== undefined) {
                row.set(COLS.CATEGORY, categoryOverride[id]);
            }

            if (type !== TYPES.split && row.get(COLS.LINK) && typeOverride[id] !== undefined) {
                row.set(COLS.TYPE, typeOverride[id]);
            }

            // clear out cell meta
            res.forEachColumn(function(col) {
                row.setCellMeta(col, {});
            });

            row.setPos(pos++);
            let amount = row.get(COLS.AMOUNT);
            if (prevSplit && !removeSplit) {
                if (!isSplit) {
                    addLastSplit();
                }
                else {
                    splitRemaining -= Math.round(prevSplit.get(COLS.AMOUNT) * 100);
                    res.addRow(prevSplit);
                }

            }
            if (!isSplit) {
                addSplit = null;
            }
            prevSplit = null;
            if (type === TYPES.split) {
                splitRemaining = Math.round(amount * 100);

            }
            if (type !== origType && type === TYPES.split) {
                res.addRow(row);
                let subType = row.get(COLS.AMOUNT) > 0 ? TYPES.income : TYPES.payment;

                row.setPos(pos++);
                row.set(COLS.CATEGORY, '');
                row.set(COLS.TYPE, subType);
                row.set(COLS.ORIG_TYPE, row.get(COLS.TYPE));

                row.set(COLS.AMOUNT, 0);
                row.set(COLS.ID, id + '.0');
                res.addRow(row);
                row.setPos(pos++);
                row.set(COLS.ID, id + '.1');
                row.set(COLS.AMOUNT, amount);
                res.addRow(row);

            }
            else if (type !== origType && origType === TYPES.split) {
                res.addRow(row);
                removeSplit = id;
            }
            else {
                if (!isSplit) {
                    removeSplit = null;

                }
                if (removeSplit === null) {
                    if (isSplit) {
                        if (!modifySplit) {
                            // remove the split
                            prevSplit = row;
                        }
                    }
                    else {
                        if (type === TYPES.split && modifySplit) {
                            addSplit = id;
                        }
                        res.addRow(row);
                    }

                }
            }

        });
        addLastSplit();
        mappingsSourceB.set(res.freeze());
    }, mappingsSourceB, budgetB);

    this.budgetB_ = budgetB;

    this.budgetPeriodB_ = frp.liftB((bud) => {
        let bPeriod;
        bud.forEach(function (row) {
            bPeriod = row.get(budgetT.cols.period);
        });
        return bPeriod;
    }, budgetB);
    this.mappingsB_ = mappingsB;
    this.dateRangeBs_ = dateRangeBs;
//    this.tableWidget_.attachStruct(mappingsB);

    let pageB = frp.createB(1);
    let PAGE_SIZE = budget.widgets.BudgetImportCategory.PAGE_SIZE;
    let idToPageMapB = frp.liftB(function(tbl) {
        let pageToId = [];
        let idToPage = {};
        let page = -1;
        let count = 0;
        tbl.forEach(function(row) {
            let id = (row.get(COLS.ID) + '').split('.')[0];
            if (idToPage[id] === undefined) {
                if (count % PAGE_SIZE === 0) {
                    pageToId.push([]);
                }
                pageToId[pageToId.length - 1].push(id);
                idToPage[id] = pageToId.length - 1;
                count++;
            }
        });

        return {pageToId, idToPage};
    }, mappingsB);

    let countB = frp.liftB(function(info) {
        return info.pageToId.length;
    }, idToPageMapB);

    let filterB = frp.liftB(function(info, page) {
        return function(id) {
            let baseId = (id + '').split('.')[0];
            return info.idToPage[baseId] === (page - 1);
        };
    }, idToPageMapB, pageB);

    let filteredB = recoil.structs.table.Filter.createColFilterB(mappingsB, COLS.ID, filterB);
    let displayB = frp.liftBI(function (tbl) {
        let res = tbl.createEmpty();
        tbl.forEachModify(function (row) {
            let catStr = (row.get(COLS.CATEGORY) || '').trim();
            row.set(COLS.CATEGORY, catStr.length ? [catStr]: []);
            res.addRow(row);
        });
        return res.freeze();
    }, function (tbl) {

        let res = tbl.createEmpty();
        tbl.forEachModify(function (row) {
            let cat = row.get(COLS.CATEGORY);
            row.set(COLS.CATEGORY, cat ? (cat[0] || '') : '');
            res.addRow(row);
        });
        filteredB.set(res.freeze());
    }, filteredB);

    this.pager_.attach(null, displayB, pageB, countB);

};
/**
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} storedMappingsB
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} addBudgetsB
 * @param {!recoil.frp.Behaviour} createId
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.BudgetImportCategory.prototype.createCallbackB = function(storedMappingsB, addBudgetsB, createId) {
    let budgetT = aurora.db.schema.tables.base.budget;
    let storedT = aurora.db.schema.tables.base.budget_mappings;
    let splitT = storedT.entries.splits;
    let entryT = aurora.db.schema.tables.base.budget.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let COLS = budget.widgets.BudgetImportCategory.COLS;
    let TYPES = aurora.db.schema.getEnum(COLS.TYPE);
    let frp = this.scope_.getFrp();
    let mappingsB = this.mappingsB_;
    let budgetB = this.budgetB_;

    return frp.createCallback(function(entries) {
        let mappings = mappingsB.get();
        let storedMap = budget.widgets.BudgetImportCategory.createStoredMappings(storedMappingsB.get());

        // split the categories up so we deal with it individually
        let mainRow = null;
        mappings.forEach(function(row) {
            let hasCategory = row.getCellMeta(COLS.CATEGORY).cellWidgetFactory !== null;
            let category = row.get(COLS.CATEGORY).trim();
            let isSplit = TYPES.split == row.get(COLS.TYPE);
            let type = TYPES.income == row.get(COLS.TYPE) ? EntryType.income : EntryType.household;
            let id = row.get(COLS.ID);
            let splitRow = id.indexOf('.') !== -1;

            let baseMap;
            let newBaseMap = {};
            if (splitRow) {
                baseMap = recoil.util.map.safeRecGet(storedMap, [mainRow.get(COLS.PARTICULARS), mainRow.get(COLS.REF)], {});
                let val = baseMap[null] || {};
                newBaseMap[null] = val;
                let split = {};
                split[splitT.cols.id.getName()] = splitT.cols.id.getDefault();
                split[splitT.cols.importType.getName()] = row.get(COLS.TYPE);
                split[splitT.cols.description.getName()] = hasCategory ? category : '';
                split[splitT.cols.amount.getName()] = hasCategory ? Math.round(row.get(COLS.AMOUNT) * 100) : 0;
                val.splits.push(split);
            }
            else {
                baseMap = recoil.util.map.safeRecGet(storedMap, [row.get(COLS.PARTICULARS), row.get(COLS.REF)], {});
                mainRow = row;
                let t = isSplit ? null : type;

                let val = baseMap[t] || {};
                newBaseMap[t] = val;
                val.description = hasCategory ? category : '';
                val.importType = row.get(COLS.TYPE);
                val.splits = [];
            }
            storedMap[mainRow.get(COLS.PARTICULARS)][mainRow.get(COLS.REF)] = newBaseMap;

        });


        let newBudgets = addBudgetsB.get().unfreeze();
        let id = null;
        budgetB.get().forEachModify(function(row) {
            row.set(budgetT.cols.entries, entries);
            id = row.get(budgetT.cols.id);
            newBudgets.addRow(row);
        });
        createId.set([id]);
        addBudgetsB.set(newBudgets.freeze());
        budget.widgets.BudgetImportCategory.updateStoredMappings(storedMap, storedMappingsB);
    }, mappingsB, budgetB, storedMappingsB, addBudgetsB, createId);

};



/**
 * @param {!recoil.structs.table.Table} mappings
 * @param {number} bPeriod budgetPeriod
 * @param {number} start
 * @param {number} end
 * @return {!Object<string,Object<number,!Array<{period:number, amount:number, src:!Array}>>>} cat -> type -> info
 */
budget.widgets.BudgetImportCategory.calculateCategories = function(mappings, bPeriod, start, end) {
    let budgetT = aurora.db.schema.tables.base.budget;
    let entryT = aurora.db.schema.tables.base.budget.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let COLS = budget.widgets.BudgetImportCategory.COLS;
    let TYPES = aurora.db.schema.getEnum(COLS.TYPE);
    const periodInfo = aurora.db.schema.getMeta(budgetT.cols.period).enumInfo;
    
    
    let categories = {};
    let calculatedCategory = {};
    const PAGE_SIZE = budget.widgets.BudgetImportCategory.PAGE_SIZE;
    
    // split the categories up so we deal with it individually
    let mainRow = null;
    let pos = 0;
    mappings.forEach(function(row) {
        let hasCategory = row.getCellMeta(COLS.CATEGORY).cellWidgetFactory !== null;
        let category = row.get(COLS.CATEGORY).trim();
        let isSplit = TYPES.split == row.get(COLS.TYPE);
        let type = TYPES.income == row.get(COLS.TYPE) ? EntryType.income : EntryType.household;
        let id = row.get(COLS.ID);
        let splitRow = id.indexOf('.') !== -1;
        if (hasCategory) {
            recoil.util.map.safeRecGet(categories, [category, row.get(COLS.TYPE)], []).push(
                {
                    type: type,
                    date: row.get(COLS.DATE),
                    amount: row.get(COLS.AMOUNT),
                    particulars: row.get(COLS.PARTICULARS),
                    reference: row.get(COLS.REF),
                    page: Math.floor(pos / PAGE_SIZE) + 1
                });
        }
        pos++;
    });

    
    for (let cat in categories) {
        calculatedCategory[cat] = {};
        for (let type in categories[cat]) {
            calculatedCategory[cat][type] = budget.widgets.BudgetImportCategory.calculatePeriod(categories[cat][type], start, end, bPeriod, periodInfo);
        }
    }
    return calculatedCategory;

};


/**
 * @private
 * @param {!budget.widgets.BudgetImportCategory.CategoryInfo} first
 * @param {!Array<number>} dates
 * @param {!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>} entries
 * @return {?budget.widgets.BudgetImportCategory.CategoryInfo}
 */
budget.widgets.BudgetImportCategory.findAndRemoveDateMatch_ = function(first, dates, entries) {
    for (let j = 0; j < dates.length; j++) {
        let date = dates[j];
        let idx = goog.array.findIndex(entries, function(item) {return item.date === date;});
        if (idx !== -1) {
            return entries.splice(idx, 1)[0];
        }
    }
    return null;
};

/**
 * step in entry is a function that takes date and how many steps to take
 * and returns a list of possible dates it can be, this is because month steps may not
 * be exact
 * @param {{period:number, step:function(number,number):!Array<number>}} entry
 * @param {number} firstIdx index into remaining to start at
 * @param {!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>} remaining
 * @param {function(number):boolean} dateFilter
 * @return {?{remaining:!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>,matches:!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>}}
 */
budget.widgets.BudgetImportCategory.findEntry_ = function(entry, firstIdx,  remaining, dateFilter) {
    let first = remaining[firstIdx];
    // if an item should exist before the first it does not match
    let before = entry.step(first.date, -1);
    if (before.filter(dateFilter).length == before.length) {
        // the date it would have to exist but doesn't can't be valid
        return null;
    }


    let res = budget.widgets.BudgetImportCategory.findEntryHelper_(first, entry, firstIdx, remaining, dateFilter);
    if (res) {
        return res;
    }

    // it is possible that the first date fell on a public holiday so if its a friday try
    // with the date being monday

    let others = budget.widgets.BudgetImportCategory.holidayOptionsStart_(first.date).map(d => {
        let res = goog.object.clone(first);
        res.date = d;
        return res;
    });

    for (let i = 0; i < others.length; i++) {
        res = budget.widgets.BudgetImportCategory.findEntryHelper_(first, entry, firstIdx, remaining, dateFilter);
        if (res) {
            return res;
        }
    }
    return null;
};

/**
 * @param {!Array<number>} dates
 * @return {!Array<number>}
 */
budget.widgets.BudgetImportCategory.addHolidays_ = function (dates) {
    let res = [];
    let seen = {};
    let addDate = (date) => {
        if (!seen[date]) {
            res.push(date);
            seen[date] = true;
        }
    };
        
    for (let i = 0; i < dates.length; i++) {
        let date = dates[i];
        addDate(date);
        budget.widgets.BudgetImportCategory.holidayOptionsMatch_(date).forEach(addDate);
    }
    res.sort((x,y) => x-y);
    return res;
    
};

/**
 * @param {number} date
 * @return {!Array<number>}
 */

budget.widgets.BudgetImportCategory.holidayOptionsMatch_ = function (date) {
    return budget.widgets.BudgetImportCategory.holidayOptionsStart_(date, budget.widgets.BudgetImportCategory.HOLIDAY_INV_MAP);
};
/**
 * @const
 */
budget.widgets.BudgetImportCategory.HOLIDAY_MAP = {
    '5': [3,4], // friday -> monday, tuesday
    '4': [1,4], // thursday -> fri, monday
    '3': [1,2], // wed -> thur, fri
    '2': [1,2], // tue -> wed, thur
    '1': [1,2], // mon -> tue, wed

};

/**
 * @const
 */
budget.widgets.BudgetImportCategory.HOLIDAY_INV_MAP = (function () {
    let map = budget.widgets.BudgetImportCategory.HOLIDAY_MAP;
    let out = {};
    for (let k in map) {
        let day = parseInt(k, 10);
        let items = map[k];
        
        for (let i = 0; i < items.length; i++) {
            let adj = items[i];
            let key = (day + adj) % 7;
            out[key] = out[key] || [];
            out[key].push(-adj);
        }
    }
    return out;
})();
/**
 * @param {number} date
 * @param {Object<?,!Array<number>>=} opt_map
 * @return {!Array<number>}
 */

budget.widgets.BudgetImportCategory.holidayOptionsStart_ = function (date, opt_map) {
    let toDate = recoil.ui.widgets.DateWidget2.convertLocaleDate;
    const fromDate = recoil.ui.widgets.DateWidget2.convertDateToLocal;
    const map = opt_map || budget.widgets.BudgetImportCategory.HOLIDAY_MAP;
    let res = [];
    let dt = toDate(date);

    let adjusts = map[dt.getDay()];
    if (adjusts) {
        for (let i = 0; i <adjusts.length; i++) {
            let out = new Date(dt.getTime());
            out.setDate(dt.getDate() + adjusts[i]);
            res.push(fromDate(out));
        }
    }
    return res;
};

/**
 * @param {!budget.widgets.BudgetImportCategory.CategoryInfo} first
 * @param {{period:number, step:function(number,number):!Array<number>}} entry
 * @param {number} firstIdx index into remaining to start at
 * @param {!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>} remaining
 * @param {function(number):boolean} dateFilter
 * @return {?{remaining:!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>,matches:!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>}}
 */

budget.widgets.BudgetImportCategory.findEntryHelper_ = function(first, entry, firstIdx,  remaining, dateFilter) {
    let matches = [first];
    let curRemaining = remaining.filter((_, idx) => idx !== firstIdx);
    const addHolidays = budget.widgets.BudgetImportCategory.addHolidays_;
    
    let steps = 1;
    let next = addHolidays(entry.step(first.date, steps));
    // public holidays may cause early payment by 2 working days so add them to the match
    
    let nextFiltered = next.filter(dateFilter);
    while (nextFiltered.length == next.length) {
        let found = budget.widgets.BudgetImportCategory.findAndRemoveDateMatch_(first, nextFiltered, curRemaining);
        if (found) {
            matches.push(found);
        } else {
            return null;
        }
        steps++;
        next = addHolidays(entry.step(first.date, steps));
        nextFiltered = next.filter(dateFilter);
    }
    let found = budget.widgets.BudgetImportCategory.findAndRemoveDateMatch_(first, nextFiltered, curRemaining);
    if (found) {
        matches.push(found);
    }
    if (matches.length <= 1) {
        return null;
    }

    return {
        remaining: curRemaining,
        matches: matches
    };
};
/**
 * @param {!Array<!budget.widgets.BudgetImportCategory.CategoryInfo>} infos
 * @param {number} start date in yyyymmdd format
 * @param {number} end date in yyyymmdd format
 * @param {number} budgetPeriod enum describing budget Period
 * @param {!Object<number,{rate:number}>} periodInfo map from period to number of days in that period
 * @return {!budget.widgets.BudgetImportCategory.Calculated}
 */
budget.widgets.BudgetImportCategory.calculatePeriod = function(infos, start, end, budgetPeriod, periodInfo) {
    let toDate = recoil.ui.widgets.DateWidget2.convertLocaleDate;
    let fromMoment = function(d) {return recoil.ui.widgets.DateWidget2.convertDateToLocal(d.toDate());};
    let days = Math.abs(moment(toDate(end)).diff(toDate(start), 'd')) + 1; // range is inclusive so add 1
    let periods = aurora.db.schema.getEnum(aurora.db.schema.tables.base.budget.cols.period);
    // sunday = 0
    // don't know about public holidays
    let dateFilter = x => x >= start && x <= end;
    let x = [
        {period: periods.weekly, step: (d, i) => [fromMoment(moment(toDate(d)).add(7 * i, 'd'))]},
        {period: periods.fortnightly, step: (d, i) => [fromMoment(moment(toDate(d)).add(14 * i, 'd'))]},
        {period: periods.monthly, step: (d, i) => {
            let res = [];

            let start = moment(toDate(d));
            let weekDay = start.get('d');
            let isLastDay = start.get('date') == start.daysInMonth();

            {
                let nextDate = start.clone().add(i, 'M');
                res.push(fromMoment(nextDate));
                let weekDay = nextDate.get('d');
                // if it is on the last day of the month that is valid
                if (isLastDay && nextDate.get('date') != nextDate.daysInMonth()) {
                    res.push(fromMoment(nextDate.clone().set('date', nextDate.daysInMonth())));
                }
                if (weekDay === 0) {
                    res.push(fromMoment(nextDate.clone().add(1, 'd')));
                    res.push(fromMoment(nextDate.clone().add(-2, 'd')));
                }
                else if (weekDay == 6) {
                    res.push(fromMoment(nextDate.clone().add(2, 'd')));
                    res.push(fromMoment(nextDate.clone().add(-1, 'd')));
                }

            // remove duplicates
                res = res.sort().filter(function(v, idx, arr) {return idx === 0 || arr[idx - 1] !== arr[idx];});
            }
            return res;
        }}];
    
    let remaining =  goog.array.clone(infos);
    remaining.sort((x,y) => x.date - y.date);
    let results = [];
    for (let i = 0; i < x.length; i++) {
        let entry = x[i];
        let pos = 0;
        let amount = 0;
        while (pos < remaining.length) {
            let found = budget.widgets.BudgetImportCategory.findEntry_(entry, pos, remaining, dateFilter);
            if (!found) {
                pos++;
            }
            else {
                remaining = found.remaining;
                let sum = found.matches.reduce((a,v) => a + v.amount * 100, 0);
                
                amount += Math.round(sum / found.matches.length);
            }
        }
        if (amount !== 0) {
            results.push({amount: amount, period: entry.period});
        }
        
    }
    let budgetRate = periodInfo[budgetPeriod].rate;

    
    let amount = 0;
    remaining.forEach(function (entry) {
        amount += Math.round(entry.amount * 100);
    });

    // per budget period
    amount = Math.round(amount * budgetRate/ days);

    if (amount === 0 && results.length > 0) {
        // we have no remaining entries if the results are all the same period we can use
        // that
        let res = {
            amount: results[0].amount,
            period: results[0].period,
            src: infos
        };
        
        for (let i = 1; i < results.length && res; i++) {
            let el = results[i];
            if (res.period != el.period) {
                res = null;
            }
            else {
                res.amount += el.amount;
            }
        }
        if (res) {
            return res;
        }
    }

    if (results.length == 0 && remaining.length == 1) {
        // we only found 1 assume its yearly
        return {
            amount:  Math.round(100 * remaining[0].amount),
            period: aurora.db.schema.getEnum(aurora.db.schema.tables.base.budget.cols.period).yearly,
            src: infos
            
        };
    }
        
    results.forEach(function (e) {
        let dailyAmount = e.amount / periodInfo[e.period].rate;
        
        amount += dailyAmount * budgetRate; 
    });

    return  {
        amount: Math.round(amount),
        period: budgetPeriod,
        src: infos
    };
    
};
/**
 * @param {Object<string,Object<string,Object<?string,{description:string,row:Object}>>>} storedMap
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} storedMappingsB
 */
budget.widgets.BudgetImportCategory.updateStoredMappings = function (storedMap, storedMappingsB) {
    let storedT = aurora.db.schema.tables.base.budget_mappings;
    let TYPES = aurora.db.schema.getEnum(storedT.entries.cols.importType);

    // only 1 row should exist
    let row = null;
    let newStored = storedMappingsB.get().createEmpty();    
    storedMappingsB.get().forEachModify(function (r) {
        row = r;
    });
    let userId = budget.widgets.BudgetList.getUserId();
    row = row || new recoil.structs.table.MutableTableRow();
    row.set(storedT.cols.userid, new aurora.db.PrimaryKey(userId, userId));
    let entries = [];
    for (let part in storedMap) {
        for (let ref in storedMap[part]) {
            for(let type in storedMap[part][ref]) {
                type = type === 'null' ? null : type;
                let entry = storedMap[part][ref][type];
                let row = entry.row ? goog.object.clone(entry.row) : {};
                if (row[storedT.entries.cols.id.getName()] === undefined) {
                    row[storedT.entries.cols.id.getName()]= storedT.entries.cols.id.getDefault();
                }
                row[storedT.entries.cols.description.getName()] =  entry.description;
                row[storedT.entries.cols.particulars.getName()] = part;
                row[storedT.entries.cols.type.getName()] =  type;
                row[storedT.entries.cols.importType.getName()] =  entry.importType;
                row[storedT.entries.cols.reference.getName()] = ref;
                if (entry.splits !== undefined) {
                    row[storedT.entries.cols.splits.getName()] = entry.importType === TYPES.split ? (entry.splits || [] ) : [];
                }
                entries.push(row);
            }
        }
    }
    
    row.set(storedT.cols.entries, entries);
    newStored.addRow(row);
    storedMappingsB.set(newStored.freeze());
};
/**
 * @param {!recoil.structs.table.Table} storedMappings
 * @return {!Object<string,Object<string,Object<string,budget.widgets.BudgetImportCategory.StoredMappingEntry>>>}
 */
budget.widgets.BudgetImportCategory.createStoredMappings = function (storedMappings) {
    let storedMap = {};
    let storedT = aurora.db.schema.tables.base.budget_mappings;
    storedMappings.forEach(function (row) {
        let entryT = storedT.entries.cols;
        (row.get(storedT.cols.entries) || []).forEach(function (entry) {
            let importType = entry[entryT.importType.getName()];
            let TYPES = aurora.db.schema.getEnum(entryT.importType);
            let type = importType == TYPES.split ? null : entry[entryT.type.getName()];

            let val = recoil.util.map.safeRecGet(storedMap, [entry[entryT.particulars.getName()], entry[entryT.reference.getName()], type], {});
            val.description = entry[entryT.description.getName()];
            val.importType = importType;
            val.row = entry;
        });
    });
    return storedMap;
};

/**
 * @private
 * @param {!recoil.structs.table.MutableTable} tbl
 * @param {!recoil.structs.table.MutableTableRow} row
 * @param {!budget.widgets.BudgetImportCategory.StoredMappingEntry} lookup
 * @param {!Object} item represents an entrity row in a budget
 */
budget.widgets.BudgetImportCategory.addSplitRows_ = function(tbl, row, lookup, item) {
    let COLS = budget.widgets.BudgetImportCategory.COLS;
    let storedT = aurora.db.schema.tables.base.budget_mappings;
    let splitT = storedT.entries.splits;
    let TYPE = storedT.entries.cols.importType;
    let TYPES = aurora.db.schema.getEnum(TYPE);
    let importType = lookup.importType;
    if (importType === TYPES.split) {
        let id = row.get(COLS.ID);
        let splits = lookup.row.splits;
        let splitTotal = splits.reduce((a, c) => a + c.amount, 0);
        let amount = Math.round(item.amount * 100);
        let remaining = amount;
        for (let j = 0; j < splits.length; j++) {
            let e = splits[j];
            row.set(COLS.ID, id + '.' + j);
            row.set(COLS.CATEGORY, e.description);
            row.set(COLS.ORIG_CATEGORY, e.description);
            row.set(TYPE, e.importType);
            row.set(COLS.ORIG_TYPE, e.importType);
            
            if (splitTotal === 0) {
                if (splits.length < 2) {
                    row.set(COLS.AMOUNT, 0);
                            }
                else if (j !== splitTotal.length - 1) {
                    row.set(COLS.AMOUNT, 0);
                }
            }
            else {
                if (j === splits.length - 1) {
                    row.set(COLS.AMOUNT, remaining/100);
                    remaining = 0;
                }
                else {
                                let a = Math.round((e.amount * amount) / splitTotal);
                    row.set(COLS.AMOUNT, a/100);
                    remaining -= a;
                }
            }
            tbl.addRow(row);
        }
        
        // make sure at least 2 rows
        row.set(COLS.CATEGORY, '');
        row.set(COLS.ORIG_CATEGORY, '');
        row.set(TYPE, remaining <= 0 ? TYPES.payment : TYPES.income);
        row.set(COLS.ORIG_TYPE, row.get(TYPE));
        for (let j = splits.length; j < 2; j++) {
            row.set(COLS.ID, id + '.' + j);
            row.set(COLS.AMOUNT, j === 0 ? 0: remaining/100);
            tbl.addRow(row);
        }
        console.log("creating split rows");
    }
    
};
/**
* @const
*/
budget.widgets.BudgetImportCategory.COLS = {
    ID: new recoil.structs.table.ColumnKey('id'),
    DATE: new recoil.structs.table.ColumnKey('date'),
    PARTICULARS: new recoil.structs.table.ColumnKey('particulars'),
    REF: new recoil.structs.table.ColumnKey('reference'),
    SPLIT: new recoil.structs.table.ColumnKey('split'),
    AMOUNT: new recoil.structs.table.ColumnKey('amount'),
    TYPE: aurora.db.schema.tables.base.budget_mappings.entries.cols.importType,
    ORIG_TYPE: new recoil.structs.table.ColumnKey('orig-type'),
    CATEGORY: new recoil.structs.table.ColumnKey('category'),
    ORIG_CATEGORY: new recoil.structs.table.ColumnKey('orig-category'),
    LINK: new recoil.structs.table.ColumnKey('link')
};


/**
 * @param {*} type
 * @return {!Array<number>}
 */
budget.widgets.BudgetImportCategory.getPossibleTypes_ = function (type) {
    
    let TYPES = aurora.db.schema.getEnum(budget.widgets.BudgetImportCategory.COLS.TYPE);
    let entryT = aurora.db.schema.tables.base.budget.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);

    let possibleTypes = [TYPES.payment,TYPES.debt];
    if (type == EntryType.household) {
        possibleTypes = [TYPES.payment];
    }
    else if (type == EntryType.income) {
        possibleTypes = [TYPES.income];
    }
    return possibleTypes;
};


/**
 * @const
 */
budget.widgets.BudgetImportCategory.PAGE_SIZE = 15;
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.BudgetImportCategory.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.BudgetImportCategory.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

