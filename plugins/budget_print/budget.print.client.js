goog.provide('budget.print.BudgetPrinter');

goog.require('aurora.db.schema.tables.base.budget');
goog.require('aurora.db.schema.tables.base.user');
goog.require('recoil.structs.table.Table');

/**
 * @constructor
 */
budget.print.BudgetPrinter = function() {
    this.budgetT = aurora.db.schema.tables.base.budget;
    this.siteT = aurora.db.schema.tables.base.site;
    this.userT = aurora.db.schema.tables.base.user;
    this.entryT = this.budgetT.entries;
    this.EntryType = aurora.db.schema.getEnum(this.entryT.cols.type);
    this.mesg = budget.messages;
    this.periodMeta = aurora.db.schema.getMeta(this.budgetT.cols.period);
    this.scale_ = 1;
    this.lineH = 6;
    this.fontSize = 6;
    this.dotted = function(i, node) {
        return {dash: {length: 1, space: 1}};
    };
    this.clone = recoil.util.object.clone;
    this.logo = null;
};

/**
 * these are stored in cents
 * @typedef {{income:number, debt:number, expenses: number, sum:number}}
 */
budget.print.BudgetPrinter.Tally;

/**
 * @typedef {{
 *     description:string, notes:string,
 *      value:string, arrears:string, owing: string,
 *      period:number, type: number}}
 */
budget.print.BudgetPrinter.Entry;

/**
 * @param {number} period
 * @param {!Array<!budget.print.BudgetPrinter.Entry>} entries
 * @param {!budget.print.BudgetPrinter.Tally} tally
 * @param {!Array<!Array<Object>>} rows
 * @return {Object} pdfmake print object structure
 */

budget.print.BudgetPrinter.prototype.makeIncome = function(period, entries, tally, rows) {

    rows.push([
        {text: this.mesg.INCOME.toString()},
        this.mesg.$_VALUE.toString(),
        this.mesg.PAYMENT_PERIOD.toString(),
        this.mesg.CALCULATED_NL_PER.toString({period: this.periodName(period)})
    ]);
    tally.income = this.processEntries_(period, entries, this.EntryType.income, rows);

    rows.push([
        { total: true, double: true,
            text: this.mesg.A_TOTAL_INCOME.toString(), bold: true}, '', '',
        this.formatCurrency(tally.income / 100)]);
    let me = this;
    return {
        style: 'entry-table',
        layout: {
            paddingRight: function(i, node) { return me.scale(3); },
            paddingLeft: function(i, node) { return me.scale(3); },
	    paddingTop: function(i, node) { return me.scale(2); },
	    paddingBottom: function(i, node) { return me.scale(2); },


            vLineColor: function(i, node) {
                return 'grey';
            },
            hLineColor: function(i, node) {
                let el = node.table.body[i];
                if (el && (el[0].total || el[0].double)) {
                    return 'black';
                }
		return i == 1 ? 'black' : 'grey';
	    },
            hLineWidth: function(i, node) {
                let prev = node.table.body[i - 1];
                if (prev && prev[0].double) {
                    return 1.5;
                }
                return 1;
            },
            hLineStyle: function(i, node) {
                let prev = node.table.body[i - 1];
                if (prev && prev[0].double) {
                    return {multi: [{offset: 0, width: 0.5}, {offset: 1, width: 0.5}]};
                }
                return null;
            },

            vLineStyle: function(i, node) {
                return {multi: [{offset: 0, width: 0.5}, {offset: 1, width: 0.5}]};
            },

        },
        table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            heights: this.scale(this.lineH),
            body: rows
        }
    };
};


/**
 * @private
 * @param {number} period
 * @param {!Array<!budget.print.BudgetPrinter.Entry>} entries
 * @param {!budget.print.BudgetPrinter.Tally} tally
 * @param {!Array<Object>} rows
 */

budget.print.BudgetPrinter.prototype.makeExpenses_ = function(period, entries, tally, rows) {

    rows.push([
        this.mesg.HOUSEHOLD_EXPENSES.toString(), '', '', '']);
    tally.expenses = this.processEntries_(period, entries, this.EntryType.household, rows);
    rows.push([
        { total: true, double: true,
            text: this.mesg.B_TOTAL_EXPENSES.toString(), bold: true}, '', '',
        this.formatCurrency(tally.expenses / 100)]);

};


