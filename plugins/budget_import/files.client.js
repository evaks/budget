goog.provide('budget.widgets.import.FileWidget');


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
budget.widgets.import.FileWidget = function(scope) {
    this.scope_ = scope;
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let filesContainer = cd('div', {class: 'budget-import-files-display'});
    let dateContainer = cd('div', {});

    let importInput = cd('input', {type: 'file', multiple: true, accept: '.csv,.qif'});
    let importDiv = cd('label', {class: 'budget-import custom-file-upload'},
                       importInput, goog.dom.createDom('i', {class: 'budget-import'}, 'Add File(s)'));
    let COLS = budget.widgets.import.FileWidget.COLS;

    this.filesB_ = this.createEmptyB_();
    this.validateB_ = frp.liftB(function(files) {
        let count = 0;
        let valid = true;
        files.forEach(function(row) {
            let start = row.get(COLS.START);
            let stop = row.get(COLS.END);
            if (start == undefined || stop == undefined || isNaN(start) || isNaN(stop)) {
                valid = false;
            }
            count++;
        });
        if (count === 0) {
            return new recoil.ui.BoolWithExplanation(false, budget.messages.YOU_MUST_HAVE_AT_LEAST_1_FILE);
        }
        if (!valid) {
            return new recoil.ui.BoolWithExplanation(false, budget.messages.THERE_ARE_INVALID_FILES);
        }
        return recoil.ui.BoolWithExplanation.TRUE;


    }, this.filesB_);
    importInput.addEventListener('change', this.loadFiles_.bind(this));
    importInput.addEventListener('click', function(e) {
        importInput.value = null;
    });
    this.importInput_ = importInput;
    let container = cd('div', {}, cd('h2', {}, 'Select files to import'),
                       cd('div', 'budget-import-info',
                          'Currently we support the following file formats:',
                          cd('ul', {},
                             cd('li', {}, 'CSV - ASB, ANZ visa, BNZ.'),
                             cd('li', {}, 'CVS - ', cd('a', {href:'/budget-import.xlsx'}, 'Budget Excel format then export to CVS.')),
                             cd('li', {}, 'QIF - ANZ, ASB, BNZ, maybe others.'),
                            ), 'If you would like us to support another format contact us and we will see what we can do.'),
                       importDiv, filesContainer, dateContainer);
    let filesWidget = new recoil.ui.widgets.table.TableWidget(scope);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
    filesWidget.attachStruct(this.filesB_);
    filesWidget.getComponent().render(filesContainer);
};
/**
 * @return {!recoil.frp.Behaviour<!recoil.ui.BoolWithExplanation>}
 */
budget.widgets.import.FileWidget.prototype.getValidateB = function() {
    return this.validateB_;
};
/**
 * @private
 * @param {?} e
 */
budget.widgets.import.FileWidget.prototype.loadFiles_ = function(e) {
    let scope = this.scope_;
    let frp = this.scope_.getFrp();
    let todo = {};
    let done = [];
    let me = this;
    for (let i = 0; i < this.importInput_.files.length; i++) {
        let file = this.importInput_.files[i];
        todo[i] = file;

        let reader = new FileReader();
        reader.onload = function(e) {
            var contents = e.target.result;
            done.push({file: todo[i], content: contents});
            delete todo[i];
            if (recoil.util.map.isEmpty(todo)) {
                me.importFiles_(done);
            }
        };
        reader.readAsText(file);
    }
};
/**
 * @param {number} type
 * @param {string} content
 * @param {string} name
 * @return {?{start:number,stop:number}}
 */

budget.widgets.import.FileWidget.getContentInfo = function(type, content, name) {
    let toLocal = function(v) {
        if (v === null) {
            return null;
        }
        return recoil.ui.widgets.DateWidget2.convertDateToLocal(new Date(v));
    };

    let types = budget.widgets.import.FileWidget.FILE_TYPES;
    let data = types[type].matcher.parse(content, name);
    let lines = data.rows;
    let start = toLocal(data.start);
    let end = toLocal(data.stop);
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let date = toLocal(line.date);
        start = start === null ? date : Math.min(start, date);
        end = end === null ? date : Math.max(end, date);
    }

    return {start: start, stop: end, rows: lines};

};
/**
 * @param {?number} type
 * @param {!recoil.structs.table.MutableTableRow} row
 */
