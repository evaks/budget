goog.provide('budget.Importer');


budget.Importer = function (categories) {
};


/**
 * @typedef {{date:number,name:string, amount:number}}
 */
budget.Importer.ImportRow;

/**
 * @param {!Array<!budget.Importer.ImportRow>} rows
 */
budget.Importer.prototype.import = function () {
};

