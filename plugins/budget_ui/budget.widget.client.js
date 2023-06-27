goog.provide('budget.widgets.Budget');

goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.widgets.TableWidget');
goog.require('budget.Importer');
goog.require('budget.messages');
goog.require('budget.print.BudgetPrinter');
goog.require('goog.dom');
goog.require('recoil.frp.logic');
goog.require('recoil.structs.table.Filter');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.columns.Expr');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');
goog.require('recoil.ui.widgets.table.InputComboColumn');
goog.require('recoil.ui.widgets.table.TableWidget');
/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Budget = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let html = new recoil.ui.HtmlHelper(scope);
    this.exportWidget_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.printWidget_ = new recoil.ui.widgets.ButtonWidget(scope);
    let exportDiv = cd('div', {class: 'budget-export'});
    let printDiv = cd('div', {class: 'budget-export'});
    this.budgetB_ = null;
    
    this.permsB_ = aurora.permissions.getContext(scope);
    html.show(exportDiv, frp.liftB(function (perm) {
        return !!((perm || {}).permissions || {}).mentor;
    }, this.permsB_));
    this.exportWidget_.getComponent().render(exportDiv);
    this.printWidget_.getComponent().render(printDiv);

    let makePart = function() {
        let div = cd('div');
        let incomeWidget = new recoil.ui.widgets.table.TableWidget(scope);
        incomeWidget.getComponent().render(div);
        return {
            widget: incomeWidget,
            div: div
        };
    };
    let household = makePart();
    let debts = makePart();
    let income = makePart();
    let totals = makePart();

    let periodDiv = cd('div', 'goog-inline-block');
    let citedDiv = cd('div', 'goog-inline-block cited-check');
    this.incomeWidget_ = income.widget;
    this.householdWidget_ = household.widget;
    this.totalsWidget_ = totals.widget;
    this.debtWidget_ = debts.widget;
    this.periodWidget_ = new recoil.ui.widgets.SelectorWidget(scope);
    this.periodWidget_.getComponent().render(periodDiv);
    this.citedWidget_ = new recoil.ui.widgets.CheckboxWidget(scope);
    this.citedWidget_.getComponent().render(citedDiv);

    this.readyContainer_ = cd(
        'div', {class: 'budget-budget'}, cd('div', 'goog-inline-block', exportDiv, printDiv),
        cd('div', {class: 'budget-header'}, mess.SERVICE_NAME.toString()),
        cd('div', {class: 'budget-subheader'}, 'Ph: 04 5666357'),

        cd('div', {class: 'budget-subheader'}, periodDiv, ' Budget, Cited: ', citedDiv),
        cd('div', {class: 'budget-budget-template'},
           cd('div', {class: 'budget-budget-template-column'},
              cd('div', {class: 'group-header'}, 'Income'),
              cd('div', {class: 'field-name'}, income.div),
              cd('div', {class: 'group-header'}, 'Household Expenses'),
              cd('div', {class: 'field-name'}, household.div),
              cd('div', {class: 'group-header'}, 'Budget Totals'),
              cd('div', {class: 'field-name budget-totals'}, totals.div)

             ),
           cd('div', {class: 'budget-budget-template-column'},
              cd('div', {class: 'group-header'}, 'Debts Payable'),
              cd('td', {class: 'field-name'}, debts.div))
          )
    );

    let loadingContainer = cd('div', {class: 'budget-loading'}, cd('div'));
    let errorContainer = cd('div', {class: 'budget-error'}, 'Error');
    let notSelectedContainer = cd('div', {class: 'budget-error'}, 'No Budget Selected');
    let container = cd('div', {}, this.readyContainer_, loadingContainer, errorContainer, notSelectedContainer);

    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
    let me = this;
    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, function(helper) {
        goog.style.setElementShown(loadingContainer, !helper.isGood() && helper.errors().length === 0);
        let noBudget = helper.isGood() && (me.entriesB_.get() === null || me.entriesB_.get().size() == 0);

        goog.style.setElementShown(errorContainer, !helper.isGood() && helper.errors().length !== 0);

        goog.style.setElementShown(this.readyContainer_, !noBudget && helper.isGood());
        goog.style.setElementShown(notSelectedContainer, noBudget && helper.isGood());
    });
};

/**
 * @param {!budget.WidgetScope} scope
 * @param {!Node} content
 * @param {string} headerName
 * @param {string} okName
 * @param {!recoil.frp.Behaviour} okEnabledB
 * @param {!recoil.frp.Behaviour} actionB
 */
