goog.provide('budget.ImportRow');
goog.provide('budget.Importer');

/**
 * @typedef {{date:number,description:string,memo:string,amount:number}}
 */
budget.ImportRow;


/**
 * @typedef {{start:?,stop:?number, rows: !Array<!budget.ImportRow>}}
 */
budget.ImportData;

/**
 * @interface
 */
budget.Importer = function() {
};

/**
 * imports a file
 */
budget.Importer.prototype.import = function() {
};


