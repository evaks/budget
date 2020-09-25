/**
 * provide an iterface to write changes to database
 */

goog.provide('aurora.db.ChangeWriter');


/**
 * @interface
 */
aurora.db.ChangeWriter = function() {};

/**
 * @param {!Array<!recoil.db.ChangeSet.Change>} changes
 * @param {!aurora.db.access.SecurityContext} secContext
 * @param {function(!Array)} callback calles when done any results todo determine type
 */
aurora.db.ChangeWriter.prototype.applyChanges = function(changes, secContext, callback) {
};