budget.widgets.Budget.makeDialog = function(scope, content, headerName, okName, okEnabledB, actionB) {
    let frp = scope.getFrp();

    var options = {
        hasCloseX: true,
        overlay: true,
        body: content,
        isModal: true,
        clickToClose: true,
        heading: {message: headerName, className: 'table-dialog-header'},
        hasDefault: true,
        finish: function(e) {
            frp.accessTrans(function() {
                if (okEnabledB.good() && okEnabledB.get().val()) {
                    actionB.set(e);
                }
            }, actionB, okEnabledB);
        }
    };


    let dialog = new goog.ui.Dialog();
    aurora.widgets.TableDialog.setupButton(scope, dialog, okName, okEnabledB, actionB);

    new recoil.ui.ComponentWidgetHelper(
        scope, dialog, this,
        /** @suppress {deprecated} */

        function(helper) {
            let buttonSet = new goog.ui.Dialog.ButtonSet();
            if (helper.isGood()) {
                buttonSet.addButton({key: 'ok', caption: okName}, true);
                dialog.setButtonSet(buttonSet);
                buttonSet.setButtonEnabled('ok', okEnabledB.get().val());
                if (okEnabledB.get().reason()) {
                    goog.dom.insertChildAt(buttonSet.getElement(), goog.dom.createDom('span', {class: 'dialog-message'},okEnabledB.get().reason().toString()), 0);
                }
            }

    }).attach(okEnabledB);

    dialog.setTitle(headerName);
    dialog.getContentElement().appendChild(content);
    goog.dom.setFocusableTabIndex(dialog.getTitleCloseElement(), false);

    dialog.setVisible(true);
    aurora.widgets.TableDialog.focusFirst(dialog);
    dialog.reposition();

    setTimeout(function() {
        dialog.reposition();
    }, 0);
};


/**
 * @private
 * @param {!recoil.frp.Behaviour} budgetB
 * @param {!recoil.frp.Behaviour} userB
 * @param {!recoil.frp.Behaviour} siteB
 * @return {!recoil.frp.Behaviour}
 */

budget.widgets.Budget.prototype.createPrintB_ = function(budgetB, userB, siteB) {
    let frp = this.scope_.getFrp();
    let scope = this.scope_;
    let budgetT = aurora.db.schema.tables.base.budget;
    let userT = aurora.db.schema.tables.base.user;
    let entryT = budgetT.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let me = this;

    let htmlFormatter = {
        join: function(items) {
            return cd.apply(null, ['span', {}].concat(items));
        },
        format: function(type, val) {
            switch (type) {
            case 'bold':
                return cd('span', {class: 'budget-print-bold'}, val);
            default:
            }

            return goog.dom.createTextNode(val);
        }
    };
    
    let printUserB = frp.switchB(frp.liftB(function(perms) {
        let query = new recoil.db.Query();
        return scope.getDb().get(userT.key, query.eq(userT.cols.id, query.val(perms.userid)));
    }, me.permsB_));


    return frp.createCallback(
        function() {
            let user = userB.get().getFirstRow();
            let budgetRow = budgetB.get().getFirstRow();
            let site = siteB.get().getFirstRow();
            let printUser = printUserB.get().getFirstRow();

            if (user && budgetRow && site) {
                let printer = new budget.print.BudgetPrinter();
                let mentor = null;
                
                if (((me.permsB_.get() || {}).permissions || {}).mentor && printUser) {
                    mentor = printUser.get(userT.cols.firstName) || 'Unknown';
                }
                printer.print(mentor, user, budgetRow, site);
                return;
            }
        }, budgetB, userB, siteB, this.permsB_, printUserB);
};

/**
 * @private
 * @param {!recoil.structs.table.TableInterface} user
 * @return {{name:string, phone: string, address: string}}
 */
budget.widgets.Budget.prototype.getUserInfo_ = function(user) {
    const userT = aurora.db.schema.tables.base.user;

    let res = {name: '', phone: '', address: ''};
    user.forEach(function(row) {
        res.name = ((row.get(userT.cols.firstName) || '') + ' ' + (row.get(userT.cols.lastName) || '')).trim();
        res.phone = row.get(userT.cols.phone);
        res.address = (row.get(userT.cols.address) || '');
    });
    return res;
};



/**
 * @private
 * @param {!recoil.frp.Behaviour} budgetB
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.Budget.prototype.importB_ = function(budgetB) {
    let frp = this.scope_.getFrp();
    let scope = this.scope_;

    return frp.createCallback(
        function(v) {
            
        }, budgetB);
};

/**
 * @private
 * @param {!recoil.frp.Behaviour} budgetB
 * @param {!recoil.frp.Behaviour} userB
 * @return {!recoil.frp.Behaviour}
 */
