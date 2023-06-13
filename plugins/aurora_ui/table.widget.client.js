goog.provide('aurora.widgets.TableWidget');


goog.require('goog.dom');
goog.require('recoil.frp.logic');
goog.require('recoil.ui.BoolWithExplanation');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');
goog.require('recoil.ui.widgets.table.TableWidget');

/**
 * @param {!recoil.ui.WidgetScope} scope
 * @param {!recoil.frp.Behaviour} cellB
 * @return {recoil.ui.Widget}
 */
aurora.widgets.TableWidget.delFactory = function(scope, cellB) {

    let ico = goog.dom.createDom('i', {class: 'fas fa-minus-square'});
    var frp = scope.getFrp();
    var widget = new recoil.ui.widgets.ButtonWidget(scope);
    var value = recoil.frp.table.TableCell.getValue(frp, cellB);
    var meta = frp.liftB(function(m) {
        let res = goog.object.clone(m);
        if (m.confirmDelete) {
            res.confirm = m.confirmDelete;
        }
        return res;
    }, recoil.frp.table.TableCell.getMeta(frp, cellB));

    widget.attachStruct(recoil.frp.struct.extend(frp, meta, {action: value, classes: ['aurora-icon-button'], text: ico}));
    return widget;
};

/**
 * @param {!recoil.ui.WidgetScope} scope
 * @param {!reciol.frp.Behaviour} cellB
 * @return {recoil.ui.Widget}
 */
aurora.widgets.TableWidget.copyFactory = function(scope, cellB) {
    let ico = goog.dom.createDom('i', {class: 'fas fa-copy'});
    var frp = scope.getFrp();
    var widget = new recoil.ui.widgets.ButtonWidget(scope);
    var value = recoil.frp.table.TableCell.getValue(frp, cellB);
    let meta = recoil.frp.table.TableCell.getMeta(frp, cellB);
     widget.attachStruct(recoil.frp.struct.extend(frp, meta, {action: value, classes: ['aurora-icon-button'], text: ico}));
    return widget;
};

/**
 * @param {recoil.structs.table.ColumnKey} column
 * @param {?} value
 * @param {function(!recoil.structs.table.ColumnKey, ?):({value:?}|null)=} opt_override
 * @return {?}
 */
aurora.widgets.TableWidget.cloneColumn = function(column, value, opt_override) {
    let meta = null;
    let tbl = null;

    // if override overrides this then use it
    if (opt_override) {
        let res = opt_override(column, value);
        if (res) {
            return res.value;
        }
    }

    if (!column) {
        return recoil.util.object.clone(value);
    }
        
    try {
        meta = aurora.db.schema.getMeta(column);
    }
    catch (e) {
    }

    if (!meta) {
        // column key doesn't exits just clone the value
        return recoil.util.object.clone(value);
    }
    
    try {
        tbl = aurora.db.schema.getTable(column);
    }
    catch (e) {}

    if (meta.primary) {
        return column.getDefault();
    }

    
    if (meta.isList && value instanceof Array && tbl) {
        let res = [];
        for (let i =0; i < value.length; i++) {
            let child = value[i];
            let newChild;
            if (child) {
                newChild = {};
                for (let k in child) {
                    let childCol = tbl.meta[k] ? tbl.meta[k].key : null;
                    newChild[k] = aurora.widgets.TableWidget.cloneColumn(childCol, child[k], opt_override);
                }
            }
            else  {
                newChild = child;
            }
            res.push(newChild);
        }
        return res;
    }

    if (tbl && value) {
        let res = {};
        for (let k in value) {
            let childCol = tbl.meta[k] ? tbl.meta[k].key : null;
            res[k] = aurora.widgets.TableWidget.cloneColumn(childCol, value[k], opt_override);
        }
        return res;
    }
    return recoil.util.object.clone(value);
};

/**
 * add columns and actions to make it possible to reorder columns and and rows
 *
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tableB
 * @param {boolean=} opt_movable
 * @param {(boolean|function(recoil.structs.ColumnKey,?):(null|{value:?}))=} opt_copy
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */

aurora.widgets.TableWidget.createMovableSizable = function(tableB, opt_movable, opt_copy) {
    let movable = opt_movable === undefined || !!opt_movable;
    let frp = tableB.frp();
    let ADD_COL = new recoil.structs.table.ColumnKey('add');
    let DEL_COL = new recoil.structs.table.ColumnKey('del');
    let MOVE_COL = new recoil.structs.table.ColumnKey('move');
    let COPY_COL =  new recoil.structs.table.ColumnKey('copy');
    let makeNewRow = function(tbl, pos) {
        let newRow = new recoil.structs.table.MutableTableRow();
        tbl.forEachColumn(function(col) {
            newRow.set(col, col.getDefault());
        });
        if (pos === undefined) {
            newRow.setPos(pos);
        }
        newRow.addRowMeta({doAdd: true});
        return newRow;
    };
    let copyRow = function (tbl, pos, src) {
        let newRow = new recoil.structs.table.MutableTableRow();
        tbl.forEachColumn(function (col) {
            let val = src.get(col);
           newRow.set(col, aurora.widgets.TableWidget.cloneColumn(col, val, opt_copy instanceof Function ? opt_copy : null));
	     });
       newRow.addRowMeta({doCopy: true});
       return newRow;
    };


    let addFactory = function(scope, cellB) {

        let ico = goog.dom.createDom('i', {class: 'fas fa-plus-square'});
        var frp = scope.getFrp();
        var widget = new recoil.ui.widgets.ButtonWidget(scope);
        var value = recoil.frp.table.TableCell.getValue(frp, cellB);
        var meta = recoil.frp.table.TableCell.getMeta(frp, cellB);
        widget.attachStruct(recoil.frp.struct.extend(frp, meta, {action: value, classes: ['aurora-icon-button'], text: ico}));
        return widget;
    };
    let copyFactory = aurora.widgets.TableWidget.copyFactory;
    let delFactory = aurora.widgets.TableWidget.delFactory;
    let moveFactory = function(scope, cellB) {

        let ico = goog.dom.createDom('i', {draggable: false, class: 'aurora-move-icon'});
        goog.events.listen(ico, [goog.events.EventType.DRAGSTART], function(e) {
            console.log('dragging', e);
        });
        var frp = scope.getFrp();
        var widget = new recoil.ui.widgets.LabelWidget(scope);
        var value = recoil.frp.table.TableCell.getValue(frp, cellB);
        var meta = recoil.frp.table.TableCell.getMeta(frp, cellB);
        widget.attachStruct(recoil.frp.struct.extend(frp, meta, {name: ico, classes: ['aurora-icon-button'], text: ico}));
        return widget;
    };

    let decoratorsB = frp.createB(new goog.structs.AvlTree(recoil.util.object.compareKey));

    let dragItem = null;
    let dropRow = null;
    let dragRow = null;
    let dragId = null;
    let highlightDragRow = function(after, newRow) {
        if (dropRow) {
            goog.dom.classlist.enable(dropRow, 'aurora-drop-after', false);
            goog.dom.classlist.enable(dropRow, 'aurora-drop-before', false);
        }
        if (dragRow === newRow) {
            newRow = null;
        }
        if (after && newRow && newRow.nextElementSibling === dragRow) {
            newRow = null;
        }
        else if (!after && newRow && newRow.previousElementSibling === dragRow) {
            newRow = null;
        }
        if (newRow) {
            goog.dom.classlist.enable(newRow, 'aurora-drop-after', after);
            goog.dom.classlist.enable(newRow, 'aurora-drop-before', !after);
        }
        dropRow = newRow;
    };
    let emptyHeaderRowDecoratorReadOnly = function() {
        let td = goog.dom.createDom('td', {class: 'aurora-empty-table'}, 'No Entries');
        let div = goog.dom.createDom('tr', {}, td);
        return new recoil.ui.RenderedDecorator(
            emptyHeaderRowDecoratorReadOnly,
            div, null);
    };

    let emptyHeaderRowDecorator = function() {
        let td = goog.dom.createDom('td', {class: 'aurora-add-empty-table'}, 'No Entries, Click to Add');
        let div = goog.dom.createDom('tr', {}, td);
        goog.events.listen(div, [goog.events.EventType.CLICK], function(e) {
            frp.accessTrans(function() {
                let orig = tableB.get().unfreeze();
                orig.addRow(makeNewRow(orig, 0));
                tableB.set(orig.freeze());
            }, tableB);
        });

        return new recoil.ui.RenderedDecorator(
            emptyHeaderRowDecorator,
            div, null);
    };

    let rowDecoratorFunc = function(pks) {
        let rowDecorator = function() {
            let div = goog.dom.createDom('tr', {});
            div.dragId = rowDecoratorFunc;

            goog.events.listen(div, [goog.events.EventType.DRAGSTART], function(e) {
                dragRow = div;
                dragItem = pks;
                dragId = rowDecoratorFunc;
            });

            goog.events.listen(div, [goog.events.EventType.MOUSEOVER], function(e) {
                if (dragId !== div.dragId) {
                    return;
                }
                let after = div.getBoundingClientRect().height / 2 < e.offsetY;
                if (dragItem) {
                    highlightDragRow(after, div);
                }
            });
            goog.events.listen(div, [goog.events.EventType.MOUSEDOWN], function(e) {
                // fix firefox bug that breaks cursor in input boxes when focusable
                if (e.target && e.target.tagName !== 'INPUT') {
                    div.setAttribute('draggable', 'true');
                }
            });
            goog.events.listen(div, [goog.events.EventType.MOUSEUP], function(e) {
                // fix firefox bug that breaks cursor in input boxes when focusable
                div.setAttribute('draggable', 'false');
            });
            goog.events.listen(div, [goog.events.EventType.MOUSEOUT], function(e) {
                highlightDragRow(false, null);
            });
            goog.events.listen(div, [goog.events.EventType.DRAGOVER], function(e) {
                if (dragId !== div.dragId) {
                    return;
                }
                e.preventDefault();
                let after = div.getBoundingClientRect().height / 2 < e.offsetY;
                highlightDragRow(after, div);
            });

            goog.events.listen(div, [goog.events.EventType.DROP], function(e) {
                if (dragId !== div.dragId || !dragItem) {
                    return;
                }
                e.preventDefault();
                let after = div.getBoundingClientRect().height / 2 < e.offsetY;

                frp.accessTrans(function() {
                    let orig = tableB.get();
                    let res = orig.createEmpty();
                    let pos = 0;
                    let toMove = null;

                    orig.forEach(function(row, rowPks) {
                        if (recoil.util.object.isEqual(rowPks, dragItem)) {
                            toMove = row.unfreeze();
                        }
                    });

                    if (!toMove) {
                        return;
                    }
                    let moved = false;
                    orig.forEach(function(row, rowPks) {
                        let mrow = row.unfreeze();
                        if (recoil.util.object.isEqual(rowPks, dragItem)) {
                            return;
                        }
                        if (recoil.util.object.isEqual(rowPks, pks)) {
                            moved = true;
                            if (after) {
                                mrow.setPos(pos++);
                                res.addRow(mrow);
                                toMove.setPos(pos++);
                                res.addRow(toMove);
                            }
                            else {
                                toMove.setPos(pos++);
                                res.addRow(toMove);
                                mrow.setPos(pos++);
                                res.addRow(mrow);
                            }
                        }
                        else {
                            mrow.setPos(pos++);
                            res.addRow(mrow);
                        }
                    });
                    if (moved) {
                        tableB.set(res.freeze());
                    }
                }, tableB);
                dragItem = null;
                dragId = null;
                highlightDragRow(false, null);

            });

            goog.events.listen(div, [goog.events.EventType.DRAGEND], function(e) {
                if (dragId !== div.dragId) {
                    return;
                }
                e.preventDefault();
                //var data = e.dataTransfer.getData("text");
                let after = div.getBoundingClientRect().height / 2 < e.offsetY;
                console.log('droping', e, pks, 'after', after);
                dragItem = null;
                dragId = null;
                highlightDragRow(false, null);

            });

            return new recoil.ui.RenderedDecorator(
                rowDecorator,
                div);
        };
        return rowDecorator;
    };

    let addHeader = goog.dom.createDom('i', {class: 'fas fa-plus-square aurora-icon-button'});
    goog.events.listen(addHeader, goog.events.EventType.CLICK, frp.accessTransFunc(function() {
        let res = tableB.get().unfreeze();
        res.addRow(makeNewRow(res, undefined));
        tableB.set(res.freeze());
    }, tableB));

    return frp.liftBI(function(tbl, decorators) {
        let tblMeta = tbl.getMeta();
        let canAdd = tblMeta.canAdd !== false;
        let canCopy = opt_copy && tblMeta.canAdd !== false;
        let canDel = tblMeta.canRemove !== false;
        let canMove = tblMeta.editable !== false && tblMeta.canUpdate !== false;

        let hasHeaderRow = tblMeta.headerRowDecorator !== null;
        if (tbl.size() === 0 && !hasHeaderRow) {
            // no way to add if blank make it special
            let res = tbl.createEmpty([], [ADD_COL]);
            res.addMeta({headerRowDecorator: canAdd ? emptyHeaderRowDecorator : emptyHeaderRowDecoratorReadOnly});
            return res.freeze();
        }
        let newCols = [];

        if (hasHeaderRow) {
            if (canAdd || canDel) {
                newCols = [DEL_COL];
            }
        }
        else if (canDel) {
            // if no header row del column only does delete
            newCols = [DEL_COL];
        }
        if (!hasHeaderRow && canAdd) {
            newCols.push(ADD_COL);
        }
        if (canCopy) {
            newCols.push(COPY_COL);
        }
        if (movable && canMove) {
            newCols.push(MOVE_COL);
        }
        let res = tbl.createEmpty([], newCols);
        let lastPos = 0;


        tbl.forEachPlacedColumn(function(col, meta) {
            lastPos = Math.max(lastPos, meta.position || 0);
        });

        if (opt_copy) {
	          res.addColumnMeta(COPY_COL, {position:++lastPos, cellWidgetFactory: copyFactory});
	      }
	      res.addColumnMeta(ADD_COL, {position: lastPos + 1, cellWidgetFactory: addFactory});
        res.addColumnMeta(DEL_COL, {position: lastPos + 2, cellWidgetFactory: delFactory, name: canAdd ? addHeader : ''});
        res.addColumnMeta(MOVE_COL, {position: lastPos + 3, cellWidgetFactory: moveFactory});
        let newDecorators = new goog.structs.AvlTree(recoil.util.object.compareKey);
        tbl.forEach(function(row, pks) {
            let mrow = row.unfreeze();
            mrow.set(ADD_COL, null);
            mrow.set(DEL_COL, null);
            mrow.set(MOVE_COL, null);
	          mrow.set(COPY_COL, null);
	          
            if (canMove && movable && row.getRowMeta().movable !== false) {
                let decorator = decorators.findFirst({key: pks, decorator: null});
                if (!decorator) {
                    decorator = {key: pks, decorator: rowDecoratorFunc(pks)};
                }
                newDecorators.add(decorator);
                mrow.addRowMeta({rowDecorator: decorator.decorator});

            }
            if (row.getRowMeta().movable === false) {
                mrow.addCellMeta(MOVE_COL, {cellDecorator: null});
            }
            res.addRow(mrow);
        });
        decoratorsB.set(newDecorators);
        return res.freeze();
    }, function(tbl) {
        let res = tableB.get().createEmpty();
        let pos = 0;
        tbl.forEach(function(row) {
            let mrow = row.unfreeze();
            if (!row.get(DEL_COL)) {
                mrow.setPos(pos++);
                res.addRow(mrow);
                if (row.get(ADD_COL)) {
                    res.addRow(makeNewRow(tbl, pos++));
                }
		else if(row.get(COPY_COL)) {
	            res.addRow(copyRow(tbl, pos++, row));
		}
            }

        });
        tableB.set(res.freeze());
    }, tableB, decoratorsB);
};


/**
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tableB
 * @param {(boolean|function(recoil.structs.ColumnKey,?):(null|{value:?}))=} opt_copy
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */

aurora.widgets.TableWidget.createSizable = function(tableB, opt_copy) {
    return aurora.widgets.TableWidget.createMovableSizable(tableB, false, opt_copy);
};

/**
 * @param {!recoil.frp.Behaviour<!recoil.structs.table.Table>} tableB
 * @return {!recoil.frp.Behaviour<!recoil.structs.table.Table>}
 */

aurora.widgets.TableWidget.createRotated = function(tableB) {

    var rotate = new recoil.structs.table.Rotate(false);
    var frp = tableB.frp();
    return recoil.frp.Inversable.create(
            frp, rotate, {table: tableB});
};