budget.widgets.import.FileWidget.prototype.updateRowType = function(type, row) {
    let types = budget.widgets.import.FileWidget.FILE_TYPES;
    let COLS = budget.widgets.import.FileWidget.COLS;
    let start = null;
    let end = null;
    let period = 'Unknown';
    row.set(COLS.ORIG_TYPE, type);
    if (type !== null) {
        let content = row.get(COLS.CONTENT);

        try {
            period = '0 days';
            let info = budget.widgets.import.FileWidget.getContentInfo(type, content, row.get(COLS.NAME));
            start = info.start;
            end = info.stop;
            let toDate = recoil.ui.widgets.DateWidget2.convertLocaleDate;
            let startM = moment(toDate(start));
            let endM = moment(toDate(end)).add(1, 'd');
            let dur = moment.duration(endM.diff(startM));
            let days = Math.floor(dur.asDays());
            let months = Math.floor(dur.asMonths());
            if (months) {
                period = months + ' month' + (months == 1 ? '' : 's');
            }
            else {
                period = days + ' day' + (days == 1 ? '' : 's');
            }
        }
        catch (e) {}
    }
    row.set(COLS.START, start);
    row.set(COLS.END, end);
    row.set(COLS.PERIOD, period);

};

/**
 * @return {!budget.ImportData}
 */
budget.widgets.import.FileWidget.prototype.getRows = function() {
    let frp = this.scope_.getFrp();
    let res = {start: null, stop: null, rows: []};
    let me = this;
    let COLS = budget.widgets.import.FileWidget.COLS;
    frp.accessTrans(function() {
        me.filesB_.get().forEach(function(row) {
            let info = budget.widgets.import.FileWidget.getContentInfo(
                row.get(COLS.TYPE), row.get(COLS.CONTENT), row.get(COLS.NAME));
            res.start = res.start === null ? info.start : Math.min(res.start, info.start);
            res.stop = res.stop === null ? info.stop : Math.max(res.stop, info.stop);
            info.rows.forEach(function(row) {
                res.rows.push(row);
            });
        });
    }, this.filesB_);
    return res;
};
/**
 * @private
 * @param {!Array<{file:?,content:string}>} files
 */
budget.widgets.import.FileWidget.prototype.importFiles_ = function(files) {
    let types = budget.widgets.import.FileWidget.FILE_TYPES;
    let frp = this.scope_.getFrp();
    let COLS = budget.widgets.import.FileWidget.COLS;
    let me = this;
    frp.accessTrans(function() {
        let tbl = me.filesB_.get().unfreeze();
        let pos = 0;
        tbl.forEach(function(r) {
            pos = Math.max(r.pos(), pos);
        });
        pos++;
        for (let i = 0; i < files.length; i++) {
            let f = files[i];
            let row = new recoil.structs.table.MutableTableRow(pos++);
            row.set(COLS.NAME, f.file.name);
            row.set(COLS.CONTENT, f.content);
            let matchTypes = budget.widgets.import.FileWidget.findImportFileMatches(types, f);
            me.updateRowType(matchTypes.length > 0 ? matchTypes[0] : null, row);
            row.set(COLS.TYPE, matchTypes.length > 0 ? matchTypes[0] : null);
            row.addCellMeta(COLS.TYPE, {list: matchTypes});
            tbl.addRow(row);
        }
        me.filesB_.set(tbl.freeze());
    }, me.filesB_);
};