budget.widgets.Budget.prototype.exportToExcelB_ = function(budgetB, userB) {
    let frp = this.scope_.getFrp();
    let scope = this.scope_;
    let budgetT = aurora.db.schema.tables.base.budget;
    let userT = aurora.db.schema.tables.base.user;
    let entryT = budgetT.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);
    let mess = budget.messages;
    let me = this;
    let saveFile = function(blob, fileName) {
        try {
            if (window.navigator && window.navigator.msSaveOrOpenBlob) {
                window.navigator.msSaveOrOpenBlob(blob, fileName);
            } else {
                var url = window.URL.createObjectURL(blob);
                var a = document.createElement('a');
                document.body.appendChild(a);
                a.href = url;
                a.download = fileName;
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        }
        catch (err) {
                console.error(err.message || err);
        }
    };

    return frp.createCallback(
        function(v) {
            let income = [];
            let expenses = [];
            let debts = [];

            let tbl = budgetB.get();
            let user = userB.get();
            let periods = [];
            for (let name in periodMeta.enum) {
                let val = periodMeta.enum[name];
                periods.push([periodMeta.enumDisplay.resolve(val).toString(),
                              periodMeta.enumInfo[val].rate]);
            }
            let bPeriod = 0;
            let userInfo = me.getUserInfo_(user);
            let name = userInfo.name;
            let phone = userInfo.phone;
            let address = userInfo.address;
            let totalIncome = 0;
            let totalHousehold = 0;
            let totalDebts = 0;
            let totalArrears = 0;
            let totalOwing = 0;
            tbl.forEach(function(row) {
                let entries = goog.array.clone(row.get(budgetT.cols.entries));
                entries.sort((x, y) => x.order - y.order);
                bPeriod = row.get(budgetT.cols.period);
                
                entries.forEach(function(entry) {
                    let type = entry[entryT.cols.type.getName()];
                    let desc = entry[entryT.cols.description.getName()];
                    let value = entry[entryT.cols.value.getName()];
                    let valNum = recoil.util.ExpParser.instance.eval(value);
                    let p = entry[entryT.cols.period.getName()];
                    let period = p === null ? '' : periodMeta.enumDisplay.resolve(p).toString();
                    let periodValue = p === null || valNum === null ? null : periodMeta.enumInfo[bPeriod].rate * valNum * 100 / periodMeta.enumInfo[p].rate;
                    if (EntryType.income === type) {
                        totalIncome += Math.round(periodValue === null ? 0 : periodValue);
                        income.push([desc, {f: value}, period, {c: periodValue}]);
                    }
                    else if (EntryType.household === type) {
                        totalHousehold += Math.round(periodValue === null ? 0 : periodValue);

                        expenses.push([desc, {f: value}, period, {c: periodValue}]);
                    }
                    else if (EntryType.debt === type) {
                        totalDebts += Math.round(periodValue === null ? 0 : periodValue);
                        let arrears = entry[entryT.cols.arrears.getName()];
                        let owing = entry[entryT.cols.owing.getName()];
                        let notes = entry[entryT.cols.notes.getName()];
                        let arrearsVal = recoil.util.ExpParser.instance.eval(arrears);
                        let owingVal = recoil.util.ExpParser.instance.eval(owing);

                        totalOwing += owingVal ? owingVal * 100 : 0;
                        totalArrears += arrearsVal ? arrearsVal * 100 : 0;

                        debts.push([desc, notes, {f: value}, period, {c: periodValue}, {f: arrears}, {f: owing}]);
                    }
                });
            });

            let toColIndex = function(col) {
                let res = String.fromCharCode('A'.charCodeAt(0) + col % 26);
                col = Math.floor(col / 26);

                while (col) {
                    col--;
                    res = String.fromCharCode('A'.charCodeAt(0) + col % 26) + res;
                    col = Math.floor(col / 26);
                }
                return res;
            };

            let setRowValues = function(ws, startCol, row, items) {
                items.forEach(function(v, idx) {
                    if (v !== null) {
                        ws.cell(toColIndex(startCol + idx) + (row + 1)).value(v instanceof recoil.ui.message.Message ? v.toString() : v);
                    }
                });
            };

            let setBudgetItems = function(ws, startCol, startRow, items) {
                items.forEach(function(entry, row) {
                    entry.forEach(function(val, col) {
                        let curRow = (row + startRow + 1);
                        if (val && val.c) {
                            let valRef = toColIndex(startCol + col - 2) + curRow;
                            let periodRef = toColIndex(startCol + col - 1) + curRow;
                            let match = 'MATCH(' + periodRef + ',Lookup!$A$1:$A$' + periods.length + ',0)';
                            let gmatch = 'MATCH(J5,Lookup!$A$1:$A$' + periods.length + ',0)';
                            let lookup = 'Lookup!$B$1:$B$' + periods.length;
                            let form = 'IF(ISNA(' + match + '),"",ROUND(' + valRef + '*INDEX(' + lookup + ',' + gmatch + ')/INDEX(' + lookup + ',' + match + '),2))';
                            if (val.c === null) {
                                ws.cell(toColIndex(startCol + col) + curRow).formula(form)
                                    .style('numberFormat', '#,##0.00');
                            }
                            else {
                                ws.cell(toColIndex(startCol + col) + curRow).formula(form, val.c / 100)
                                    .style('numberFormat', '#,##0.00');
                            }

                        }
                        else if (val && val.f) {
                            ws.cell(toColIndex(startCol + col) + curRow).formula(val.f, recoil.util.ExpParser.instance.eval(val.f))
                                .style('numberFormat', '#,##0.00');

                            //ws.cell(toColIndex(startCol+col) + curRow).value(
                        }
                        else {
                            ws.cell(toColIndex(startCol + col) + curRow).value(val);
                        }
                    });
                });
            };
            const periodValidation = {
                type: 'list',
                allowBlank: true,
                showInputMessage: false,
                prompt: false,
                promptTitle: 'String',
                showErrorMessage: false,
                error: 'String',
                errorTitle: 'String',
                operator: 'String',
                formula1: 'Lookup!$A:$A',//Required
                formula2: 'String'
            };

            XlsxPopulate.fromBlankAsync().then(function(wb) {
                const totalFmt = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)';

                let budget = wb.sheet(0);
                budget.name('Budget');
                budget.pageMargins('left', 0.1);
                budget.pageMargins('right', 0.1);
                budget.pageSetup('orientation', 'landscape');

                budget.printOptions('horizontalCentered', true);
                let rich = function(parts) {
                    let txt = new XlsxPopulate.RichText();
                    for (let i = 0; i < parts.length; i++) {
                        let part = parts[i];
                        if (part.value !== undefined) {
                            let v = part.value;
                            delete part['value'];
                            txt.add(v, part);
                        }
                        else {
                            txt.add(part);
                        }
                    }
                    return txt;
                };

                let lookup = wb.addSheet('Lookup');
                lookup.hidden(true);
                periods.forEach(function(p, idx) {
                    setRowValues(lookup, 0, idx, p);
                });

                budget.cell('A1').value(mess.BUDGET_PROTECTED.toString());
                budget.cell('J1').value(rich([{value: mess.PLEASE_NOTE.toField() + '   ', bold: true}, mess.THIS_BUDGET_IS_BASED.toString()]));
                budget.cell('A2').value(mess.SERVICE_NAME.toString().toUpperCase() + ' ph: 04 5666357');
                budget.range('A2:D2').merged(true).style('horizontalAlignment', 'right');
                budget.cell('F2').formula(
                    'CONCATENATE(UPPER(J5), " HOUSEHOLD BUDGET")',
                    periodMeta.enumDisplay.resolve(bPeriod).toString().toUpperCase() + ' HOUSEHOLD BUDGET'
                ).style({'underline': true, 'bold': true, 'horizontalAlignment': 'center'});

                budget.cell('J2').value(mess.ON_INFORMATION.toString());
                budget.cell('A3').value(mess.NAME.toField());
                budget.cell('B3').value(name);
                budget.cell('A4').value(mess.ADDRESS.toField());
                budget.cell('B4').value(address).style('wrapText', true);
                budget.cell('I4').value(mess.ENTER_ONE_OF.toField());
                budget.cell('J5').value(periodMeta.enumDisplay.resolve(bPeriod).toString()).dataValidation(periodValidation);
                budget.cell('I5').value('Weekly');
                budget.cell('A6').value(mess.PHONE.toField());
                budget.cell('B6').value(phone);
                budget.cell('I6').value('Fortnightly');
                budget.cell('I7').value('Monthly');

                for (let i = 3; i < 7; i++) {
                    budget.range('B' + i + ':D' + i).style('fill', 'f3f3f3');
                }

                setRowValues(budget, 0, 7, [mess.INCOME.toField().toUpperCase(),
                                            mess.$_VALUE, mess.PAYMENT_PERIOD, null, null,
                                            mess.DEBTS_PAYABLE.toField().toUpperCase(), mess.ADDITIONAL_DESCRIPTION.toField(),
                                            mess.$_VALUE, mess.PAYMENT_PERIOD, null, mess.ARREARS, mess.TOTAL_OWING]);
                budget.row(8).style('bold', true).style('wrapText', true).height(45);
                //  .style('horizontalAlignment','center');
                let bPeriodName = periodMeta.enumDisplay.resolve(bPeriod).toString();
                let str = 'Calculated value Per ';
                let cVal = str + bPeriodName.substring(0, bPeriodName.length - 2);
                budget.cell('D8').formula('CONCATENATE("' + str + '", LEFT($J$5,LEN($J$5) -2))', cVal).style('horizontalAlignment', 'center');
                budget.cell('J8').formula('CONCATENATE("' + str + '", LEFT($J$5,LEN($J$5) -2))', cVal).style('horizontalAlignment', 'center');
                setBudgetItems(budget, 0, 8, income);
                let formatValuePeriod = function(col, start, len) {
                    let end = start + len - 1;
                    let pCol = String.fromCharCode(col.charCodeAt(0) + 1);

                    budget.range(col + start + ':' + pCol + end).style('fill', 'f3f3f3');
                    budget.range(pCol + start + ':' + pCol + end).dataValidation(periodValidation);
                };

                formatValuePeriod('B', 9, income.length + 1);
                setBudgetItems(budget, 5, 8, debts);
                formatValuePeriod('H', 9, debts.length);
                budget.range('G9' + ':G' + (8 + debts.length)).style('fill', 'f3f3f3');
                budget.range('K9' + ':L' + (8 + debts.length)).style('fill', 'f3f3f3');
                setBudgetItems(budget, 0, 9 + 2 + income.length, expenses);
                budget.range('A8:D' + (12 + income.length + expenses.length)).style('border', true);
                budget.range('F8:L' + (8 + debts.length)).style('border', true);
                budget.range('B' + (12 + income.length) + ':C' + (11 + expenses.length + income.length)).style('fill', 'f3f3f3');
                formatValuePeriod('B', (12 + income.length), expenses.length);
                let debtRow = 9 + debts.length;

                budget.cell('A' + (9 + income.length)).value(mess.LESS_DEDUCTIONS.toString());
                let row = (10 + income.length);
                let totalARow = row;
                budget.cell('A' + row).value(mess.A_TOTAL_INCOME.toString()).style('bold', true);
                budget.cell('F' + debtRow).value(mess.C_TOTAL_DEBTS.toString()).style('bold', true);

                budget.cell('J' + debtRow).formula('SUM(J9:J' + (debtRow - 1) + ')', totalDebts / 100).style('numberFormat', totalFmt);
                budget.cell('K' + debtRow).formula('SUM(K9:K' + (debtRow - 1) + ')', totalArrears / 100).style('numberFormat', totalFmt);
                budget.cell('L' + debtRow).formula('SUM(L9:L' + (debtRow - 1) + ')', totalOwing / 100).style('numberFormat', totalFmt);
                budget.range('J' + debtRow + ':L' + debtRow).style('border', true).style('bottomBorder', 'double');
                budget.cell('F' + (debtRow + 1)).value('Goals to be obtained:');

                for (let i = 0; i < 4; i++) {
                    budget.range('G' + (debtRow + 1 + i) + ':L' + (debtRow + 1 + i)).merged(true).style({'fill': 'f3f3f3', 'bottomBorder': 'dotted'});
                }

                budget.cell('D' + row).formula('SUM(D9:D' + (row - 2) + ')-(IF(D' + (row - 1) + '="",0,D' + (row - 1) + '))', totalIncome / 100);
                budget.range('A' + row + ':D' + row).style('topBorder', 'thick');
                row++;
                budget.cell('A' + row).value(mess.HOUSEHOLD_EXPENSES.toField()).style('bold', true);
                budget.range('A' + row + ':D' + row).style('topBorder', 'double');
                let start = row + 1;
                row += expenses.length + 1;
                budget.cell('A' + row).value(mess.B_TOTAL_EXPENSES).style('bold', true);
                budget.cell('D' + row).formula('SUM(D' + start + ':D' + (row - 1) + ')', totalHousehold / 100);
                budget.range('A' + row + ':D' + row).style('topBorder', 'thick').style('bottomBorder', 'double');

                budget.cell('A' + (row + 2)).value('Budget Totals:').style('bold', true);
                budget.cell('B' + (row + 2)).value('Enter Total A').style('bold', true);
                budget.cell('D' + (row + 2)).formula('D' + totalARow, totalIncome / 100).style('numberFormat', totalFmt);
                budget.cell('B' + (row + 3)).value('Enter Total B').style('bold', true);
                budget.cell('B' + (row + 4)).value('Enter Total C').style('bold', true);

                budget.cell('B' + (row + 5)).value(rich(['Add ', {value: ' Totals B ', bold: true}, ' & ', {value: ' C', bold: true}]));
                budget.cell('B' + (row + 6)).value(rich(['Deduct ', {value: ' B ', bold: true}, ' & ' , {value: 'C', bold: true}, ' from ', {value: ' Total A', bold: true}]));
                budget.cell('A' + (row + 8)).value('This is your SURPLUS/DEFICIT:').style('bold', true);
                budget.cell('A' + (row + 9)).value('Client Wants:');
                for (let i = 0; i < 5; i++) {
                    budget.range('B' + (row + 9 + i) + ':D' + (row + 9 + i)).merged(true).style({'fill': 'f3f3f3', 'bottomBorder': 'dotted'});
                }

                budget.cell('A' + (row + 10)).value('Please note:');

                budget.cell('A' + (row + 14)).value('Time Factor:');
                budget.range('A' + (row + 14) + ':D' + (row + 14)).style('bottomBorder', true);



                for (let i = 2; i < 7; i++) {
                    budget.cell('A' + (row + i)).style('border', 'thin');
                }


                budget.range('B' + (row + 2) + ':C' + (row + 2)).merged(true).style('border', 'thin');

                budget.cell('D' + (row + 2)).style('border', true);
                budget.cell('D' + (row + 5)).style('border', true);
                budget.cell('D' + (row + 6)).style('border', true);

                budget.cell('C' + (row + 3)).formula('D' + row, totalHousehold / 100).style('numberFormat', totalFmt).style('rightBorder', true);
                budget.cell('C' + (row + 4)).formula('J' + debtRow, totalDebts / 100).style('numberFormat', totalFmt).style('rightBorder', true).style('topBorder', true);
                budget.cell('B' + (row + 4)).style('topBorder', true);
                budget.cell('D' + (row + 5)).formula('C' + (row + 3) + '+C' + (row + 4), (totalDebts + totalHousehold) / 100).style('numberFormat', totalFmt);
                budget.cell('D' + (row + 6)).formula('D' + (row + 2) + '-D' + (row + 5), (totalIncome - totalDebts - totalHousehold) / 100).style({'numberFormat': totalFmt});

                budget.cell('D' + (row + 8)).formula('D' + (row + 6), (totalIncome - totalDebts - totalHousehold) / 100).style({'numberFormat': totalFmt, 'bottomBorder': 'dotted'});

                budget.range('B' + (row + 5) + ':C' + (row + 5)).merged(true).style('border', 'thin');
                budget.range('B' + (row + 6) + ':C' + (row + 6)).merged(true).style('border', 'thin');

                budget.range('J1:L1').style('topBorder', 'thick');
                budget.range('J2:L2').style('bottomBorder', 'thick');
                budget.range('J1:J2').style('leftBorder', 'thick');
                budget.range('L1:L2').style('rightBorder', 'thick');
                budget.range('A1:F1').merged(true).style('borderStyle', 'thick');
                budget.range('B3:D3').merged(true).style('bottomBorder', 'dotted');
                budget.range('B4:D5').merged(true).style('verticalAlignment', 'top').style('bottomBorder', 'dotted');
                budget.range('B6:D6').merged(true);
                budget.column('A').width(39.43);
                budget.column('B').width(13.71);
                budget.column('C').width(11.57);
                budget.column('D').width(11.86);
                budget.column('E').width(8.71);
                budget.column('F').width(43.71);
                budget.column('G').width(24.71);
                budget.column('H').width(14);
                budget.column('I').width(12.86);
                budget.column('J').width(14.71);
                budget.column('K').width(10.43);
                budget.column('L').width(13);

                wb.outputAsync({ type: undefined }).then(function(blob) {
                    saveFile(blob, 'budget-' + (name ? name : 'unamed') + '.xlsx');
                });
            });

        }, budgetB, userB);
};

