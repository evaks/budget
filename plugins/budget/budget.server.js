goog.provide('budget.Server');

goog.require('aurora.Chat');
goog.require('aurora.auth.Auth');
goog.require('aurora.auth.DbSessionTable');
goog.require('aurora.db.Coms');
goog.require('aurora.db.Upgrade');
goog.require('aurora.db.mysql.Pool');
goog.require('aurora.db.schema.init.base.updateDb');
goog.require('aurora.db.sql.Reader');
goog.require('aurora.log');
goog.require('aurora.startup');
goog.require('budget.Chat');
goog.require('config');

/**
 * @export
 * @constructor
 */
budget.Server = function() {
    let log = aurora.log.createModule('MAIN');
    let initDb = false;
    let initTest = false;
    let upgradeOnly = false;
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === '--init-db') {
            initDb = true;
        }

        if (process.argv[i] === '--upgrade') {
            initDb = true;
            upgradeOnly = true;
        }
        if (process.argv[i] === '--test') {
            initDb = true;
            initTest = true;
        }
    }
    let dbAuth = null;
    let databases = ((config['database'] || {})['databases']) || [];
    let auth = aurora.auth.instance;
    if (initDb) {
        aurora.startup.taskStarted('budget.Server.initDb');
    }
    databases.forEach(function(database) {
        let driver = /** @type {?} */(eval(database['driver']));
        let settings = budget.Server.getSettings(initTest, database['settings']);
        let pool = new driver(settings);

        if (database['auth']) {
            let reader = new aurora.db.sql.Reader(pool);
            dbAuth = new aurora.db.Authenticator(reader, true);
            auth.addAuthenticator(dbAuth);
        }
        aurora.db.Pool.addPool(database['name'] || null, pool);
        if (initDb) {
            let doInit = function() {
                log.info('Initializing database');
                if (database['create-settings']) {

                    let createPool = new driver(budget.Server.getSettings(initTest, database['create-settings'], true));
                    aurora.db.schema.init.base.updateDb(createPool, function(err) {
                        createPool.createAppUser(settings, function(err) {
                            if (err) {
                                log.error('ERROR creating database', err);
                            }
                            aurora.startup.taskEnded('budget.Server.initDb');
                            if (upgradeOnly) {
                                process.exit(err ? 1 : 0);
                            }
                        });

                    });
                }
                else {
                    log.error('You must specify create-settings to create a database');
                    if (upgradeOnly) {
                        process.exit(1);
                    }
                }

            };
            if (initTest) {
                // if we are a test always drop the database
                let createPool = new driver(budget.Server.getSettings(initTest, database['create-settings'], true));
                createPool.dropDb(function(e) {
                    doInit();
                });
            }
            else {
                doInit();
            }
        }

    });

    this.reader_ = new aurora.db.sql.Reader(aurora.db.Pool.getDefault());

    //    inst.addDisallowedExp(/^\/user\//);
    auth.setLoginPath('/login'); // going here if the user is not in the session table will force them to login

    if (initTest) {
        // if we are doing a test allow a remote unauthorised shutdown of the server
        aurora.http.addMidRequestCallback(
            /^\/shutdown/,
            function(state, done) {
                log.info('Test server recieved shutdown request');
                state.response.writeHead(200);
                state.response.end();
                setTimeout(function() {
                    process.exit(0);
                }, 1000);
            });
    }

    if (dbAuth) {
        new aurora.db.Coms(/** @type {!aurora.db.Authenticator} */ (dbAuth));
        this.chat_ = new aurora.Chat(/** @type {!aurora.db.Authenticator} */ (dbAuth), new budget.Chat(this.reader_));
    }
    else {
        log.error('No authenticator cannot start up coms layer');
    }

};

/**
 * @return {!aurora.db.Pool}
 */
budget.Server.prototype.getPool = function() {
    return aurora.db.Pool.getDefault();
};

/**
 * @return {!aurora.db.Reader}
 */
budget.Server.prototype.getReader = function() {
    return this.reader_;
};

/**
 * modifies the settings so that it creates/connects to a test database
 * @param {boolean} isTest
 * @param {!Object} settings
 * @param {boolean=} opt_create
 * @return {!Object}
 */
budget.Server.getSettings = function(isTest, settings, opt_create) {
    if (isTest) {
        var copy = goog.object.clone(settings);
        copy['database'] = copy['database'] + '_test';
        if (!opt_create) {
            copy['user'] = copy['user'] + '_test';
        }
        return copy;
    }
    return settings;
};
/**
 * @final
 */
budget.Server.instance = new budget.Server();