/**
 * @param {number} period
 * @return {string}
 */
budget.print.BudgetPrinter.prototype.periodName = function(period) {
    if (period == null) {
        return '';
    }
    return this.periodMeta.enumDisplay.resolve(period).toString();
};
/**
 * @param {number} period
 * @param {!Array<!budget.print.BudgetPrinter.Entry>} entries
 * @param {!budget.print.BudgetPrinter.Tally} tally
 * @param {!Array<!Array<Object>>} rows
 * @return {Object} pdfmake print object structure
 */

budget.print.BudgetPrinter.prototype.makeDebt = function(period, entries, tally, rows) {

    rows.push([
        this.mesg.DEBTS_PAYABLE.toString(),
        this.mesg.ADDITIONAL_DESCRIPTION.toString(),
        this.mesg.$_VALUE.toString(),
        this.mesg.PAYMENT_PERIOD.toString(),
        this.mesg.CALCULATED_NL_PER.toString({period: this.periodName(period)}),
        this.mesg.ARREARS.toString(),
        this.mesg.TOTAL_OWING.toString()
    ].map(x => {return {text: x, bold: true};}));
    tally.debt = this.processEntries_(period, entries, this.EntryType.debt, rows);
    let me = this;
    return {
        style: 'entry-table',
        layout: {
            paddingRight: function(i, node) { return me.scale(3); },
            paddingLeft: function(i, node) { return me.scale(3); },
	    paddingTop: function(i, node) { return  me.scale(2); },
	    paddingBottom: function(i, node) { return me.scale(2); },
            
            hLineColor: function (i, node) {
                let el = node.table.body[i];
		return (i == 1  || i + 1 >= node.table.body.length) ? 'black' : 'grey';
	    },
            vLineColor: function (i, node) {
		return 'grey';
	    },
            hLineWidth: function (i, node) {
                let prev = node.table.body[i -1];
                if (prev && prev[0].double) {
                    return 1.5;
                }
                return 1;
            },
            hLineStyle: function (i, node) {
                let prev = node.table.body[i -1];
                if (prev && prev[0].double) {
                    return {multi: [{offset: 0, width: 0.5}, {offset: 1, width: 0.5}]};
                }
                return null;
            }
            
        },
        table: {
            widths: ['*','*','auto','auto','auto','auto','auto'],
            heights: this.scale(this.lineH),
            body: rows
        }
    };
};


/**
 * @private
 * @param {!budget.print.BudgetPrinter.Tally} tally
 * @param {!Array<!Array<Object>>} rows
 * @param {!Array<!Array<Object>>} debtRows
 */

budget.print.BudgetPrinter.prototype.makeTotals_ = function (tally, rows, debtRows) {
    let empty = [
        {text:"", border:[false, false, false, false], total: true},
        {text:"", border:[false, false, false, false]},
        {text:"", border:[false, false, false, false]},
        {text:"", border:[false, false, false, false]}
    ];
    let emptyDebt = [
        {text:""},
        {text:""},
        {text:""},
        {text:""},
        {text:""},
        {text:""},
        {text:""}
    ];
    rows.push(empty);
    let opts = {};
    let formatter = {
        join: function (parts) {
            return {text: parts};
        }, format(type, text) {
            if (type === 'bold') {
                return {text: text, bold: true};
            }
            return text;
        }
    };
    let toAdd =  [
        [
            {text: this.mesg.BUDGET_TOTALS.toField(), total: true},
            {text: this.mesg.ENTER_TOTAL_A.toString(), colSpan: 2},'',
            this.formatCurrency(tally.income/100,opts)
        ],
        [
            {text: ''},
            {text: this.mesg.ENTER_TOTAL_B.toString()},
            this.formatCurrency(tally.expenses/100, opts),
            {text:"", border:[false, false, false, false]}
        ],
        [
            {text: ''},
            {text: this.mesg.ENTER_TOTAL_C.toString()},
            {text: this.formatCurrency(tally.debt / 100,opts)},
            {text:"", border:[false, false, false, false]}
        ],
        [
            {text: ''},
            {text: this.mesg.ADD_TOTALS_B_C.toRichText(formatter), colSpan: 2},'',
            this.formatCurrency((tally.expenses + tally.debt)/100,opts),
        ],
        [
            {text: '', total: true},
            {text: this.mesg.DEDUCT_B_C_FROM_TOTAL_A.toRichText(formatter), colSpan: 2},'',
            this.formatCurrency((tally.income - tally.expenses - tally.debt)/100, opts)
            
        ],    
        [
            {text: this.mesg.THIS_IS_YOU_SUPLUS_DEFICIT.toField(), colSpan: 3, bold: true,
             border: [false, false, false, false]},'','',
            this.formatCurrency((tally.income - tally.expenses - tally.debt)/100, opts)
        ]
    ];
    // ensure left col is as big as right col
    while (rows.length + toAdd.length < debtRows.length) {
        rows.push(recoil.util.object.clone(empty));
    }
    toAdd.forEach(x => rows.push(x));

    // ensure righ col is as big as left col
    while(debtRows.length < rows.length) {
        let r = debtRows.pop();
        debtRows.push(recoil.util.object.clone(emptyDebt));
        debtRows.push(r);
    }
}; 