/**
 * @param {!recoil.frp.Behaviour<number>} idB
 */
budget.widgets.Budget.prototype.attach = function(idB) {
    let frp = this.scope_.getFrp();
    let scope = this.scope_;
    let budgetT = aurora.db.schema.tables.base.budget;
    let storedT = aurora.db.schema.tables.base.budget_mappings;
    let userT = aurora.db.schema.tables.base.user;
    let entryT = budgetT.entries;
    let EntryType = aurora.db.schema.getEnum(entryT.cols.type);
    let notReady = frp.createNotReadyB();
    let totalNames = {};
    totalNames[EntryType.household] = 'Total Expenses (B)';
    totalNames[EntryType.income] = 'Total Income (A)';
    totalNames[EntryType.debt] = 'Total Debts (C)';
    let noneB = frp.createB(null);

    let query = new recoil.db.Query();
    let userId = budget.widgets.BudgetList.getUserId();

    this.budgetMappingB_ = scope.getDb().get(storedT.key, query.eq(storedT.cols.userid, query.val(userId)));

    let budgetB = frp.switchB(frp.liftB(function(id) {
        if (id.length < 1) {
            return noneB;
        }
        let query = new recoil.db.Query();
        return scope.getDb().get(budgetT.key, query.eq(budgetT.cols.id, query.val(id[0][0].db)));
    }, idB));
    this.budgetB_ = budgetB;
    let userB = scope.getDb().get(userT.key, query.eq(userT.cols.id, userId));
    let siteB = scope.getDb().get(aurora.db.schema.tables.base.site.key);

    let periodMeta = aurora.db.schema.getMeta(budgetT.cols.period);

    this.exportWidget_.attachStruct({
        action: this.exportToExcelB_(budgetB, userB),
        text: 'Export'});

    
    this.printWidget_.attachStruct({
        action: this.createPrintB_(budgetB, userB, siteB),
        text: 'Print'});

    let CALC = new recoil.structs.table.ColumnKey('calc');
    let periodB = frp.liftBI(function(budget) {
        let res = goog.object.clone(budget.getColumnMeta(budgetT.cols.period));
        budget.forEach(function(row) {
            res.value = row.get(budgetT.cols.period);
        });
        return res;
    }, function(period) {
        let res = budgetB.get().createEmpty();
        budgetB.get().forEachModify(function(row) {
            row.set(budgetT.cols.period, period.value);
            res.addRow(row);
        });

        budgetB.set(res.freeze());
    }, budgetB);
    
    let citedB = frp.liftBI(function(budget) {
        let res = goog.object.clone(budget.getColumnMeta(budgetT.cols.period));
        budget.forEach(function(row) {
            res.value = row.get(budgetT.cols.cited);
        });
        return res;
    }, function(cited) {
        let res = budgetB.get().createEmpty();
        budgetB.get().forEachModify(function(row) {
            row.set(budgetT.cols.cited, cited.value);
            res.addRow(row);
        });

        budgetB.set(res.freeze());
    }, budgetB);

    this.periodWidget_.attachStruct(periodB);
    this.citedWidget_.attachStruct(citedB);
    let valueColumn = new recoil.ui.columns.Expr(entryT.cols.value, 'Value', {decimalPlaces: 2});
    let arrearsColumn = new recoil.ui.columns.Expr(entryT.cols.arrears, 'Arrears', {decimalPlaces: 2});
    let owingColumn = new recoil.ui.columns.Expr(entryT.cols.owing, 'Owing', {decimalPlaces: 2});
    let totalDecorator = function() {
        let div = goog.dom.createDom('tr', {class: 'budget-total'});
         return new recoil.ui.RenderedDecorator(
             totalDecorator,
             div);
    };

    let totalCellDecorator = function() {
        let div = goog.dom.createDom('td', {class: 'budget-total'});
        return new recoil.ui.RenderedDecorator(
            totalDecorator,
            div);
    };

    let partTable = function(srcB, type) {
        let filteredB = recoil.structs.table.Filter.createColFilterB(srcB, entryT.cols.type, function(v) {return type === null || v === type;});

        let tableB = frp.liftBI(function(tbl, period) {
            var columns = new recoil.ui.widgets.TableMetaData();
            columns.add(entryT.cols.description, '');
            if (type === EntryType.debt) {
                columns.add(entryT.cols.notes, 'Notes');

            }
            columns.addColumn(valueColumn);
            if (type !== null) {
                columns.add(entryT.cols.period, 'Period');
            }
            columns.add(CALC, periodMeta.enumDisplay.resolve(period.value));
            if (type === EntryType.debt) {
                columns.addColumn(arrearsColumn);
                columns.addColumn(owingColumn);
            }


            let res = tbl.createEmpty([], [CALC]);
            let budgetRate = periodMeta.enumInfo[period.value].rate;
            res.addColumnMeta(entryT.cols.description, {displayLength: 19});
            res.addColumnMeta(entryT.cols.notes, {displayLength: 10});
            res.addColumnMeta(entryT.cols.value, {displayLength: 5});
            res.addColumnMeta(entryT.cols.arrears, {displayLength: 5});
            res.addColumnMeta(entryT.cols.owing, {displayLength: 5});
            res.addColumnMeta(CALC, {editable: false, type: 'number', displayLength: 5, step: 0.01});
            let sum = 0;
            let arrearsSum = 0;
            let owingSum = 0;
            let sums = {0: 0, 1: 0, 2: 0};
            let maxPos = 0;
            tbl.forEach(function(row) {
                let mrow = row.unfreeze();
                let value = recoil.util.ExpParser.instance.eval(row.get(entryT.cols.value));
                let arrears = recoil.util.ExpParser.instance.eval(row.get(entryT.cols.arrears));
                let owing = recoil.util.ExpParser.instance.eval(row.get(entryT.cols.owing));
                let period = row.get(entryT.cols.period);
                maxPos = Math.max(row.pos(), maxPos);
                owingSum += owing ? Math.round(owing * 100) : 0;
                arrearsSum += arrears ? Math.round(arrears * 100) : 0;
                if (value != undefined) {
                    let type = row.get(entryT.cols.type);
                    let info = periodMeta.enumInfo[period];
                    if (info) {
                        let val = Math.round(value * 100 / info.rate * budgetRate);
                        sum += val;
                        sums[type] += val;
                        mrow.set(CALC, val / 100);
                    }
                    else {
                        sum = NaN;
                        sums[type] += NaN;
                        mrow.set(CALC, NaN);
                    }
                }
                else {
                    mrow.set(CALC, null);
                }
                if (type !== null) {
                    res.addRow(mrow);
                }
            });
            if (type === null) {
                res.addMeta({editable: false, headerRowDecorator: null});
                let pos = 0;
                /**
                 * @param {string} desc
                 * @param {number} val
                 * @param {number} pos
                 * @param {boolean} last
                 * @param {boolean=} opt_total
                 * @return {recoil.structs.table.MutableTableRow}
                 */
                let makeRow = function(desc, val, pos, last, opt_total) {
                    let total = opt_total;
                    let row = new recoil.structs.table.MutableTableRow(pos++);
                    res.forEachColumn(function(col) {
                        row.set(col, null);
                    });
                    row.set(entryT.cols.id, new aurora.db.PrimaryKey(pos));
                    row.set(entryT.cols.description, desc);
                    if (last) {
                        row.set(CALC, val / 100);
                    }
                    else {
                        row.set(entryT.cols.value, '' + val / 100);
                    }
                    if (total) {
                        row.addCellMeta(CALC, {cellDecorator: totalCellDecorator});
                    }
                    return row;
                };
                res.addRow(makeRow('Total Income (A)', sums[EntryType.income], ++maxPos, true));
                res.addRow(makeRow('Total Household Expenses (B)', sums[EntryType.household],
                                   ++maxPos, false));
                res.addRow(makeRow('Total Debt (C)', sums[EntryType.debt], ++maxPos, false));
                res.addRow(makeRow('Add Totals B & C', sums[EntryType.debt] + sums[EntryType.household], ++maxPos, true));
                res.addRow(makeRow(
                    'Deduct B & C from Total A',
                    sums[EntryType.income] - sums[EntryType.debt] - sums[EntryType.household],
                    ++maxPos, true, true));



            }
            else {
                let totalRow = new recoil.structs.table.MutableTableRow(maxPos + 1);
                res.forEachColumn(function(col) {
                    totalRow.set(col, null);
                });

                totalRow.addRowMeta({editable: false, movable: false, rowDecorator: totalDecorator});
                totalRow.set(CALC, sum / 100);

                totalRow.set(entryT.cols.description, totalNames[type]);
                totalRow.set(entryT.cols.arrears, arrearsSum / 100);
                totalRow.set(entryT.cols.owing, owingSum / 100);
                let nc = new recoil.ui.widgets.table.NumberColumn(CALC, '');
                totalRow.addCellMeta(entryT.cols.owing, nc.getMeta({step: 0.01}) || {});
                totalRow.addCellMeta(entryT.cols.arrears, nc.getMeta({step: 0.01}) || {});

                totalRow.addCellMeta(entryT.cols.arrears, {cellDecorator: totalCellDecorator});
                totalRow.addCellMeta(entryT.cols.period, {visible: false});
                res.addRow(totalRow);
            }
            return columns.applyMeta(res);
        }, function(tbl) {
            if (type === null) {
                return;
            }
            let res = filteredB.get().createEmpty();
            let pos = 0;
            tbl.forEach(function(row) {
                let mrow = row.unfreeze();
                if (row.get(entryT.cols.id) === null) {
                    return;
                }
                mrow.set(entryT.cols.type, type);
                [entryT.cols.description, entryT.cols.notes, entryT.cols.value, entryT.cols.arrears, entryT.cols.owing].forEach(function(col) {
                    mrow.set(col, row.get(col) || '');
                });
                mrow.set(entryT.cols.order, pos++);
                res.addRow(mrow);
            });
            filteredB.set(res.freeze());
        }, filteredB, periodB);
        if (type === null) {
            return tableB;
        }
        return aurora.ui.ErrorWidget.createTable(scope, aurora.widgets.TableWidget.createMovableSizable(tableB));
    };
    let entriesB = recoil.frp.Chooser.if(
        recoil.frp.logic.equal(null, budgetB), null,
        budget.Client.instance.createSubTableB(budgetB, frp.createB(/** @type {Array} */(null)), budgetT.cols.entries));
    this.entriesB_ = entriesB;
    this.helper_.attach(entriesB, userB);
    this.incomeWidget_.attachStruct(partTable(entriesB, EntryType.income));
    this.householdWidget_.attachStruct(partTable(entriesB, EntryType.household));
    this.debtWidget_.attachStruct(partTable(entriesB, EntryType.debt));
    this.totalsWidget_.attachStruct(partTable(entriesB, null));
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Budget.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Budget.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

