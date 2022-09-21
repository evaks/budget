goog.provide('budget.print.ClientPrinter');

goog.require('aurora.db.schema.tables.base.budget');
goog.require('aurora.db.schema.tables.base.user');
goog.require('recoil.structs.table.Table');

/**
 * @constructor
 */
budget.print.ClientPrinter = function() {
    this.budgetT = aurora.db.schema.tables.base.budget;
    this.siteT = aurora.db.schema.tables.base.site;
    this.userT = aurora.db.schema.tables.base.user;
    this.appointmentsT = aurora.db.schema.tables.base.appointments;
    this.entryT = this.budgetT.entries;
    this.EntryType = aurora.db.schema.getEnum(this.entryT.cols.type);
    this.mesg = budget.messages;
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
 * @private
 * @param {!recoil.structs.table.TableRowInterface} user
 * @return {Object} pdfmake print object structure
 */

budget.print.ClientPrinter.prototype.makeChildren_ = function(user) {
    let children = user.get(this.userT.cols.children);
    let fieldName = function(n) {
        return {text: n, bold: true};
    };
    let rows = [
        [fieldName('Child Name'), fieldName('Date of Birth'), fieldName('Age'), fieldName('Gender')]
    ];
    let me = this;
    children.forEach(function(child) {
        let row = [];
        row.push((child.name || '') + '');
        row.push(me.formatDate(child.dateOfBirth));
        row.push(me.formatAge(child.dateOfBirth));
        row.push(me.getEnumVal(child.gender, me.userT.children.cols.gender));
        rows.push(row);
    });

    return [
        {
            margin: [0, 10, 0, 0],
            text: [fieldName('Number of Children'), ' ' + children.length]
        },
        {
            margin: [0, 0, 0, 10],
            layout: {
                vLineWidth: function(i) {
                    return 0;
                },
                hLineWidth: function(i) {
                    return i == 0 ? 0 : 1;
                },
                hLineColor: function(i) {
                    return i < 2 ? 'black' : 'grey';
                },
                paddingLeft: function() {return 0;}

            },

            table: {
                widths: ['*', 'auto', 'auto', 'auto'],
                heights: this.scale(this.lineH),
                body: rows
            }
        }
    ];
};



/**
 * @param {!recoil.structs.table.TableRowInterface} row
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {string}
 */
budget.print.ClientPrinter.prototype.getEnum = function(row, col) {
    return this.getEnumVal(row.get(col), col);
};

/**
 * @param {?number} val
 * @param {!recoil.structs.table.ColumnKey} col
 * @return {string}
 */
budget.print.ClientPrinter.prototype.getEnumVal = function(val, col) {
    if (val == null) {
        return '';
    }
    let meta = aurora.db.schema.getMeta(col);
    return meta.enumDisplay.resolve(val).toString();
};
/**
 * @param {!recoil.structs.table.TableRowInterface} user
 * @return {Object} pdfmake print object structure
 */

budget.print.ClientPrinter.prototype.makeResults_ = function(user) {
    let me = this;
    let fieldName = function(n) {
        return {text: n, bold: true};
    };

    let rows = [
        [fieldName('Budgeting Agreement'), user.get(this.userT.cols.agreementSigned) ? 'Signed' : ''],
        [fieldName('Privacy Waiver'), user.get(this.userT.cols.waiverSigned) ? 'Signed' : ''],
        [fieldName('REFERRED ONTO:'), user.get(this.userT.cols.referral) || ''],
    ];
    this.addTitledRows(rows, this.mesg.RESULTS_COMPLETED, user.get(this.userT.cols.results), 'result');
    return {
        style: 'entry-table',
        layout: 'noBorders',
        table: {
            widths: ['auto', '*'],
            heights: this.scale(this.lineH),
            body: rows
        }
    };
};

/**
 * @param {?number} dob
 * @param {boolean=} opt_left
 * @return {Object}
 */
budget.print.ClientPrinter.prototype.formatAge = function(dob, opt_left) {
    if (dob == undefined) {
        return {text: ''};
    }
    let stop = moment();
    let start = moment(recoil.ui.widgets.DateWidget2.convertLocaleDate(dob));

    return {text: stop.diff(start, 'y') + '', alignment: opt_left ? 'left' : 'right'};
};


/**
 * @param {?number} dt
 * @return {Object}
 */
budget.print.ClientPrinter.prototype.formatDate = function(dt) {
    if (dt == undefined) {
        return {text: ''};
    }
    return {text: moment(recoil.ui.widgets.DateWidget2.convertLocaleDate(dt)).format('ddd D, MMM YYYY')};
};

/**
 * @private
 * @return {Object} pdfmake print object structure
 */

budget.print.ClientPrinter.prototype.makeHeader_ = function() {
    return {
        fontSize: this.scale(this.fontSize * 2),
        stack: [
            {
                alignment: 'center', bold: true,
                width: 'auto',
                text: this.mesg.SERVICE_NAME.toString().toUpperCase(),
            },
            {
                width: '*',
                text: 'Client Profile',
                alignment: 'center', bold: true,
            }
        ]
    };

};


/**
 * @private
 * @param {!recoil.structs.table.TableRowInterface} user
 * @param {!recoil.structs.table.Table} budgets
 * @param {?string} mentorName
 * @return {Object} pdfmake print object structure
 */

budget.print.ClientPrinter.prototype.makeUserDetails_ = function(user, budgets, mentorName) {
    let rows = [[
        {text: this.mesg.NAME.toField(), bold: true},
        {text: ((user.get(this.userT.cols.firstName) || '').trim() + ' '
                + (user.get(this.userT.cols.lastName) || '')).trim(),
         style: 'grey-cell'
        }
    ]];
    let me = this;
    let latestBudget = null;
    budgets.forEach(function(row) {
        if (latestBudget == null) {
            latestBudget = row;
        }
        else {
            if (latestBudget.get(me.budgetT.cols.createTime) < row.get(me.budgetT.cols.createTime)) {
                latestBudget = row;
            }
        }
    });

    let budgetEntries = latestBudget ? latestBudget.get(me.budgetT.cols.entries) : [];
    let debt = null;
    let arrears = null;
    let calc = recoil.util.ExpParser.instance.eval.bind(recoil.util.ExpParser.instance);
    let calcVal = function(v) {
        let res = calc(v);
        if (res) {
            return Math.round(res * 100);
        }
        return 0;
    };

    budgetEntries.forEach(function(entry) {
        if (debt == null) {
            debt = 0;
        }
        if (arrears == null) {
            arrears = 0;
        }
        if (entry.type === me.EntryType.debt) {
            let owing = calcVal(entry.owing);
            if (owing) {
                debt += owing;
            }
            let curArrears = calcVal(entry.arrears);
            if (curArrears) {
                arrears += curArrears;
            }
        }
    });

    let address = (user.get(this.userT.cols.address) || '').split('\n');
    let addressFirstLine = address[0] || '';
    let remainginLines = address.splice(1).join('\n');
    for (let i = 0; i < address.length || i < 3; i++) {
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
    rows.push(['', '']);

    let clientType = '';
    if (user.get(this.userT.cols.newClient) === true) {
        clientType = 'New';
    }
    if (user.get(this.userT.cols.newClient) === false) {
        clientType = 'Existing';
    }
    let fieldName = function(name) {
        return {text: name.toString(), bold: true};
    };
    return {
        fontSize: this.scale(this.fontSize * 2),
        layout: 'noBorders',
        table: {
            widths: ['auto', '*', '1%', 'auto', 'auto'],
            heights: me.scale(me.lineH),
            body: [
                [{
                    margin: [0, 10, 0, 50],
                    text: [{text: this.mesg.FINANCIAL_MENTOR.toString() + ' ', bold: true}, mentorName || ''], colSpan: 5, alignment: 'center'}, '', '', '', ''],
                [
                    fieldName(this.mesg.REFERRAL_DATE), this.formatDate(user.get(this.userT.cols.referralDate)), '',
                    fieldName(this.mesg.LAST_NAME), user.get(this.userT.cols.lastName)],
                [
                    fieldName(this.mesg.ADDRESS), addressFirstLine, '',
                    fieldName(this.mesg.FIRST_NAME), user.get(this.userT.cols.firstName) || ''],
                [
                    '', remainginLines, '',
                    fieldName(this.mesg.PHONE), user.get(this.userT.cols.phone) || ''],
                [
                    fieldName(aurora.messages.EMAIL_ADDRESS),
                    {text: user.get(this.userT.cols.email) || '', colSpan: 4}, '', '', ''],
                [
                    fieldName(this.mesg.MARITAL_STATUS), this.getEnum(user, this.userT.cols.maritalStatus) , '',
                    fieldName(this.mesg.GENDER),
                    this.getEnum(user, this.userT.cols.gender)],
                [
                    fieldName(this.mesg.CLIENT_TYPE), clientType, '',
                    fieldName(this.mesg.INCOME_SOURCE),
                    this.getEnum(user, this.userT.cols.incomeSource)],
                [
                    fieldName(this.mesg.REFERRAL),
                    user.get(this.userT.cols.referral) || '' , '',
                    fieldName(this.mesg.HOUSING),
                    this.getEnum(user, this.userT.cols.housing)],
                [
                    fieldName(this.mesg.ETHICITY),
                    user.get(this.userT.cols.ethnicity) || '', '',
                    fieldName(this.mesg.ARREARS), this.formatCurrency(arrears / 100)],
                [
                    fieldName(this.mesg.COUNTRY_OF_BIRTH),
                    user.get(this.userT.cols.countryOfBirth) || '', '',
                    fieldName(this.mesg.TOTAL_DEBT), this.formatCurrency(debt / 100)],
                [
                    fieldName(this.mesg.DATE_OF_BIRTH),
                    this.formatDate(user.get(this.userT.cols.dateOfBirth)), '',
                    fieldName(this.mesg.DEBT_RETIRED), ''

                ],
                [
                    fieldName(this.mesg.AGE),
                    this.formatAge(
                        user.get(this.userT.cols.dateOfBirth), true),
                    '', fieldName(this.mesg.ACCOUNTS_SIGHTED), this.getEnum(user, this.userT.cols.accountsSighted)],
                ]
        }
    };

};

/**
 * @param {!Array} rows
 * @param {!Array<{when:number, len: number}>} timeSpentList
 */
budget.print.ClientPrinter.prototype.addTimeSpent_ = function(rows, timeSpentList) {
    const fieldName = function(name) {
        return {text: name.toString(), bold: true};
    };
    let timeSpent = 0;
    let timeSpentMap = {};
    
    for (let i = 0; i < timeSpentList.length; i++) {
        timeSpent += (timeSpentList[i].len);
        let day = timeSpentList[i].when;
        
        let mins = (timeSpentMap[day] || 0) + timeSpentList[i].len;
        timeSpentMap[day] = mins;
    }

    let normList = [];
    for (let day in timeSpentMap) {
        normList.push({day: Number.parseInt(day), mins: timeSpentMap[day]});
    }
    normList.sort((x,y) => x.day - y.day);
    
    let formatTime = mins =>
        goog.string.padNumber(Math.floor(mins / 60), 2)
        + ':' + goog.string.padNumber(Math.floor(mins) % 60, 2);
    
    
    const timeCols = 10;
    
    rows.push([fieldName(this.mesg.TIME_SPENT_ON_CASE), formatTime(timeSpent)]);

    let cur = 0;

    if (normList.length > 0) {
        let widths = [];
        for (let i = 0; i < timeCols; i++) {
            widths.push('auto');
        }
        
        let table = {
            widths: widths,
            heights: this.scale(this.lineH),
            body: []
        };
       
    

        for (let i = 0; i < normList.length; i += timeCols) {
            let headerRow = [];
            let dataRow = [];
            let j = i;
            for (; j < normList.length && j < i + timeCols; j++) {
                let el = normList[j];
                headerRow.push(moment(recoil.ui.widgets.DateWidget2.convertLocaleDate(el.day)).format('d/MM/YY'));
                dataRow.push({alignment: 'right', text: formatTime(el.mins)});

            }
            for (;j < i + timeCols; j++) {
                headerRow.push('');
                dataRow.push('');
            }
            table.body.push(headerRow);
            table.body.push(dataRow);
        }
        rows.push([{colSpan: 2, layout: 'noBorders',
                    table}, '']);
    }
};
/**
 * @private
 * @param {!recoil.structs.table.TableRowInterface} user
 * @param {!recoil.structs.table.Table} appointments
 * @return {Object} pdfmake print object structure
 */

budget.print.ClientPrinter.prototype.makeGoals_ = function(user, appointments) {
    let empty = {text: '', border: [false, false, false, false]};
    let underline = {text: '', border: [false, false, false, true]};
    let me = this;
    let seenDates = [];
    let now = new Date().getTime();
    let times = [];
    appointments.forEach(function(row) {
        let when = row.get(me.appointmentsT.cols.start);
        if (when < now) {
            times.push(when);
        }
    });
    let seen = {};
    times.sort((x, y) => x - y).forEach(function(when) {
        let dt = moment(when).format('D/MM/YY');
        if (!seen) {
            seenDates.push(dt);
        }
        seen[dt] = true;
    });

    let fieldName = function(name) {
        return {text: name.toString(), bold: true};
    };


    let timeSpentList = user.get(this.userT.cols.timeSpent) || [];
    
    let rows = [
        [fieldName(this.mesg.DATE_ON_WHICH_MENTOR_SAW_CLIENT), {text: seenDates.join(',')}]];
        
    this.addTimeSpent_(rows, timeSpentList);

    
    rows = rows.concat([
        
        [fieldName(this.mesg.CLIENT_REASON_FOR_COMING), user.get(this.userT.cols.reason) || ''],
    ]);

    let goals = user.get(this.userT.cols.goals) || [];

    this.addTitledRows(rows, this.mesg.GOALS_WORK_TO_BE_DONE, goals, 'goal');
    rows.push([fieldName(this.mesg.MAIN_CAUSE_OF_DEBT), user.get(this.userT.cols.debtCause) || '']);
    return {
        layout: 'noBorders',
        table: {
            widths: ['auto', '*'],
            heights: this.scale(this.lineH),
            body: rows
        }
    };

};
/**
 * @param {!Array<Object>} rows
 * @param {!recoil.ui.message.Message} title
 * @param {!Array<Object>} fields
 * @param {string} fName
 */
budget.print.ClientPrinter.prototype.addTitledRows = function(rows, title, fields, fName) {
    let fieldName = function(name) {
        return {text: name.toString(), bold: true};
    };

    for (let i = 0; i < fields.length || i === 0; i++) {
        let f = fields[i];
        let row = [i === 0 ? fieldName(title) : ''];
        row.push(f ? f[fName] || '' : '');
        rows.push(row);
    }

};
/**
 * @param {?number} val
 * @param {Object=} opt_options
 * @return {Object}
 */
budget.print.ClientPrinter.prototype.formatCurrency = function(val, opt_options) {
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
 * @param {number} v
 * @return {number}
 */
budget.print.ClientPrinter.prototype.scale = function(v) {
    return v * this.scale_;
};

/**
 * @private
 * @param {!recoil.structs.table.TableRowInterface} user
 * @param {!recoil.structs.table.Table} appointments
 * @param {!recoil.structs.table.Table} budgets
 * @param {?string} mentorName
 * @return {Object}
 */
budget.print.ClientPrinter.prototype.createDoc_ = function(user, appointments, budgets, mentorName) {
    let items = [
            this.makeHeader_(),
            this.makeUserDetails_(user, budgets, mentorName),
            this.makeGoals_(user, appointments),
            this.makeChildren_(user),
            this.makeResults_(user)
    ];
    let logo = this.logo ? [{
                alignment: 'left',
                relativePosition: {x: 0, y: this.scale(2)},
	        svg: this.logo,
                fit: [this.scale(90), this.scale(90)]
    }] : [];

    return {
        pageSize: 'A4',
        fontSize: this.scale(this.fontSize),
        pageMargins: [20, 20, 20, 30],
        content: logo.concat(items),
        footer: {
            margin: [0, 0, 10, 0],
            text: moment().format('ddd D, MMM YYYY'), alignment: 'right'
        }
    };
};

/**
 * @param {string} prefix
 * @param {!recoil.structs.table.TableRowInterface} user
 * @param {?} doc
 */
budget.print.ClientPrinter.print = function (prefix, user, doc) {
    if (goog.userAgent.GECKO) {
        pdfMake.createPdf(doc).download(prefix + '.pdf');
    }
    else {
        pdfMake.createPdf(doc).print();
    }
};

/**
 * @param {!recoil.structs.table.TableRowInterface} user
 * @param {!recoil.structs.table.Table} appointments
 * @param {!recoil.structs.table.Table} budgetIn
 * @param {?string} mentorName
 */
budget.print.ClientPrinter.prototype.print = function(user, appointments, budgetIn, mentorName) {
    let me = this;

    let print = function (doc) {
        budget.print.ClientPrinter.print('client', user, doc);
    };
    // since there no function to tell me how big its going to be just do a binary search to
    // find the scale factor
    let bigestScaleFactor = 1;
    let binaryScaleSearch = function(min, max) {
        if (min >= max) {
            me.scale_ = bigestScaleFactor / 100;
            let doc = me.createDoc_(user, appointments, budgetIn, mentorName);
            console.log('data-scaled', recoil.util.object.clone(doc));

            print(doc);
            
            return;
        }
        let mid = Math.floor((min + max) / 2);
        me.scale_ = mid / 100;
        let doc = me.createDoc_(user, appointments, budgetIn, mentorName);
        pdfMake.createPdf(doc)._getPages({}, function(pages) {
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
        let d = me.createDoc_(user, appointments, budgetIn, mentorName);
        console.log('data', recoil.util.object.clone(d));
        // first check if we can print without scaling
        pdfMake.createPdf(d)._getPages({}, function(pages) {
            if (pages.length < 2) {
                let doc = me.createDoc_(user, appointments, budgetIn, mentorName);
                print(doc);
            }
            else {
                binaryScaleSearch(1, 99);
            }
        });

    });
};