/**
 * @private
 * @return {Object} pdfmake print object structure
 */

budget.print.BudgetPrinter.prototype.makeFooter_ = function () {
    
    return {
        style: 'left-bottom-table',
        unbreakable: true,
        absolutePosition: {x:0,y:0},
        layout: {
            hLineStyle: function (i, node) {
                if (i === node.table.body.length) {
                    return null;
                }
                return {dash: {length: 1, space: 1}};
            }
        },


        table: {
            widths: ['30%','70%'],
            heights:this.scale(this.lineH),

            body: [
                [
                    {
                        text: this.mesg.CLIENT_WANTS.toField(), border: [false, false, false, false]
                    },
                    { text: "", border: [false, false, false, true]}
                ],
                [
                    {
                        text: this.mesg.PLEASE_NOTE.toField(), border: [false, false, false, false]
                    },
                    { text: "", border: [false, false, false, true]}
                ],[
                    { text: "", border: [false, false, false, false]},
                    { text: "", border: [false, false, false, true]}
                ],[
                    { text: "", border: [false, false, false, false]},
                    { text: "", border: [false, false, false, true]}
                ],
                [{text: this.mesg.TIME_FACTOR.toString(), colSpan: 2, border: [false, false, false, true]}]
            ]

        }
    };

};


/**
 * @private
 * @param {!recoil.structs.table.TableRowInterface} site
 * @param {number} period
 * @return {Object} pdfmake print object structure
 */

budget.print.BudgetPrinter.prototype.makeHeader_ = function (site, period) {
    return {
        fontSize: this.scale(this.fontSize * 2),
        columns: [
            {
                width: 'auto',
                text: this.mesg.SERVICE_NAME.toString().toUpperCase() + ' ph: ' + site.get(this.siteT.cols.phone),
                bold: true
            },
            {
                width: '*',
                text: this.mesg._HOUSEHOLD_BUDGET.toString({period: this.periodName(period)}).toUpperCase(),
                alignment: 'center', bold: true,
                decoration: "underline"
            },

            {
                width: '30%',
		style: 'note-table',
                stack: [
                    {
		        table: {
		            body: [
                                [{text:  [
                                    {text: this.mesg.PLEASE_NOTE.toString() , bold: true},
                                    this.mesg.THIS_BUDGET_IS_BASED.toString() + ' '+ this.mesg.ON_INFORMATION.toString()
                                ]}]
		            ]
		        }
                    },
                    {
                        alignment:'right',
                        relativePosition: {x:0,y:this.scale(2)},
	                svg: this.logo,
                        fit: [this.scale(90), this.scale(90)]
                    }
                ]
	    }
        ]
    };

};


/**
 * @private
 * @param {!recoil.structs.table.TableRowInterface} user
 * @return {Object} pdfmake print object structure
 */

