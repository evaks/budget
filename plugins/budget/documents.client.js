goog.provide('budget.widgets.Documents');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.download');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.net.XhrIo');
goog.require('goog.net.cookies');
goog.require('recoil.frp.logic');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ProgressWidget');


/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @param {number} userid
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Documents = function(scope, userid) {
    this.scope_ = scope;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let userT = aurora.db.schema.tables.base.user;
    let documentsT = userT.documents;

    this.documents_ = new recoil.ui.widgets.table.TableWidget(scope);
    this.progressDiv_ = cd('div', {class: 'budget-file-upload-progresses'});
    let me = this;

    let query = new recoil.db.Query();
    let userB = scope.getDb().get(userT.key, query.eq(userT.cols.id, userid));
    let documentsB = budget.Client.instance.createSubTableB(userB, frp.createB(/** @type {Array} */(null)), userT.cols.documents);
    let DEL_COL = new recoil.structs.table.ColumnKey('del');
    let DOWNLOAD_COL = new recoil.structs.table.ColumnKey('download');


    let input = cd('input', {type: 'file'});
    let inputLabel = cd('label', {class: 'custom-file-upload'},
                        input, goog.dom.createDom('i', {class: 'file-upload-btn fas fa-upload fm-button'}));
    input.addEventListener('change', function(e) {
        for (let i = 0; i < input.files.length; i++) {
            let file = input.files[i];
            let formData = new FormData();
            let maxB = frp.createB(100);
            let valueB = frp.createB(0);
            let textB = frp.createB(file.name);
            let contDiv = cd('div');
            me.progressDiv_.appendChild(contDiv);
            let progress = new recoil.ui.widgets.ProgressWidget(scope);
            progress.getComponent().render(contDiv);
            let closeDiv = cd('div', {class: 'close-div'});
            goog.events.listen(closeDiv, goog.events.EventType.CLICK, function() {
                goog.dom.removeNode(contDiv);
            });
            goog.style.setElementShown(closeDiv, false);
            contDiv.appendChild(closeDiv);
            progress.attachStruct({value: valueB, max: maxB, text: textB});
            // I would use fetch but it doesn't give progress
            let request = new XMLHttpRequest();
            request.open('POST', '/system/upload' + documentsT.info.path.split('/').map(encodeURIComponent).join('/') + '/' + encodeURIComponent('[' + userid + ']'));
            request.upload.addEventListener('progress', frp.accessTransFunc(function(e) {
	        // upload progress as percentage
	        let percent_completed = (e.loaded / e.total) * 100;
                maxB.set(e.total);
                valueB.set(e.loaded);
            }, maxB, valueB));

            // request finished event
            request.addEventListener('load', function(e) {
	        // HTTP status message (200, 404 etc)
	        console.log(request.status);
                let opacity = 100;
                let TIME_DISAPPER = 5000;
                let ANI_INTERVAL = 20;
                let DELAY = 5000;
                if (request.status == 200) {
                    setTimeout(function() {
                        let interval = setInterval(function() {
                            contDiv.style.opacity = opacity / 100;
                            if (opacity <= 0) {
                                goog.dom.removeNode(contDiv);
                                clearInterval(interval);
                            }
                            opacity -= (100 * ANI_INTERVAL / DELAY);
                        }, ANI_INTERVAL);}, DELAY);
                }
                else {
                    goog.dom.classlist.enable(contDiv, 'error', true);
                    goog.style.setElementShown(closeDiv, true);
	            // request.response holds response from the server
	            console.error('failed to upload file', request.response);
                    frp.accessTrans(function() {
                        textB.set(mess.UPLOAD_FAILED.toString());
                    }, textB);
                }
                input.value = '';
            });

            // send POST request to server
            formData.append('data', file);
            request.send(formData);
        }
    });

    let delColumn = new recoil.ui.widgets.table.ButtonColumn(DEL_COL, '');
    let downloadColumn = new recoil.ui.widgets.table.ButtonColumn(DOWNLOAD_COL, '');
    let container = cd('div', {class: 'budget-documents'}, inputLabel, this.progressDiv_);

    let formattedB = frp.liftBI(function(tbl) {
        let res = tbl.createEmpty([], [DOWNLOAD_COL, DEL_COL]);
        if (res.size() === 0) {
            res.addMeta({headerRowDecorator: null});
        }
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.addColumn(downloadColumn);
        columns.add(documentsT.cols.name, budget.messages.NAME, {displayLength: 20});
        columns.add(documentsT.cols.created, budget.messages.CREATED);
        columns.addColumn(delColumn);

        tbl.forEachModify(function(row) {
            let text = cd('i', {class: 'file-download-btn fas fa-download fm-button'});
            let delText = cd('i', {class: 'file-upload-btn fas fa-trash-alt fm-button'});

            text.equals = function() {return true;};
            text.equals = function() {return true;};
            row.set(DOWNLOAD_COL, null);
            row.set(DEL_COL, null);
            row.addCellMeta(DOWNLOAD_COL, {text: text});
            row.addCellMeta(DEL_COL, {text: delText});
            res.addRow(row);
        });
        return columns.applyMeta(res);
    }, function(tbl) {
        let res = documentsB.get().createEmpty();
        tbl.forEachModify(function(row) {
            if (row.get(DOWNLOAD_COL)) {
                let basePath = tbl.getMeta().basePath;
                let path = basePath.setKeys(documentsT.info.keys, [row.get(documentsT.info.pk)]);
                let staticPath = '/system/download/' + path.items().map(function(item) {
                    return encodeURIComponent(item.name());
                }).join('/');
                let keys = encodeURIComponent('[' + path.keys().map(function(v) {return v.db;}).join(',') + ']');

                console.log('table', staticPath + '/' + keys);
                aurora.download.downloadFile(staticPath + '/' + keys);
            }
            if (!row.get(DEL_COL)) {
                res.addRow(row);

            }

        });
        documentsB.set(res.freeze());

    }, documentsB);

    this.documents_.attachStruct(aurora.ui.ErrorWidget.createTable(scope, formattedB));
    this.documents_.getComponent().render(container);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Documents.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Documents.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