/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.OFX = function(name, content, data) {
    if (/\.ofx$/i.test(name)) {
        let header = content.match(/\r?\n\r?\n/);
        if (!header) {
            return false;
        }
        let headerLines = header.input.split(/\r?\n/);
        if (headerLines[0].indexOf('OFXHEADER') !== 0) {
            return false;
        }

        //OFXHEADER:100
        //DATA:OFXSGML
        //VERSION:102
        //SECURITY:NONE
        //ENCODING:USASCII
        //CHARSET:1252
        //COMPRESSION:NONE
        //OLDFILEUID:NONE
        //NEWFILEUID:NONE
        return true;
    }
    return false;

};


/**
 * @param {!Array<{name:string,matcher:function(string,string,?):boolean}>} types
 * @param {?} file
 * @return {!Array<number>} the possilbe matches for this file
 */
budget.widgets.import.FileWidget.findImportFileMatches = function(types, file) {
    file.data = {};
    let res = [];
    for (let i = 0; i < types.length; i++) {
        try {
            if (types[i].matcher(file.file.name, file.content, file.data)) {
                if (budget.widgets.import.FileWidget.validate(types[i].matcher.parse(file.content, file.file.name))) {
                    res.push(i);
                }
            }
        }
        catch (e) {
            // matchers may throw that just means they don't match
            console.log('match failed', e.message);
        }
    }
    return res;
};

/**
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */
budget.widgets.import.FileWidget.prototype.createEmptyB_ = function() {
    let columns = new recoil.ui.widgets.TableMetaData();
    let COLS = budget.widgets.import.FileWidget.COLS;
    let tbl = new recoil.structs.table.MutableTable([COLS.ID], [
        COLS.NAME, COLS.TYPE, COLS.ORIG_TYPE, COLS.CONTENT, COLS.START, COLS.END, COLS.PERIOD, COLS.DEL]);

    let types = budget.widgets.import.FileWidget.FILE_TYPES;
    let typeMap = {};
    let typeEnum = {};
    types.forEach(function(x, idx) {
        typeMap[idx] = x;
        typeEnum[x.name] = idx;


    });
    tbl.setMeta({'typeFactories': aurora.Client.typeFactories});
    tbl.setColumnMeta(COLS.NAME, {type: 'string', editable: false});
    tbl.setColumnMeta(COLS.START, {type: 'date', editable: false});
    tbl.setColumnMeta(COLS.END, {type: 'date', editable: false});
    tbl.setColumnMeta(COLS.PERIOD, {type: 'string', editable: false});
    tbl.setColumnMeta(COLS.TYPE, {
        type: 'enum', list: types.map((x, id) => id),
        renderer: recoil.ui.renderers.MapRenderer(typeEnum, recoil.ui.messages.NONE)});
    tbl.setColumnMeta(COLS.DEL, {
        cellWidgetFactory: aurora.widgets.TableWidget.delFactory});
    columns.add(COLS.NAME, 'File Name');
    columns.add(COLS.TYPE, 'Type');
    columns.add(COLS.START, 'Start');
    columns.add(COLS.END, 'Stop');
    columns.add(COLS.PERIOD, 'Length');
    columns.add(COLS.DEL, '');
    let frp = this.scope_.getFrp();
    let sourceB = frp.createB(columns.applyMeta(tbl));
    let me = this;

    return frp.liftBI(function(t) {
        return t;
    }, function(v) {
        let res = v.createEmpty();
        v.forEachModify(function(r) {
            if (!r.get(COLS.DEL)) {
                if (r.get(COLS.TYPE) != r.get(COLS.ORIG_TYPE)) {
                    me.updateRowType(r.get(COLS.TYPE), r);
                }
                res.addRow(r);
            }
        });
        sourceB.set(res.freeze());
    }, sourceB);
};
/**
 * @final
 */
budget.widgets.import.FileWidget.COLS = {
    ID: aurora.db.createId('id'),
    NAME: new recoil.structs.table.ColumnKey('name'),
    TYPE: new recoil.structs.table.ColumnKey('type'),
    ORIG_TYPE: new recoil.structs.table.ColumnKey('orig-type'),
    START: new recoil.structs.table.ColumnKey('start'),
    END: new recoil.structs.table.ColumnKey('end'),
    PERIOD: new recoil.structs.table.ColumnKey('period'),
    CONTENT: new recoil.structs.table.ColumnKey('content'),
    DEL: new recoil.structs.table.ColumnKey('del', undefined, undefined, null)

};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.import.FileWidget.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.import.FileWidget.prototype.flatten = recoil.frp.struct.NO_FLATTEN;