budget.print.BudgetPrinter.prototype.makeUserDetails_ = function (user) {
    let rows = [[
        {text: this.mesg.NAME.toField(), bold: true},
        {text: ((user.get(this.userT.cols.firstName) || '').trim() + ' '
                + (user.get(this.userT.cols.lastName) || '')).trim(),
         style: 'grey-cell'
        }
    ]];
    
    let address = (user.get(this.userT.cols.address) || '').split('\n');

    for (let i = 0; i < address.lines || i < 3; i++) {
        let addrLine = (address[i] || '');
        let name = i === 0 ? this.mesg.ADDRESS.toField() : '';
        rows.push([
            {text: name, bold: true},
            {text: addrLine, style: 'grey-cell'}]);
    }
                
    rows.push([        
        {text: this.mesg.PHONE.toField(), bold: true},
        {
            text: (user.get(this.userT.cols.phone) || '').trim(),
            style: 'grey-cell'
        }
    ]);
    rows.push(['','']);        
    let me = this;
    return {
        layout: 'noBorders',
        fontSize: this.scale(this.fontSize * 2),
        table: {
            style: 'user-table',
            widths: ['auto', '40%'],
            heights: me.scale(me.lineH),            
            body: rows
        }
    };

};

/**
 * @private
 * @return {Object} pdfmake print object structure
 */

budget.print.BudgetPrinter.prototype.makeGoals_ = function () {
    let empty = {text: '', border: [false, false, false, false]};
    let underline = {text: '', border:[false, false, false, true]};
    return {
        style: 'goals-table',
        layout: {
            hLineStyle: this.dotted
        },
        table: {
            widths: ['auto', '*'],
            heights:this.scale(this.lineH),
            body: [
                [
                    {text: this.mesg.GOALS_TO_BE_OBTAINED.toField(), border: [false,false, false,false]},
                    underline
                ],
                [empty, underline],
                [empty, underline],
                [empty, underline],
                [empty, underline],
            ]

        }
    };

};

/**
 * @param {?number} val
 * @param {Object=} opt_options
 * @return {Object}
 */
budget.print.BudgetPrinter.prototype.formatCurrency = function (val, opt_options) {
    if (val == null) {
        return {text: ''};
    }
    let base = {alignment: 'right'};
    goog.object.extend(base, opt_options || {});
    if (isNaN(val) || !isFinite(val)) {
        base.text = 'n/a';
        return base;
    }else {
        base.text = val.toFixed(2);
    }
    if (base.dollar) {
        delete base.dollar;
        return {columns: ['$', base]};
    }
    return base;
};


/**
 * @private
 * @param {number} period
 * @param {!Array<!budget.print.BudgetPrinter.Entry>} entries
 * @param {number} type
 * @param {!Array<!Array>} rows
 * @return {number} the total processes
 */

budget.print.BudgetPrinter.prototype.processEntries_ = function (period, entries, type, rows) {
    let rate = this.periodMeta.enumInfo[period].rate;
    let isDebt = type == this.EntryType.debt;
    let total = 0;
    let totalOwing = 0;
    let totalArrears = 0;
    let calc = recoil.util.ExpParser.instance.eval.bind(recoil.util.ExpParser.instance);
    let calcVal = function (v) {
        let res = calc(v); 
        if (res) {
            return Math.round(res * 100);
        }
        return 0;
    };
    
    for (let i = 0; i < entries.length; i++) {
        let entry = entries[i];
        if (entry.type == type) {
            let row = [(entry.description || '').trim()];

            if (isDebt) {
                row.push((entry.notes || '').trim());
            }

            let val = calc(entry.value);
            if (val == null) {
                row.push('');
            }
            else {
                row.push(this.formatCurrency(val));
            }

            row.push(this.periodName(entry.period));
            let entryRate = this.periodMeta.enumInfo[entry.period] ?
                this.periodMeta.enumInfo[entry.period].rate : null;
            if (val == null) {
                row.push('');
            }
            else {
                if (entryRate) {
                    let pValue = (val * rate)/entryRate;
                    
                    total += Math.round(pValue * 100);

                    row.push(this.formatCurrency(pValue));
                }
                else {
                    row.push(this.formatCurrency(NaN));
                    total = NaN;
                }
            }
            
            totalOwing += calcVal(entry.owing);
            totalArrears += calcVal(entry.arrears);
            
            if (isDebt) {
                row.push(this.formatCurrency(calc(entry.arrears)));
                row.push(this.formatCurrency(calc(entry.owing)));
            }
            rows.push(row);
        }

    }
    if (isDebt) {
        rows.push([
            {double: true, text: budget.messages.C_TOTAL_DEBTS.toString(), bold: true, border:[false,false,false, false]},
            {text:'', border: [false, false, false, false]},
            {text:'', border: [false, false, false, false]},
            {text:'', border: [false, false, false, false]},
            this.formatCurrency(total/100), 
            this.formatCurrency(totalArrears/100), 
            this.formatCurrency(totalOwing/100)]);
    }
    return total;
};

