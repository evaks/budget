goog.provide('budget.widgets.admin.DocumentList');
goog.provide('budget.widgets.admin.Documents');


goog.require('aurora.db.schema.tables.base.user');
goog.require('aurora.download');
goog.require('budget.messages');
goog.require('goog.dom');
goog.require('goog.html.sanitizer.HtmlSanitizer');
goog.require('goog.net.XhrIo');
goog.require('recoil.ui.widgets.ProgressWidget');
goog.require('recoil.ui.widgets.TreeView');


/**
 * @constructor
 * @param {!budget.WidgetScope} scope
 * @param {!recoil.frp.Behaviour<recoil.structs.table.TableRow>} nodeB
 * @param {!recoil.frp.Behaviour<recoil.structs.table.Table>} tableB
 * @param {Element} root
 * @implements {recoil.ui.Widget}
 */
budget.widgets.DocumentTreeNode = function(scope, nodeB, tableB, root) {
    let frp = scope.getFrp();
    const treeT = aurora.db.schema.tables.base.document_tree;
    const typeE = aurora.db.schema.getEnum(treeT.cols.type);
    const html = new recoil.ui.HtmlHelper(scope);
    
    this.scope_ = scope;
    this.description_ = goog.dom.createDom('span', {class: 'entity'});
    this.delete_ = goog.dom.createDom('div', {class: 'goog-inline-block'});
    this.icon_ = goog.dom.createDom('i', {class: 'fas fa-folder doc-dragable', draggable: 'true'});
    this.componentDiv_ = goog.dom.createDom(
        'div', {class: 'treeView_descriptionRow'},
        goog.dom.createDom(
            'span', {class: 'budget-doc-tree-container'}, this.icon_),
        this.description_, this.delete_);

    const isDataNode = (el) => {
          return el && el.getAttribute && el.getAttribute('data-id') != undefined;
    };

    const getDataNode = (root, node) => {
        while (node && node != root) {
            if (isDataNode(node)) {
                return node;
            }
            node = node.parentNode;
        }

        return null;
    };
    const isFirstLevel = (node) => {
        if (!isDataNode(node)) {
            return false;
        }
        let id = node.getAttribute('data-id');

        return frp.accessTrans(() => {
            let res = false;
            let tbl = tableB.get();
            tbl.forEach(row => {
                
                if (row.get(treeT.cols.id).db == id) {
                    res = !row.get(treeT.cols.parent);
                }
            });
            return res;
        }, tableB);
    };

    const getNodes =  (root, nodes) => {
        root.childNodes.forEach(node => {
            if (isDataNode(node)) {
                nodes.push(node);
            }
            getNodes(node, nodes);
        });
        return nodes;
    };

    const inTreeOrder = tbl => {
        let childMap = new Map();
        let res = [];

        tbl.forEachModify(row => {
            let parent = row.get(treeT.cols.parent);
            let lookup = parent == null ? null : parent.db;
            
            let children = childMap.get(lookup) || [];
            childMap.set(lookup, children);
            children.push(row);                
        });

        const createList = root => {

            let children = childMap.get(root) || [];

            for (let i = 0; i < children.length; i++) {
                res.push(children[i]);
                createList(children[i].get(treeT.cols.id).db);
            }
        };
        createList(null);
        
        return res;

        
    };
    const isParent = (parentId, childId) => {
            let pId = null;
        frp.accessTrans(() => {
            let tbl = tableB.get();
            tbl.forEachModify(row => {
                if (row.get(treeT.cols.id).db == childId && row.get(treeT.cols.parent)) {
                    pId = row.get(treeT.cols.parent).db;
                }
            });
        }, tableB);
        return pId == parentId;
    };
    const findNode = (el, x, y) => {


        while (el && el.getAttribute && el != root) {
            if (isDataNode(el)) {
                return {element: el, sameLevel: false};
            }
            el = el.parentNode;
        }

        if (el == root) {
            let nodes = getNodes(root, []);
            let before = null;
            let after = null;
            for (let i = 0; i < nodes.length; i++) {
                let node = nodes[i];
                let bounds = node.getBoundingClientRect();
                if (bounds.y < y && (!before || before.y < bounds.y)) {
                    before = {y: bounds.y, node};
                }
                if (bounds.y > y && (!after || after.y > bounds.y)) {
                    after = {y: bounds.y, node};
                }
            }

            if (before) {
                return {element:before.node, sameLevel: !after || !isParent(before.node.getAttribute('data-id'), after.node.getAttribute('data-id'))};
            }
        }
       
        //maybe outside of root see if its above or below the root node
        let nodes = getNodes(root, []);
        let first = null;
        let last = null;
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];
            let bounds = node.getBoundingClientRect();
            
            if (!isFirstLevel(node)) {
                continue;
            }
            if (bounds.y > y && (first == null || first.y > bounds.y)) {
                first = {y: bounds.y, x: bounds.x, node};
            }
            if (bounds.y < y && (last == null || last.y < bounds.y)) {
                last = {y: bounds.y, x: bounds.x, node};
            }
        }
        if (first) {
            return {element: first.node, sameLevel: true};
        }
        else if (last) {
            return {element: last.node, sameLevel: true};
        }

        return null;        
    };

    const isAncestor = (map, parent, child) => {

        while (child != null) {
            if (child == parent) {
                return true;
            }
            child = map.get(child);
        }
        return false;
    };
            
    const moveNode = (tableB, item, dest, after, sameLevel) => {
        if (item == dest) {
            // nothing to move destination is the same as source
            return;
        }
        frp.accessTrans(() => {
            
            let res = tableB.get().createEmpty();
            let pos = 1; 
            let tbl = tableB.get();
            let dstRow = null;
            let srcRow = null;
            let parentMap = new Map();
            tbl.forEachModify(row => {
                if (row.get(treeT.cols.parent)) {
                    parentMap.set(row.get(treeT.cols.id).db, row.get(treeT.cols.parent).db);
                }
                
                if (row.get(treeT.cols.id).db == item) {
                    srcRow = row;
                }
                if (row.get(treeT.cols.id).db == dest) {
                    dstRow = row;
                }
                
            });

            if (!sameLevel && dstRow.get(treeT.cols.type) === typeE.heading) {
                if (isAncestor(parentMap, item, dstRow.get(treeT.cols.id).db)) {
                    return; // can't make a child of oneself
                }
                srcRow.set(treeT.cols.parent, dstRow.get(treeT.cols.id));
            }
            else {
                if ( dstRow.get(treeT.cols.parent) && isAncestor(parentMap, item, dstRow.get(treeT.cols.parent).db)) {
                    return; // can't make a child of oneself
                }
                srcRow.set(treeT.cols.parent, dstRow.get(treeT.cols.parent));
            }

            inTreeOrder(tbl).forEach(row => {

                let id = row.get(treeT.cols.id).db;

                if (id == item) {
                    return; // skip this we will put it after/before the dest node
                }
                if (id == dest) {
                    if (after) {
                        
                        row.set(treeT.cols.order, pos++);
                        res.addRow(row);
                        row = srcRow;

                    }
                    else {
                        srcRow.set(treeT.cols.order, pos++);
                        res.addRow(srcRow);
                    }
                }
                    
                row.set(treeT.cols.order, pos++);
                res.addRow(row);
            });

            tableB.set(res.freeze());
        }, tableB);
    };
    goog.events.listen(this.componentDiv_, [goog.events.EventType.CLICK, goog.events.EventType.DBLCLICK], e => {
        let bounds = this.description_.getBoundingClientRect();
        if (e.clientX >= bounds.x) {
            
            e.stopPropagation();
        }
    });

    const dragEnd =  (target, e) => {
        let from = target.getAttribute('data-id');
        let to = findNode(document.elementFromPoint(e.clientX, e.clientY), e.clientX, e.clientY);
        if (to && from != null) {
            let bounds = to.element.getBoundingClientRect();
            let after = to.sameLevel || e.clientY > bounds.y + bounds.height / 2;

            moveNode(tableB, BigInt(from), BigInt(to.element.getAttribute('data-id')), after, to.sameLevel);
        }
    };

    // need this otherwize won't let us drag
    goog.events.listen(this.icon_, goog.events.EventType.DRAGSTART, v => console.log('ds'));
    goog.events.listen(this.componentDiv_, goog.events.EventType.DRAGSTART, e => {console.log("comp drag start");});
    goog.events.listen(this.componentDiv_, goog.events.EventType.DRAGEND, e => {
        let target = getDataNode(root, e.target);
        if (target) {
            dragEnd(target, e);
        }
    });

    
    this.disabledDiv_ = goog.dom.createDom('span', {class: 'alarmTree_disabled'}, 'disabled');
    this.timestampDiv_ = goog.dom.createDom('span', {class: 'alarmTree_timestamp'});
    this.unstableDiv_ = goog.dom.createDom('span', {class: 'alarmTree_unstable'}, 'unstable');
    
    this.textWidget_ = new recoil.ui.widgets.InputWidget(scope);
    this.textWidget_.getComponent().render(this.description_);
    let editableB = frp.liftB(tbl => {
        return tbl.getMeta().canUpdate;
    }, tableB);
    this.textWidget_.attachStruct({
        displayLength: 40,
        editable: editableB,
        value: frp.liftBI(row => {
            return row.get(treeT.cols.text);
        }, v => {
            let old = nodeB.get();
            nodeB.set(old.set(treeT.cols.text, v));
        }, nodeB)
    });

    const cd = goog.dom.createDom;
    
    let downloadText = cd('i', {class: 'file-download-btn fas fa-download fm-button'});
    let delText = cd('i', {class: 'file-upload-btn fas fa-trash-alt fm-button'});

    this.deleteWidget_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.deleteWidget_.getComponent().render(this.delete_);
    this.deleteWidget_.attachStruct({
        text:  delText,
        confirm: 2000,
        action: frp.createCallback(() => {
            let res = tableB.get().createEmpty();
            tableB.get().forEach(row => {
                if (nodeB.get().get(treeT.cols.id).db != row.get(treeT.cols.id).db) {
                    res.addRow(row);
                }
            });
            tableB.set(res.freeze());
            console.log("delete", nodeB.get());
        }, tableB, nodeB)
    });

    html.showElements([this.delete_], editableB);
    
    this.nodeB_ = nodeB;
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.componentDiv_);
    this.component_.addClassName('goog-inline-block');
    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);
    this.helper_.attach(this.nodeB_);


};
/**
 * @private
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 */
budget.widgets.DocumentTreeNode.prototype.update_ = function(helper) {
    if (helper.isGood()) {
        var node = this.nodeB_.get();
        const treeT = aurora.db.schema.tables.base.document_tree;
        const typeE = aurora.db.schema.getEnum(treeT.cols.type);

        if (node) {
            let type = node.get(treeT.cols.type);
            let children = node.get(budget.widgets.DocumentTreeNode.CHILDREN_COL);
            goog.dom.classlist.enable(this.icon_, 'fa-folder-plus', type == typeE.heading && children);
            goog.dom.classlist.enable(this.icon_, 'fa-folder', type == typeE.heading && !children);
            goog.dom.classlist.enable(this.icon_, 'fa-file', type == typeE.document);
            goog.dom.classlist.enable(this.icon_, 'fa-link', type == typeE.link);
            goog.dom.setProperties(this.componentDiv_, {'data-id': node.get(treeT.cols.id).db});

        }
    }
};

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.DocumentTreeNode.prototype.getComponent = function() {
    return this.component_;
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.DocumentTreeNode.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @const
 */
budget.widgets.DocumentTreeNode.CHILDREN_COL = new recoil.structs.table.ColumnKey('children');

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.admin.Documents = function(scope) {
    this.scope_ = scope;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let treeT = aurora.db.schema.tables.base.document_tree;

    this.progressDiv_ = cd('div', {class: 'budget-file-upload-progresses'});
    let me = this;


    let treeB =  scope.getDb().get(treeT.key);
    let DEL_COL = new recoil.structs.table.ColumnKey('del');
    let DOWNLOAD_COL = new recoil.structs.table.ColumnKey('download');
    let addHeadingWidget = new recoil.ui.widgets.ButtonWidget(scope);
    let addLinkWidget = new recoil.ui.widgets.ButtonWidget(scope);
    const typeE = aurora.db.schema.getEnum(treeT.cols.type);
    let treeView = new recoil.ui.widgets.TreeView(scope);
    let expandStateB = recoil.ui.widgets.TreeView.createExpanded(frp, 'documents.tree.expand', '1');
    let addHeading = cd('div', {class: 'goog-inline-block'});
    let addLink = cd('div', {class: 'goog-inline-block'});
    let input = cd('input', {type: 'file'});
    let inputLabel = cd('div', {class:'goog-inline-block doc-upload'},
                        cd('label', {class: 'custom-file-upload'},
                           input, cd('i', {class: 'file-upload-btn fas fa-upload fm-button'})));
    let container = cd('div', {class: 'budget-documents'}, addHeading, addLink, inputLabel, this.progressDiv_);

    const makeTree = info => {
        let children = [];
        for (let child of info.children) {
            children.push(makeTree(child));
        }
        if (info.row) {
            let modRow  = info.row.unfreeze();
            modRow.set(budget.widgets.DocumentTreeNode.CHILDREN_COL, children.length > 0);
            return new recoil.structs.Tree(info.id, modRow.freeze(), children);
        }
        else {
            return new recoil.structs.Tree(info.id, null, children);
        }
    };

    var config = goog.object.clone(goog.ui.tree.TreeControl.defaultConfig);
    for (var k in config) {
        var val = config[k];
        if (typeof(val) === 'string' && val.indexOf('goog-tree') === 0) {
            config[k] = 'budget-doc-tree' + val.substring('goog-tree'.length);
        }
    }


    config.nodeFactory_ = (scope, nodeB) => {
        return new budget.widgets.DocumentTreeNode(scope, nodeB, treeB, container);
    };
    config.showRoot = false;
    config.oneClickExpand = true;
    config.clickCallback = (node, e) => {
        return goog.dom.classlist.contains(e.target, "budget-doc-tree-row");
    };
    const safeId = row => {
        let id = row.get(treeT.cols.id);
        return id.db == null ? id.mem : id.db;
    };
    treeView.attach({
        state: frp.liftBI((tree) => {
            let rootInfo = {id: -1, row: null, children: []};

            // first make a map of ids to nodes
           
            let idMap = new Map();
            let seen = new Set();
            
            tree.forEach(function(row) {
                let id = safeId(row);
                idMap.set(id, {id, row, children: []});
            });

            // add the children to the parents
            tree.forEach(function(row) {
                let id = safeId(row);
                let parent = row.get(treeT.cols.parent);

                (idMap.get(parent ? parent.db : null) || rootInfo).children.push(idMap.get(id));
                


            });
            return makeTree(rootInfo);

        }, tree => {
            let res = treeB.get().createEmpty();
            const writeTree = node => {
                let value = node.value();
                if (value != null) {
                    res.addRow(value);
                }
                node.children().forEach(writeTree);
            };
            writeTree(tree);
            treeB.set(res.freeze());
                
        },treeB), config}, expandStateB);

    const addRow = (treeB, type, text) => {
        let res = treeB.get().createEmpty();
        let pos = 1;
        let newRow = new recoil.structs.table.MutableTableRow(pos);

        let id = treeT.cols.id.getDefault();
        
        newRow.set(treeT.cols.id, id);
        newRow.set(treeT.cols.text, text);
        newRow.set(treeT.cols.parent, null);
        newRow.set(treeT.cols.type,  type );
        newRow.set(treeT.cols.order, pos++);
        newRow.set(treeT.cols.doc, null);
        
        res.addRow(newRow);
        
        treeB.get().forEachModify(row => {
            row.set(treeT.cols.order, pos++);
            res.addRow(row);
        });
        
            
        treeB.set(res.freeze());
        return id;
    };
        
        
    addHeadingWidget.attachStruct({
        'action': frp.createCallback(e => {
            addRow(treeB, typeE.heading, 'New Heading');
        }, treeB),
        'text': 'Add Heading'
    });

    addLinkWidget.attachStruct({
        'action': frp.createCallback(e => {
            addRow(treeB, typeE.link, 'New Link <a href="https://google.com">Google</a>');
        }, treeB),
        'text': 'Add Link'
    });

    const uploadFile = (id, file) => {
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
        request.open('POST', '/system/upload' + treeT.doc.info.path.split('/').map(
            encodeURIComponent).join('/') + '/[' + id + ']');
        request.upload.addEventListener('progress', frp.accessTransFunc(function(e) {
	          // upload progress as percentage
	          let percent_completed = (e.loaded / e.total) * 100;
            maxB.set(e.total);
            valueB.set(e.loaded);
        }, maxB, valueB));
        
        // request finished event
        request.addEventListener('load', function(e) {
	          // HTTP status message (200, 404 etc)
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
    };

    
    input.addEventListener('change', function(e) {

        for (let i = 0; i < input.files.length; i++) {
            let id = frp.accessTrans(() => {
                return addRow(treeB, typeE.document, input.files[i].name);
            }, treeB);
            budget.widgets.admin.Documents.waitForId(treeB, id)
                .then(id => uploadFile(id, input.files[i]));
//            uploadFile(input.files[i]);

        }
    });
    addHeadingWidget.getComponent().render(addHeading);
    addLinkWidget.getComponent().render(addLink);
    let delColumn = new recoil.ui.widgets.table.ButtonColumn(DEL_COL, '');
    let downloadColumn = new recoil.ui.widgets.table.ButtonColumn(DOWNLOAD_COL, '');

    let formattedB = frp.liftBI(function(tree) {
        let res = tree.createEmpty([], [DOWNLOAD_COL, DEL_COL]);
        let columns = new recoil.ui.widgets.TableMetaData();
        columns.addColumn(downloadColumn);
        columns.add(treeT.cols.type, 'Type');
        columns.add(treeT.cols.text, budget.messages.NAME, {displayLength: 20});
        columns.add(treeT.cols.order, "Order", {displayLength: 20});
        columns.addColumn(delColumn);
        res.addColumnMeta(treeT.cols.type, {editable: false});
        tree.forEachModify(function(row) {
            let text = cd('i', {class: 'file-download-btn fas fa-download fm-button'});
            let delText = cd('i', {class: 'file-upload-btn fas fa-trash-alt fm-button'});
            let ref = row.get(treeT.cols.doc);
            text.equals = function() {return true;};
            text.equals = function() {return true;};
            row.set(DOWNLOAD_COL, null);
            row.set(DEL_COL, null);
            row.addCellMeta(DOWNLOAD_COL, {text: text, visible: ref != null});
            row.addCellMeta(DEL_COL, {text: delText});
            res.addRow(row);
        });
        return columns.applyMeta(res);
    }, function(tbl) {
        let res = treeB.get().createEmpty();
        tbl.forEachModify(function(row) {
            if (row.get(DOWNLOAD_COL)) {
                let basePath = tbl.getMeta().basePath;
                let path = basePath.setKeys(treeT.info.keys, [row.get(treeT.info.pk)]);
                let doc = row.get(treeT.cols.doc);
                
                path = path.appendName("doc").setKeys(treeT.doc.keys, [doc[treeT.doc.info.pk.getName()]]);
                let staticPath = '/system/download/' + path.items().map(function(item) {
                    return encodeURIComponent(item.name());
                }).join('/');
                
                let keys = encodeURIComponent('[' + path.keys().map(function(v) {return v.db;}).join(',') + ']');

                aurora.download.downloadFile(staticPath + '/' + keys);
            }
            if (!row.get(DEL_COL)) {
                res.addRow(row);

            }

        });
        treeB.set(res.freeze());

    }, treeB);

    treeView.getComponent().render(container);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(container);
};

/**
 * @param {recoil.frp.Behaviour<!recoil.structs.table.Table>} treeB
 * @param {number} id
 * @return {Promise}
 */
budget.widgets.admin.Documents.waitForId = function (treeB, id) {
    return new Promise((resolve, reject) => {
        const treeT = aurora.db.schema.tables.base.document_tree;
        let intervalId = setInterval(treeB.frp().accessTransFunc(() => {
            let found = null;
            treeB.get().forEach(row => {
                let rid = row.get(treeT.cols.id);
                if (rid.db != null && rid.mem == id.mem) {
                    found = rid.db;
                }
            });
            if (found != null) {
                clearInterval(intervalId);
                resolve(found);
            }
        },treeB), 1000);
    });
};
    
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.admin.Documents.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.admin.Documents.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.admin.DocumentList = function(scope) {
    this.scope_ = scope;
    let securityContextB = aurora.permissions.getContext(scope);
    let frp = scope.getFrp();
    let mess = budget.messages;
    let cd = goog.dom.createDom;
    let documentsT = aurora.db.schema.tables.base.document_tree;
    const typeE = aurora.db.schema.getEnum(documentsT.cols.type);

    this.documents_ = cd('div', {});
    let me = this;
    let documentsB =  scope.getDb().get(documentsT.key);

    const buildTree = tbl => {
        let parentMap = new Map([[null, []]]);
        tbl.forEach(row => {
            let parentId = row.get(documentsT.cols.parent);
            let children = parentMap.get(parentId == null ? null : parentId.db);
            if (children == null) {
                children = [];
                parentMap.set(parentId.db, children);
            }
            children.push(row);
        });
        

        return parentMap;
        
    };

    const renderTree = (map, root, parentCont, basePath) => {
        let children = map.get(root);

        if (children) {
            let container = cd('ul', {});
            for (let i = 0; i < children.length; i++) {
                let child = children[i];
                let type = child.get(documentsT.cols.type);
                let text = child.get(documentsT.cols.text);
                
                if (typeE.heading == type) {
                    parentCont.appendChild(cd('h4', {}, text));
                    let subCont = cd('ul', {});
                    parentCont.appendChild(subCont);
                    renderTree(map, child.get(documentsT.cols.id).db, subCont, basePath);
                }
                else if (typeE.document == type) {
                    let path = basePath.setKeys(documentsT.info.keys, [child.get(documentsT.info.pk)]);
                    let doc = child.get(documentsT.cols.doc);
                    
                    path = path.appendName(documentsT.cols.doc.getName());
                    path = path.setKeys(documentsT.cols.doc.keys, [doc[documentsT.doc.cols.id.getName()]]);
                    
                    let staticPath = '/system/download/' + path.items().map(function(item) {
                        return encodeURIComponent(item.name());
                    }).join('/');

                    let keys = encodeURIComponent('[' + path.keys().map(function(v) {return v.db;}).join(',') + ']');
                    parentCont.appendChild(
                        cd('li', {}, cd('a', {href:staticPath + '/' + keys}, text)));
                    
                    
                }
                else if (typeE.link == type) {
                    let link = cd('li', {});
                    // I know this is intentional only admins should be able to set this text
                    link.innerHTML = goog.html.sanitizer.HtmlSanitizer.sanitize(text).getTypedStringValue();
                    parentCont.appendChild(link);
                 
                }
            }
        }
    };
    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.documents_, this, () => {
        goog.dom.removeChildren(this.documents_);
        if (this.helper_.isGood()) {
            const tbl = documentsB.get();
            const tree = buildTree(tbl);
            renderTree(tree, null, this.documents_,tbl.getMeta().basePath);
        }
    });
    this.helper_.attach(documentsB);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.documents_);
};


/**
 * @return {!goog.ui.Component}
 */
budget.widgets.admin.DocumentList.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.admin.DocumentList.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