/**
 * @param {string} txt
 * @param {{col: number, count: number}=} handleComma if this is defined then this column can have unescaped commas it this will just be added to the  
 * @return {Array<Array<string>>}
 */
budget.widgets.import.FileWidget.parseCSV = function(txt, handleComma) {
    let lines = [];
    let inQuote = false;
    let curField = '';
    let curLine = [];
    function fixComma(line) {
        // strip any blanks at the end of the line in the csv
        if (handleComma) {
            while (line.length > 0 && line[line.length -1].trim() == '') {
                line.pop();
            }
        }
        if (handleComma && line.length > handleComma.count) {
            let diff = line.length - handleComma.count;
            
            let newLine = [];
            let pos = 0;
            while (newLine.length <= handleComma.col) {
                newLine.push(line[pos++]);
            }
            for (let i = 0; i < diff; i++) {
                newLine[newLine.length -1] =  newLine[newLine.length -1] + ',' + line[pos++];
            }
            while (pos < line.length) {
                newLine.push(line[pos++]);
            }
            return newLine;
        }
            
        return line;
    }
    for (let i = 0; i < txt.length; i++) {
        let ch = txt[i];
        if (!inQuote) {
            if (ch == ',') {
                curLine.push(curField.trim());
                curField = '';
            }
            else if (ch === '"') {
                inQuote = true;
            }
            else if (ch == '\r' || ch === '\n') {
                // end of line
                if (ch === '\r' && txt[i + 1] === '\n') {
                    i++;
                }

                if (curField.trim().length === 0 && curLine.length === 0) {
                    // blank line just continue
                    curField = '';
                    continue;
                }
                else {
                    curLine.push(curField.trim());
                    lines.push(fixComma(curLine));
                    curLine = [];
                    curField = '';
                }
            }
            else {
                curField += ch;
            }
        }
        else {
            // we are in quotes
            if (ch === '"') {
                if (txt[i + 1] === '"') {
                    i++;
                    curField += '"';
                }
                else {
                    inQuote = false;
                }
            }
            else {
                curField += ch;
            }
        }
    }
    // handle no new line at end of file
    if (curLine.length > 0 || curField.trim().length > 0) {
        if (curField.trim().length > 0) {
            curLine.push(curField);
        }
        lines.push(fixComma(curLine));
    }
    return lines;
};

/**
 * @param {budget.ImportData} parsed
 * @return {boolean}
 */
budget.widgets.import.FileWidget.validate = function(parsed) {
    if (!parsed || !parsed.rows || parsed.rows.length === 0) {
        return false;
    }
    for (let i = 0; i < parsed.rows.length; i++) {
        let row = parsed.rows[i];
        if (row.amount == undefined || isNaN(row.amount)) {
            return false;
        }
        if (row.date == undefined || isNaN(row.date)) {
            return false;
        }
        if (row.memo == undefined || row.description == undefined) {
            return false;
        }
    }
    return true;
};

/**
 * @param {!Array<string>} headers
 * @param {string} dateCol
 * @param {string} partCol
 * @param {?string} refCol
 * @param {string} amountCol
 * @param {{
 *           needsHeader:(boolean|undefined),
 *           skipHeaderCheck:(boolean|undefined),
 *           skipFunc:((function(number, !Array<string>,!Array<string>):boolean)|undefined),
 *           matchFunc:((function(!Array<!Array<string>>,!Array<string>):boolean)|undefined),
 *           parseAmount:((function(string,!Array<string>):number)|undefined),
 *           reformat:((function(string,string,!Array<string>):string)|undefined),
 *           parseDate:((function(string):number)|undefined)}} opts
 * @return {function(string, string, ?):boolean} name, content, data
 */