/**
 * @param {number} v
 * @return {number}
 */
budget.print.BudgetPrinter.prototype.scale = function (v) {
    return v * this.scale_;
};

/**
 * @private
 * @param {!recoil.structs.table.TableRowInterface} user
 * @param {!recoil.structs.table.TableRowInterface} budget
 * @param {!recoil.structs.table.TableRowInterface} site
 * @return {Object}
 */
budget.print.BudgetPrinter.prototype.createDoc_ = function (user, budget, site) {
    let entries = budget.get(aurora.db.schema.tables.base.budget.cols.entries).filter(x=>true).sort((x,y)=> x.order - y.order);
    let totals = {
        income: 0,
        debt: 0,
        expenses: 0,
        sum: 0
    };
    let period = budget.get(this.budgetT.cols.period);
    let col1Rows = [];
    let col2Rows = [];
    let income = this.makeIncome(period, entries,totals, col1Rows);
    this.makeExpenses_(period, entries, totals, col1Rows);
    let debt = this.makeDebt(period, entries, totals, col2Rows);
    let pdfTotals = this.makeTotals_(totals, col1Rows, col2Rows);
    let me = this;
    let goals = this.makeGoals_();
    
    return {
        pageOrientation: 'landscape',
        pageSize : "A4",
        fontSize: this.scale(this.fontSize),
        pageMargins: [ 20, 20, 20, 20 ],
        content: [
            this.makeHeader_(site, period),
            this.makeUserDetails_(user),
            {
                columns: [
                    {
                        width: "40%",
                        stack: [
                            income,
                            this.makeFooter_()
                        ]
                    },{width:10, text:""},
                    {
                        width: "*",
                        stack: [
                            debt,
                            goals,

                        ]
                    }

                ]
            }
        ],
        styles: {
            'grey-cell': {
                fillColor: '#ccc'
            },
            'note-table': {
		margin: [0, 5, 0, this.scale(15)]
	    },
            'user-table': {
                fontSize: this.scale(this.fontSize)
            },
            "entry-table": {
                fontSize: this.scale(this.fontSize),
                heights: me.scale(me.lineH),
            },
            "goals-table": {
                fontSize: me.scale(me.fontSize),
            },
            "left-bottom-table" : {
                fontSize:me.scale(me.fontSize),
                heights: me.scale(me.lineH),
            }
        
        }
    };
};
/**
 * @param {!recoil.structs.table.TableRowInterface} user
 * @param {!recoil.structs.table.TableRowInterface} budget
 * @param {!recoil.structs.table.TableRowInterface} site
 */
budget.print.BudgetPrinter.prototype.print = function (user, budget, site) {
    let me = this;

    // since there no function to tell me how big its going to be just do a binary search to
    // find the scale factor
    let bigestScaleFactor = 1;
    let binaryScaleSearch = function (min, max) {
        if (min>=max) {
            me.scale_ = bigestScaleFactor/100;
            let doc = me.createDoc_(user, budget, site);
            console.log("data-scaled", recoil.util.object.clone(doc));    
            pdfMake.createPdf(doc).print();
            return;
        }
        let mid = Math.floor((min + max)/2);
        me.scale_ = mid/100;
        let doc = me.createDoc_(user, budget, site);
        pdfMake.createPdf(doc)._getPages({}, function (pages) {
            if (pages.length < 2) {
                bigestScaleFactor = Math.max(bigestScaleFactor, mid);
                binaryScaleSearch(mid + 1, max);
            }
            else {
                binaryScaleSearch(min, mid - 1);
            }
        });
    };
    
    goog.net.XhrIo.send('/images/budget-logo.svg', function(e) {
        let xhr = e.target;
        me.logo = xhr.getResponseText();
        me.scale_ = 1;
        let d = me.createDoc_(user, budget, site);
        console.log("data", recoil.util.object.clone(d));    
        // first check if we can print without scaling
        pdfMake.createPdf(d)._getPages({}, function (pages) {
            if (pages.length < 2) {
                let doc = me.createDoc_(user, budget, site);
                pdfMake.createPdf(doc).print();
            }
            else {
                binaryScaleSearch(1,99);
            }
        });
        
    });



    
};
