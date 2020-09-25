goog.provide('aurora.db.schema.init');


/**
 * @param {Array<{table: string, action: function(function(?))}>} dependants
 * @param {Object<string,Object<boolean>>} depMap
 * @param {function(?)} done
 */
aurora.db.schema.init.processDependants = function(dependants, depMap, done) {

    if (dependants.length === 0) {
        done(null);
        return;
    }
    // remove everything from dependants and put it in curDependants
    let curDependants = dependants.splice(0);
    let comparator = function(x, y) {
        if (x.table === y.table) {
            return 0;
        }
        if (depMap[x.table] && depMap[x.table][y.table]) {
            return 1;
        }
        if (depMap[y.table] && depMap[y.table][x.table]) {
            return -1;
        }
        return x.table.localeCompare(y.table);
    };

    curDependants.sort(comparator);

    const async = require('async');

    async.eachSeries(curDependants, function(item, cb) {
        item.action(cb);
    }, function(err) {
        if (err) {
            done(err);
        }
        else {
            aurora.db.schema.init.processDependants(dependants, depMap, done);
        }
    });

};