budget.widgets.import.FileWidget.makeMatcher = function(
    headers, dateCol, partCol, refCol, amountCol, opts) {
    let needsHeaders = opts.needsHeader === undefined ? true : opts.needsHeader;
    let skipHeaderCheck = !!opts.skipHeaderCheck;
    let skip = function(lines) {
        let pos = 0;
        if (opts.skipFunc) {
            for (; pos < lines.length; pos++) {
                if (!opts.skipFunc(pos, lines[pos], headers)) {
                    break;
                }
            }
        }
        return pos;
    };
    let minRowSize = [dateCol, partCol, refCol, amountCol].reduce((a, v) => Math.max(headers.indexOf(v), a), 0) + 1;

    let parse = function(content, name) {
        let lines = budget.widgets.import.FileWidget.parseCSV(content, opts.handleCommas != undefined ? {col: opts.handleCommas, count: headers.length} : undefined);
        let pos = skip(lines);
        let amountIndex = headers.indexOf(amountCol);
        let refIndex = refCol ? headers.indexOf(refCol) : -1;
        let partIndex = headers.indexOf(partCol);
        let dateIndex = headers.indexOf(dateCol);
        let parseAmount = opts.parseAmount || function(v) {
            return Math.round(parseFloat(v) * 100) / 100;
        };
        let parseDate = opts.parseDate || function(v) {
            return moment(v, 'D/M/YYYY').toDate().getTime();
        };

        const reformat = opts.reformat || function (value, field, line) {return  value;};
            

        if (recoil.util.object.isEqual(lines[pos], headers) || skipHeaderCheck) {
            pos++;
        } else if (needsHeaders) {
            return null;
        }
        let res = [];
        let range = opts.getRange ? opts.getRange(lines, name) : {start: null, stop: null};
        let start = range.start;
        let stop = range.stop;
        for (let i = pos; i < lines.length; i++) {
            let line = lines[i];
            let date = parseDate(reformat(line[dateIndex], dateCol, line));
            start = start === null ? date : Math.min(start, date);
            stop = stop === null ? date : Math.max(stop, date);
            res.push({
                date: date,
                description: reformat(line[partIndex], partCol, line),
                memo: reformat(line[refIndex], refCol, line) || '',
                amount: parseAmount(reformat(line[amountIndex], amountCol, line), line)
            });
        }

        return {start: start, stop: stop, rows: res};
    };
    let matcher = function(name, content, data) {
        if (/\.csv$/i.test(name)) {
            let lines = data.csv || budget.widgets.import.FileWidget.parseCSV(content);

            if (opts.matchFunc && !opts.matchFunc(lines, headers)) {
                return false;
            }
            return true;

        }
        return false;
    };
    matcher.parse = parse;
    return matcher;
};

/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.QIF = function(name, content, data) {
    if (/\.qif$/i.test(name)) {
        let lines = budget.widgets.import.FileWidget.QIF.parse(content, name);

        return !!lines;
    }
    return false;

};

/**
 * @param {!Array<string>} lines
 * @param {string} name
 * @return {{start:?number,stop:?number}}
 */
budget.widgets.import.FileWidget.QIF.getRange = function(lines, name) {
    return budget.widgets.import.FileWidget.BNZ_GET_RANGE('.qif')(lines, name);
};


/**
 * @param {string} v
 * @return {?number} time in milli
 */
budget.widgets.import.FileWidget.QIF.parseDate_ = function(v) {
    let m = moment(v, 'D/M/YYYY');
    if (m.isValid()) {
        return m.toDate().getTime();
    }
    return null;
};
/**
 * @param {string} content
 * @param {string} name
 * @return {?budget.ImportData}
 */
