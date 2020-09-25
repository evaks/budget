goog.provide('aurora.db.colDeserializer');

/**
 * @param {?} col
 * @return {!recoil.structs.table.ColumnKey}
 */
aurora.db.colDeserializer = function(col) {
    let parts = col.split();
    if (parts.length < 2) {
        throw new Error('Invalid Path ' + col);
    }
    let last = parts.pop();
    let tbl = aurora.db.schema.keyMap[parts.join('/')];
    if (!tbl) {
        throw new Error('Invalid Path ' + col);
    }
    let res = tbl.meta[last] ? tbl.meta[last].key : null;
    if (!res) {
        throw new Error('Invalid Path ' + col);
    }
    return res;
};