budget.widgets.import.FileWidget.QIF.parse = function(content, name) {
    let cLines = content.split(/\r?\n/);
    let types = {
        'D': {field: 'date', parse: budget.widgets.import.FileWidget.QIF.parseDate_},
        'T': {field: 'amount', parse: parseFloat},
        'U': {field: 'amount', parse: parseFloat},
        'M': {field: 'memo', parse: function(v) {return v;}},
        'C': {field: null}, // cleared
        'N': {field: null}, // check num
        'P': {field: 'description', parse: function(v) {return v;}},
        '/': {field: null}, // account information balance date
        'L': {field: null}, // category
        'A': {field: null}, // address of payee
        'S': {field: null}, // split category
        'E': {field: null}, // split memo
        '%': {field: null}, // percent on splits
        'Y': {field: null}, // security name
        'I': {field: null}, // price
        'Q': {field: null}, // quantiy of shares
        'O': {field: null}, // commision cost
        '$': {field: 'amount', parse: function(v) {return v;}}, // for transfers
        'B': {field: null}, // budgeted amount
        'X': {field: null}, // invoices
    };





    if (!/^!Type:/.test(cLines[0])) {
        return null;
    }

    var curRecord = /** @type {?} */ ({memo: ''});
    var result = [];
    let range = budget.widgets.import.FileWidget.QIF.getRange([], name);
    let start = range.start;
    let stop = range.stop;
    for (var i = 1; i < cLines.length; i++) {
        let line = cLines[i].trim();
        if (line.trim().length === 0) {
            continue;
        }
        if (line == '^') {
            let date = curRecord.date;
            if (date !== undefined) {
                start = start === null ? curRecord.date : Math.min(start, date);
                stop = stop === null ? curRecord.date : Math.min(stop, date);
                if (curRecord.description === undefined && curRecord.memo !== '') {
                    curRecord.description = curRecord.memo;
                }
                result.push(curRecord);
            }
            curRecord = {memo: ''};
        }
        else {
            let type = line[0];
            let typeInfo = types[type];

            if (!typeInfo) {
                return null;
            }
            if (!typeInfo.field) {
                continue;
            }
            let val = typeInfo.parse(line.substring(1));
            if (val === null) {
                return null;
            }
            curRecord[typeInfo.field] = val;
        }

    }
    return {start: start, stop: stop, rows: result};
};
/**
 * @param {string} ext
 * @return {function(string, string):{start:?number,stop:?number}}
 */
budget.widgets.import.FileWidget.ANZ_GET_RANGE = function(ext) {

    return function(content, name) {
        if (name.endsWith(ext)) {
            let base = name.substring(0, name.length - ext.length);
            let match = base.match(/_([0-9]{4})-([0-9]{2})-([0-9]{2})_([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
            if (match) {
                let start = new Date(match[1], parseInt(match[2], 10) - 1, match[3]).getTime();
                let stop = new Date(match[4], parseInt(match[5], 10) - 1, match[6]).getTime();
                return {start, stop};
            }
        }
        return {start: null, stop: null};

    };
};


/**
 * @param {string} ext
 * @return {function(string, string):{start:?number,stop:?number}}
 */
budget.widgets.import.FileWidget.BNZ_GET_RANGE = function(ext) {
    let months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    let dateReg = "-([0-9]{2})(" + months.join('|') + ")([0-9]{4})";
    const rangeReg = new RegExp(dateReg + "-to" + dateReg + "$", "i");
    
    return function(content, name) {
        if (name.endsWith(ext)) {
            let base = name.substring(0, name.length - ext.length);
            let match = base.match(rangeReg);
            if (match) {
                let start = new Date(match[3], months.indexOf(match[2].toUpperCase()), match[1]).getTime();
                let stop = new Date(match[6], months.indexOf(match[5].toUpperCase()), match[4]).getTime();
                return {start, stop};
            }
        }
        return {start: null, stop: null};

    };
};

/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.ASB_CSV = budget.widgets.import.FileWidget.makeMatcher(
    ['Date', 'Unique Id', 'Tran Type', 'Cheque Number', 'Payee', 'Memo', 'Amount'],
    'Date', 'Payee', 'Memo', 'Amount', {
        matchFunc: function(lines) {
            if (lines.length < 2) {
                return false;
            }
            return lines[1][0].split(';')[0] === 'Bank 12';
        },
        skipFunc(pos, line, header) {
            return line.length != header.length;
        },
        parseDate: function(v) {
            return moment(v, 'YYYY/M/D').toDate().getTime();
        },
        getRange(lines) {
            let start = null;
            let stop = null;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (line.length === 1) {
                    if (/^from date [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]/i.test(line[0])) {
                        start = moment(line[0].substring('from date'.length).trim(), 'YYYYMMDD').toDate().getTime();
                    }
                    if (/^to date [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]/i.test(line[0])) {
                        stop = moment(line[0].substring('to date'.length).trim(), 'YYYYMMDD').toDate().getTime();
                    }
                }
            }
            return {start, stop};
        }
    });


/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */

budget.widgets.import.FileWidget.ANZ_CSV = budget.widgets.import.FileWidget.makeMatcher(
    ['Type', 'Details', 'Particulars', 'Code', 'Reference', 'Amount', 'Date', 'ForeignCurrencyAmount', 'ConversionCharge'],
    'Date', 'Particulars', 'Reference', 'Amount', {
        needsHeader: false,
        matchFunc: function(lines, header) {
            if (lines.length < 1) {
                return false;
            }
            let line = lines[0];

            return recoil.util.object.isEqual(header, line) || (
                /^(D|C|Transfer)$/.test(line[0])
            );
        },
        parseAmount(v, line) {
            let mul = line[0] == 'D' ? -1 : 1;
            return Math.round(mul * parseFloat(v) * 100) / 100;
        },
        getRange: budget.widgets.import.FileWidget.ANZ_GET_RANGE('.csv')

    });

/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */

budget.widgets.import.FileWidget.RABO_CSV = budget.widgets.import.FileWidget.makeMatcher(
    ['Date','Description','Account','Debit','Credit'],
    'Date', 'Description', 'Account', 'Debit', {
        needsHeader: true,
        skipHeaderCheck: true,
        matchFunc: function(lines, header) {
            if (lines.length < 1) {
                return false;
            }
            let line = lines[0];

            return recoil.util.object.isEqual(header, line) || recoil.util.object.isEqual(
                line, ['Date','Description','Account','Debit','Credit','Balance']);
        },
        parseAmount(v, line) {
            let debit = line[3].replace(/^\$/, "");
            let credit = line[4].replace(/^\$/, "");
            let res = 0; 
            if (debit != '') {
                return Math.round(-parseFloat(debit) * 100) / 100;
            }
            return Math.round(parseFloat(credit) * 100) / 100;
        },
        getRange: null

    });
    

/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.COOP_CSV = budget.widgets.import.FileWidget.makeMatcher(
    ['Date','Details','Amount','Balance'], 'Date', 'Details', undefined, 'Amount', {
        needsHeader: true,
        handleCommas: 1,
        matchFunc: function (lines, header) {
            if (lines.length < 1) {
                 return false;
            }
            return recoil.util.object.isEqual(header, lines[0]);
        },
        parseAmount(v, line) {
            return Math.round(parseFloat(v) * 100) / 100;
         },
        getRange: null
        
     });


/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.BNZ_CSV = budget.widgets.import.FileWidget.makeMatcher(
    ['Date','Amount','Payee','Particulars','Code','Reference','Tran Type','This Party Account',
     'Other Party Account','Serial','Transaction Code','Batch Number','Originating Bank/Branch',
     'Processed Date'], 'Date', 'Payee', 'Reference', 'Amount', {
         needsHeader: true,
         matchFunc: function (lines, header) {
             if (lines.length < 1) {
                 return false;
             }
             return recoil.util.object.isEqual(header, lines[0]);
         },
         parseAmount(v, line) {
             let mul = line[1] == 'D' ? -1 : 1;
             return Math.round(mul * parseFloat(v) * 100) / 100;
         },
         getRange: budget.widgets.import.FileWidget.BNZ_GET_RANGE('.csv')
         
     });

/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.KIWIBANK_B_CSV = budget.widgets.import.FileWidget.makeMatcher(
    ['Date','Particulars','X','Amount','Balance'], 'Date', 'Particulars', 'Reference', 'Amount', {
        needsHeader: true,
        skipHeaderCheck: true, // not needed and really can't test since it changes based on account        
        matchFunc: function (lines, header) {
            if (lines.length < 1) {
                return false;
            }
            return /^38-[0-9]{4}-[0-9]{7}-[0-9]{2,3}$/.test(lines[0][0]) && lines[0].length ==  header.length;
        },
        parseDate: function(v) {
            return moment(v, "D MMM YYY").toDate().getTime();
        },
        reformat: function (v, field, line) {
            if (field == 'Particulars') {
                let val = (v.split(';')[0]).trim();
                if (/-[0-9]{2}:[0-9]{2}$/.test(val)) {
                    return val.substring(0, val.lastIndexOf('-'));
                }
                return val;
            }
            if (field == 'Reference') {
                return line[1].split(';')[1] || '';
            }
            return v;
        },
        parseAmount(v, line) {
            return Math.round(parseFloat(v) * 100) / 100;
        },
         
     });


/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.BUDGET_CSV = budget.widgets.import.FileWidget.makeMatcher(
    ['Date', 'Particulars',	'Amount(negative for income)'],
    'Date', 'Particulars', null, 'Amount(negative for income)', {
        needsHeader: true,
        parseAmount(v, line) {
            return Math.round(-parseFloat(v) * 100) / 100;
        },

    }
);
/**
 * @param {string} name
 * @param {string} content
 * @param {?} data
 * @return {boolean}
 */
budget.widgets.import.FileWidget.ANZ_CSV_VISA = budget.widgets.import.FileWidget.makeMatcher(
    ['Card', 'Type', 'Amount', 'Details', 'TransactionDate', 'ProcessedDate', 'ForeignCurrencyAmount', 'ConversionCharge'],
    'TransactionDate', 'Details', null, 'Amount', {
        needsHeader: false,
        matchFunc: function(lines, header) {
            if (lines.length < 1) {
                return false;
            }
            let line = lines[0];

            return recoil.util.object.isEqual(header, line) || (
                /^[0-9]{4}-(\*){4}-(\*){4}-[0-9]{4}/.test(line[0]) &&
                /^(D|C|Transfer)$/.test(line[1])
            );
        },
        parseAmount(v, line) {
            let mul = line[1] == 'D' ? -1 : 1;
            return Math.round(mul * parseFloat(v) * 100) / 100;
        },
        getRange: budget.widgets.import.FileWidget.ANZ_GET_RANGE('.csv')

    });


/**
 * @const
 */
budget.widgets.import.FileWidget.FILE_TYPES = (function() {
    let ns = budget.widgets.Budget;
    return [
        {name: 'ASB (CSV)', matcher: budget.widgets.import.FileWidget.ASB_CSV },
        {name: 'ANZ (CSV)', matcher: budget.widgets.import.FileWidget.ANZ_CSV},
        {name: 'BNZ (CSV)', matcher: budget.widgets.import.FileWidget.BNZ_CSV},
        {name: 'Kiwibank Brief (CSV)', matcher: budget.widgets.import.FileWidget.KIWIBANK_B_CSV},
        {name: 'Co-operative Bank(CSV)', matcher: budget.widgets.import.FileWidget.COOP_CSV},
        {name: 'RABO (CSV)', matcher: budget.widgets.import.FileWidget.RABO_CSV},
        {name: 'Budget (CSV)', matcher: budget.widgets.import.FileWidget.BUDGET_CSV},
        {name: 'ANZ Visa (CSV)', matcher: budget.widgets.import.FileWidget.ANZ_CSV_VISA},
        {name: 'OFX', matcher: budget.widgets.import.FileWidget.OFX},
        {name: 'QIF', matcher: budget.widgets.import.FileWidget.QIF}
    ];
})();
