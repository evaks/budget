// anyone can register
// anyone can reset password

// cust can add/remove/update/view self
// cust can add/remove/update document to self
// cust can not add/remove/update note 
// cust can add/remove/update appointment to user
// cust cannot view other mentors (appart from names and if booked)


const WebSocketClient = require('websocket').client;
const aurora = require('./../output/module-test.min').aurora;
const recoil = require('./../output/module-test.min').recoil;
const goog = require('./../output/module-test.min').goog;

const https = require('https');
const serverAddr = 'localhost:8443';
const Path = recoil.db.ChangeSet.Path;

function doesNotExistError(path, nameOrNoAccess, noAccess) {
    let actualPath = path;
    if (nameOrNoAccess === true || noAccess === true) {
        return 'Access Denied';
    }
    if (typeof (nameOrNoAccess) == 'string') {
        actualPath = path.appendName(nameOrNoAccess);
    }
   
    return 'Invalid Path ' + actualPath.toString() + ' - does not exist';
};

function invalidParentError(path, nameOrNoAccess, noAccess) {
    let actualPath = path;
    if (nameOrNoAccess === true || noAccess === true) {
        return 'Access Denied';
    }
    if (typeof (nameOrNoAccess) == 'string') {
        actualPath = path.appendName(nameOrNoAccess);
    }
    
   return 'Invalid Path ' + actualPath.toString() + ' - invalid parent';
};
let TestClient = function (connection, user, cookies) {
    this.connection_ = connection;
    this.responseCallbacks_ = {};
    this.registered_ = {};
    this.transId_ = 0;
    this.id_ = 0;
    this.user_ = user;
    this.cookies_ = cookies;
    this.valSerializer_ = new aurora.db.ValueSerializor();
};

TestClient.prototype.closeInternal = function () {
    this.error('Connection Closed');
};

TestClient.prototype.close = function () {
    this.connection_.close();
};

TestClient.prototype.toString = function () {
    return this.user_;
}

TestClient.prototype.error = function (err) {
    for (let k in this.responseCallbacks_) {
        let list = this.responseCallbacks_[k].forEach(function (info) {
            try {
                info.error(err);
            }
            catch (e) {
            }
        });
    }
    this.responseCallbacks_ = {};
};
TestClient.prototype.recieve = async function (data) {
    console.log("recieve");
};

TestClient.converters = {
    'string' : {
        types: [aurora.websocket.enums.types.STRING],
        type: v => aurora.websocket.enums.types.STRING,
        serialize: v =>  Buffer.from(v, 'utf8'),
        deserialize: v => v
    },
    'object': {
        types: [aurora.websocket.enums.types.BINARY, aurora.websocket.enums.types.OBJECT],
        type: v => (v instanceof ArrayBuffer || v instanceof Buffer) ? aurora.websocket.enums.types.BINARY : aurora.websocket.enums.types.OBJECT,
        serialize: v => (v instanceof ArrayBuffer || v instanceof Buffer) ? v : Buffer.from(JSON.stringify(v), 'utf8'),
        deserialize: v => v
    }
    
};

TestClient.prototype.uploadFile = function (path, fname, data) {
    let pName = path.items().map(x => encodeURIComponent(x.name()));
    let pKeys = [];

    let me = this;
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', data, fname);
    let headers = {...form.getHeaders()};
    headers['Cookie'] = this.cookies_;
    
    return new Promise(function(resolve, error) {
        path.items().forEach(item => {
            pKeys = pKeys.concat(item.keys());
        });
        const url = 'https://' + serverAddr + '/system/upload/' + pName.join('/') + '/[' + pKeys.map(x => encodeURIComponent(x.db + '')).join(',')  + ']';
        const req = https.request(url, {
            method: 'POST',
            rejectUnauthorized: false,
            headers: headers,
        }, function (res) {
            if (res.statusCode !== 200) {
                error(res.statusCode);
            }
            else {
                resolve(res.statusCode);
            }
        });
        form.pipe(req);
    });
};



TestClient.prototype.downloadFile = function (path, fname) {
    let pName = path.items().map(x => encodeURIComponent(x.name()));
    let pKeys = [];

    let me = this;
    let headers = {};
    headers['Cookie'] = this.cookies_;
    
    return new Promise(function(resolve, error) {
        let resolved = false;
        let buffer = Buffer.alloc(0);
        path.items().forEach(item => {
            pKeys = pKeys.concat(item.keys());
        });
        const url = 'https://' + serverAddr + '/system/download/' + pName.join('/') + '/[' + pKeys.map(x => encodeURIComponent(x.db + '')).join(',')  + ']';
        const req = https.request(url, {
            method: 'GET',
            rejectUnauthorized: false,
            headers: headers,
        }, function (res) {
            if (res.statusCode !== 200) {
                resolved = true;
                error(res.statusCode);
                return;
            }

            res.on('data', function (d) {
                buffer = Buffer.concat([buffer, d]);
            });
            
            res.on('error', function (e) {
                resolved = true;
                error(e);
            });
            res.on('end', function () {
                if (!resolved) {
                    resolve(buffer.toString('utf8'));
                }
            });
        });

        req.end();
    });
};

TestClient.prototype.send = async function (pluginName, channel,  data) {
    let header = new ArrayBuffer(6);
    let pluginId = aurora.websocket.constants.plugins.indexOf(pluginName);
    let dv = new DataView(header);
    if (!this.registered_[pluginId + '_' + channel]) {
        this.registered_[pluginId + '_' + channel] = true;
        this.connection_.send(JSON.stringify({'command': aurora.websocket.enums.COMMANDS.REGISTER, 'pluginId': pluginId, 'channelId': channel}));
    }
    let converter = TestClient.converters[typeof(data)];
    if (!converter) {
        throw "Invalid Send Type " + typeof(data);
    }

    dv.setUint16(0, pluginId, true);
    dv.setUint16(2, channel, true);
    dv.setUint16(4, converter.type(data), true);
    let toSend = Buffer.concat([new Uint8Array(header), converter.serialize(data)]);
    let me =this;
    return await  new Promise(function (resolve, error) {
        me.connection_.sendBytes(toSend, function (r) {
            if (r) {
                error(r);
            }
            resolve();
        });       
    });
    

    
};

async function checkHasntPerms(client, tbl, obj, changeob, perms, inId) {
    let id = inId === undefined ?  null : inId;
    
    if (perms.indexOf('c') !== -1) {
        await expect(client.add(tbl, obj)).rejects.toBe('Access Denied');
    }
    if (perms.indexOf('r') !== -1) {
        let data = await client.getData(tbl);
        let row = findById(id, data);
        expect(row).toBeNull();
    }

    if (perms.indexOf('u') !== -1) {
        await expect(client.set(makePath([tbl.info.path, id]), changeob)).rejects.toBe('Access Denied');
    }
    if (perms.indexOf('d') !== -1) {
        await expect(client.remove(makePath([tbl.info.path, id]))).rejects.toBe('Access Denied');
    }

    return id;
}
    

async function checkHasPerms(client, tbl, obj, changeob, perms, inId) {
    let id = inId || null;
    
    if (perms.indexOf('c') !== -1) {
        id = await client.add(tbl, obj);
    }
    let data = null;
    if (perms.indexOf('r') !== -1) {
        data = await client.getData(tbl);
    }

    let row = null;
    if (perms.indexOf('r') !== -1) {
        row = findById(id, data);
        expect(BigInt(row.id)).toEqual(id);
    }


    function checkEqual (tbl, expected, actual) {
        for (let k in expected) {
            let meta = tbl.meta[k];
            let eVal = expected[k];
            let aVal = actual[k];
            if (!meta) {
                expect(eVal).toBe(aVal);
            }
            else if (meta.type === 'id' || meta.type === 'ref') {
                expect(BigInt(eVal)).toBe(BigInt(aVal));
            }
            else if (meta.isList) {
                expect(eVal.length).toBe(aVal.length);
                for (let i = 0; i < eVal.length; i++) {
                    checkEqual(tbl[k], eVal[i], aVal[i]);
                }
            }
            else {
                expect(eVal).toEqual(aVal);
            }
                
        }
    }
    checkEqual(tbl, obj, row);


    if (perms.indexOf('u') !== -1) {
        await client.set(makePath([tbl.info.path, id]), changeob);
        row = findById(id, await client.getData(tbl));
        let resetObj = {};

        checkEqual(tbl, changeob, row);
        
        for (let k in changeob) {
            resetObj[k] = obj[k];
        }
        await client.set(makePath([tbl.info.path, id]), changeob);
    }
    if (perms.indexOf('d') !== -1) {
        await client.remove(makePath([tbl.info.path, id]));
    }

    return id;
}
    
function makeId(pluginId, channel) {
    return pluginId + '_' + channel;
}
TestClient.prototype.sendAndWait = async function (pluginName, channel,  data, opt_filter) {
    await this.send(pluginName, channel, data);
    let pluginId = aurora.websocket.constants.plugins.indexOf(pluginName);
    let me =this;
    return await new Promise(function (resolve, error) {
        (me.responseCallbacks_[makeId(pluginId, channel)] = me.responseCallbacks_[makeId(pluginId, channel)] || []).push({resolve, error, filter: opt_filter || (x => true)});
    });
};

TestClient.prototype.getData = async function (table, query, options) {
    query = query || recoil.db.Query.True;

    let squery = query.serialize(new aurora.db.Serializer());
    options = options || new recoil.db.QueryOptions();
    let res = await this.sendAndWait(
        aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA,
        {
            command: 'get',
            name: table.info.path,
            query: squery,
            options: options.serialize()
        }, 
        function (data) {
            return data.command === 'full' && data.name === table.info.path
                && recoil.util.object.isEqual(data.query, squery)
                && recoil.util.object.isEqual(data.options, options.serialize());
        }
    );

    if (res['error-value']) {
        throw res['error-value'];
    }
    return res.value;
    
};

TestClient.prototype.remove = async function (path) {
    let me = this;

    let id = this.transId_++;
    let res = await this.sendAndWait(
        aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA,
        {
            command: 'set',
            id: id,
            list: recoil.db.ChangeSet.Change.serializeList([new recoil.db.ChangeSet.Delete(path)], false, {} /*schema*/, me.valSerializer_)
            
        }, x => x.command === 'set' && x.id === id);

    let resId = null;
    res.results.forEach(info =>  {
        if (info.error) {
            throw info.error;
        }
        resId = info.id;
    });

};


TestClient.prototype.set = async function (path, items) {
    let me = this;
    let id = this.transId_++;
    let data = [];
    let table = aurora.db.schema.getTableByName(path);

    if (!table) {
        throw "Table undefined " + path.toString();
    }
    for (let k in items) {
        let val = items[k];
        if (val != undefined && table.meta[k] && table.meta[k].type === 'ref') {
            val = new aurora.db.PrimaryKey(BigInt(val));
        }
            
        data.push(new recoil.db.ChangeSet.Set(path.appendName(k), null, val));
    }

    let res = await this.sendAndWait(
        aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA,
        {
            command: 'set',
            id: id,
            list: recoil.db.ChangeSet.Change.serializeList(data, false, {} /*schema*/, me.valSerializer_)
            
        }, x => x.command === 'set' && x.id === id);

    let resId = null;
    res.results.forEach(info =>  {
        if (info.error) {
            throw info.error;
        }
        resId = info.id;
    });

};

TestClient.prototype.nextPk = function () {
    return new aurora.db.PrimaryKey(null, BigInt(this.id_));
};
TestClient.prototype.add = async function (tableOrPath, data) {
    // todo allow adding by path
    let path = tableOrPath.info ? recoil.db.ChangeSet.Path.fromString(tableOrPath.info.path) : tableOrPath;
    let me = this;
    let makeAdd = function (path, data) {
        let dependants = [];
        let table = aurora.db.schema.getTableByName(path);
        let pkName = table.info.pk.getName();
        if (data[pkName] == undefined) {
            path = path.setKeys([pkName], [new aurora.db.PrimaryKey(null, BigInt(me.id_++))]);
        }
        else {
            path = path.setKeys([pkName], [new aurora.db.PrimaryKey(null, BigInt(data[pkName]))]);
        }
        for (let field in table.meta) {
            let info = table.meta[field];
            let fieldData = data[field];
            if (info.isList) {
                if(fieldData) {
                    fieldData.forEach(function (item) {
                        dependants.push(makeAdd(path.appendName(field), item));
                    });
                }
            }
            else if (info.isObject) {
                if (fieldData) {
                    dependants.push(makeAdd(path.appendName(field), fieldData));
                }
            }
            else if (fieldData !== undefined)
            {
                if (info.type === 'ref') {
                    fieldData = new aurora.db.PrimaryKey(BigInt(fieldData));
                }
                dependants.push(new recoil.db.ChangeSet.Set(path.appendName(field), null, fieldData));
            }
        };
        return new recoil.db.ChangeSet.Add(path, dependants);
            
    };

    let id = this.transId_++;
    let res = await this.sendAndWait(
        aurora.db.shared.PLUGIN_ID, aurora.db.shared.DATA,
        {
            command: 'set',
            id: id,
            list: recoil.db.ChangeSet.Change.serializeList([makeAdd(path, data)], false, {} /*schema*/, me.valSerializer_)
            
        }, x => x.command === 'set' && x.id === id);

    let resId = null;
    res.results.forEach(info =>  {
        if (info.error) {
            throw info.error;
        }
        resId = info.id;
    });
    return BigInt(resId);
};
TestClient.prototype.message = function (pluginId, channelId, data) {
    let id = makeId(pluginId, channelId);
    let callbacks = this.responseCallbacks_[id];
    if (callbacks) {
        let newCallbacks = callbacks.filter(info => !info.keep && !info.filter(data));
        let todo = callbacks.filter(info => info.filter(data));
        if (newCallbacks.length === 0) {
            delete  this.responseCallbacks_[id];
        }
        else {
            this.responseCallbacks_[id] = newCallbacks;
        }
        todo.forEach(info => info.resolve(data));
    }
};
function connectClient(login) {
    function toClientCookies(cookies) {
        return cookies.map(x => x.replace(/;.*/g,'')).filter(x => x.indexOf('sesh=') === 0)[0];
    }
    function connectWebsocket(cookie, resolve, errorFunc) {
        let client = new WebSocketClient({
            tlsOptions: {rejectUnauthorized: false},
        });
        
        client.on('connectFailed', function(error) {
            errorFunc(error);
        });
        
        client.on('connect', function(connection) {
            let testClient = new TestClient(connection, login ? login.username : 'anon', cookie);
            resolve(testClient);
            connection.on('error', function(error) {
                console.log("Connection Error: " + error.toString());
            });
            connection.on('close', function() {
                testClient.closeInternal();
            });
            connection.on('message', function(message) {
                if (message.type === 'binary') {
                    let header = new Uint16Array();
                    let body = message.binaryData.slice(6);
                    let pluginId = message.binaryData.readInt16LE(0);
                    let channelId = message.binaryData.readInt16LE(2);
                    let type = message.binaryData.readInt16LE(4);
                    let decodedData = null;

                    if (type === aurora.websocket.enums.types.STRING) {
                        decodedData = new TextDecoder('utf-8').decode(new Uint8Array(body));
                    }
                    else if (type === aurora.websocket.enums.types.OBJECT) {
                        decodedData = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(body)));
                    }
                    else if (type === aurora.websocket.enums.types.BINARY) {
                        decodedData = body;
                    }
                    testClient.message(pluginId, channelId, decodedData);
                }
            });
            
        });
        client.connect('wss://' + serverAddr + '/websocket', undefined, undefined, {Cookie: cookie});
    };    
    return new Promise(function (resolve, error) {
        const req = https.request('https://' + serverAddr, {rejectUnauthorized: false}, function (res) {
            if (res.statusCode !== 200) {
                error(res.statusCode);
            }
            else {
                if (login) {
                    //set the cookies
                    const loginReq = https.request('https://' + serverAddr + '/login', {
                        method: 'POST',
                        rejectUnauthorized: false
                    }, function (res) {
                        if (res.statusCode !== 200) {
                            error(res.statusCode);
                        }
                        else {
                            connectWebsocket(toClientCookies(res.headers['set-cookie']), resolve, error);
                        }
                    });
                    loginReq.end('username=' + encodeURIComponent(login.username) + '&password=' + encodeURIComponent(login.password));
                }
                else {
                    connectWebsocket(toClientCookies(res.headers['set-cookie']), resolve, error);
                }
            }
                        
        });
        // first we need to get a session id
        req.end();
    });
};



let schema = aurora.db.schema;
let tables = schema.tables.base;
let adminClient = null;
let client1Client = null;
let mentor1Client = null;

let client2Client = null;
let mentor2Client = null;
let anonClient = null;
let mentor1Id;
let mentor2Id;
let client1Id;
let client2Id;
let client3Id;

function makeUser(obj) {
    let base = {active: true, lockcount: 0, email: ''};
    goog.object.extend(base, obj);
    return base;
    
};


it('security-read-users', async () => {

    let users = await adminClient.getData(tables.user);
    let musers = await mentor1Client.getData(tables.user);
    let ausers = await anonClient.getData(tables.user);
    let cusers = await client1Client.getData(tables.user);
    
    expect(users.length).toEqual(6);
    
    // the mentor should only be able to see themselves and their clients
    expect(musers.length).toBe(2);
    expect(musers.map(x => x.id).sort()).toEqual([mentor1Id + '', client1Id + ''].sort());
    
    // the user should only be able to see themselves
    expect(cusers.length).toEqual(1);
    expect(cusers.map(x => x.id).sort()).toEqual([client1Id + ''].sort());
    
    
});

it('security-add-users', async () => {
    await expect(anonClient.add(tables.user, makeUser({username: 'mentor3', password: 'mentor1', groups: [{order: 1, groupid: 3}]}))).rejects.toBeDefined();
    await expect(mentor1Client.add(tables.user, makeUser({username: 'mentor3', password: 'mentor1', groups: [{order: 1, groupid: 3}]}))).rejects.toBeDefined();
    await expect(client1Client.add(tables.user, makeUser({username: 'mentor3', password: 'mentor1', groups: [{order: 1, groupid: 3}]}))).rejects.toBeDefined();

});

function makePath (partsIn) {
    let items = [];

    let parts = partsIn;
    
    if (!(partsIn instanceof Array)) {
        parts = [];
        for (let i = 0; i < arguments.length; i++) {
            parts.push(arguments[i]);
        }
        
    }
    for (let p of parts) {
        if (p && p.info && p.info.path) {
            items = items.concat(Path.fromString(p.info.path).items());
            
        } else if (typeof(p) === 'string') {
            items = items.concat(Path.fromString(p).items());
        }
        else if (p instanceof aurora.db.PrimaryKey) {
            items[items.length -1] = new recoil.db.ChangeSet.PathItem(items[items.length -1].name(), ['id'], [p]);
        }
        else {
            items[items.length -1] = new recoil.db.ChangeSet.PathItem(items[items.length -1].name(), ['id'], [new aurora.db.PrimaryKey(p)]);
        }
                                          
    }
    return new Path(items);
    
}
it('security-update-user-groups', async () => {
    
    const query = new recoil.db.Query();
    const userPath = Path.fromString(tables.user.info.path);
    const groupId = await adminClient.add(userPath.setKeys(['id'],[new aurora.db.PrimaryKey(mentor2Id)]).appendName('groups'), {order: 2, groupid: 1});

    let users = await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(mentor2Id)));
    expect(users.length).toBe(1);
    expect(users[0].groups.map(x=>x.groupid).sort()).toEqual(["1","3"]);
    await adminClient.remove(makePath([tables.user.info.path, mentor2Id, 'groups', groupId]));

    users = await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(mentor2Id)));
    expect(users.length).toBe(1);
    expect(users[0].groups.map(x=>x.groupid).sort()).toEqual(["3"]);
    // passwords are null to everybody
    expect(users[0].password).toBe(null);

    await expect(mentor1Client.add(userPath.setKeys(['id'],[new aurora.db.PrimaryKey(mentor1Id)]).appendName('groups'), {order: 2, groupid: 1})).rejects.toBe('Access Denied');
    await expect(mentor1Client.add(userPath.setKeys(['id'],[new aurora.db.PrimaryKey(mentor2Id)]).appendName('groups'), {order: 2, groupid: 1})).rejects.toBe('Access Denied');

    await expect(client1Client.add(userPath.setKeys(['id'],[new aurora.db.PrimaryKey(mentor1Id)]).appendName('groups'), {order: 2, groupid: 1})).rejects.toBe('Access Denied');
    await expect(client1Client.add(userPath.setKeys(['id'],[new aurora.db.PrimaryKey(client1Id)]).appendName('groups'), {order: 2, groupid: 1})).rejects.toBe('Access Denied');

    await expect(anonClient.add(userPath.setKeys(['id'],[new aurora.db.PrimaryKey(mentor1Id)]).appendName('groups'), {order: 2, groupid: 1})).rejects.toBe('Access Denied');
    await expect(anonClient.add(userPath.setKeys(['id'],[new aurora.db.PrimaryKey(client1Id)]).appendName('groups'), {order: 2, groupid: 1})).rejects.toBe('Access Denied');

    users = await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(mentor1Id)));
    expect(users.length).toBe(1);
    expect(users[0].groups.map(x=>x.groupid)).toEqual(["3"]);
    let mentor1GroupId = BigInt(users[0].groups[0].id);
                         
    users = await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(mentor2Id)));
    expect(users.length).toBe(1);
    expect(users[0].groups.map(x=>x.groupid)).toEqual(["3"]);
    users = await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(client1Id)));
    let client1GroupId = BigInt(users[0].groups[0].id);
    let client3GroupId = BigInt((await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(client3Id))))[0].groups[0].id);
    expect(users.length).toBe(1);
    expect(users[0].groups.map(x=>x.groupid)).toEqual(["2"]);

    // just check it works
    await adminClient.set(makePath([tables.user.info.path, client3Id, 'groups', client3GroupId]), {groupid: 1});
    await adminClient.set(makePath([tables.user.info.path, client3Id, 'groups', client3GroupId]), {groupid: 3});

    
    // can't update group
    await expect(mentor1Client.set(makePath([tables.user.info.path, mentor1Id, 'groups', mentor1GroupId]), {groupid: 1})).rejects.toBe('Access Denied');
    await expect(client1Client.set(makePath([tables.user.info.path, client1Id, 'groups', client1GroupId]), {groupid: 1})).rejects.toBe('Access Denied');


    // special fields that admin can't set or access
    await adminClient.set(makePath([tables.user.info.path, mentor1Id]), {username: 'apple'});
    await mentor1Client.set(makePath([tables.user.info.path, mentor1Id]), {username: 'mentor1'});

    // don't expect an access denied it does not even exist to mentor 1
    await expect(mentor1Client.set(makePath([tables.user.info.path, mentor2Id]), {username: 'apple'})).rejects.toBeDefined();
    await expect(client1Client.set(makePath([tables.user.info.path, mentor1Id]), {username: 'apple'})).rejects.toBeDefined();


    // special fields no on can set the are operated throug rpcs

    for (let field of ['resetcode','resetcodetimeout', 'lockcount','lastinvalidtime']) {
        let data = {};
        data[field] = '1';
        expect(users[0][field]).toBeUndefined();
        await expect(adminClient.set(makePath([tables.user.info.path, mentor1Id]), data)).rejects.toBe('Access Denied');
    };

    
    await expect(mentor1Client.remove(makePath([tables.user.info.path, mentor1Id, 'groups', groupId]))).rejects.toBe('Access Denied');
    await expect(mentor1Client.remove(makePath([tables.user.info.path,client1Id, 'groups', groupId]))).rejects.toBe('Access Denied');
    
});



function findById(id, list) {
    for (let e of list) {
        if (e.id == id) {
            return e;
        }
    }
    return null;
}
it('security-budget-template', async () => {
    let tbl = tables.budget_template;
    let addId = await adminClient.add(tbl, {order: 44, type: 0, description: "test"});
    await adminClient.set(makePath([tbl.info.path, addId]), {description: "test 2"});
    let entries = await adminClient.getData(tbl);


    let found = findById(addId, entries);
    expect(found.order).toEqual(44);
    expect(found.type).toEqual(0);
    expect(found.description).toEqual('test 2');

    for (let client of [mentor1Client, anonClient, client1Client]) {
        await expect(client.add(tbl, {order: 44, type: 0, description: "test x"})).rejects.toBe('Access Denied');
        await expect(client.remove(makePath([tbl.info.path, addId]))).rejects.toBe('Access Denied');
        await expect(client.set(makePath([tbl.info.path, addId]), {description: "test 3"})).rejects.toBe('Access Denied');
        let clientEntries = await client.getData(tbl);
        expect(clientEntries.length).toEqual(entries.length);
    }

    await adminClient.remove(makePath([tbl.info.path, addId]));

    let entries1 = await adminClient.getData(tbl);
    expect(entries1.length).toEqual(entries.length -1);
});

it('security-site', async () => {
    let tbl = tables.site;
    let entries = await adminClient.getData(tbl);
    expect(entries.length).toBe(1);
    let entryId = BigInt(entries[0].id);
    await adminClient.set(makePath([tbl.info.path, entryId]), {name: "----"});
    let newEntries = await adminClient.getData(tbl);
    expect(newEntries[0].name).toBe('----');
    await adminClient.set(makePath([tbl.info.path, entryId]), {name: entries[0].name});
    let regId = await adminClient.add(makePath([tbl.info.path, entryId, 'regular']), {start: 2, stop: 3});
    
    await adminClient.set(makePath([tbl.info.path, entryId, 'regular', regId]), {start: 4, stop: 5});
    newEntries = await adminClient.getData(tbl);

    let found = findById(regId, newEntries[0].regular);
    expect(found.start).toBe(4);
    expect(found.stop).toBe(5);

    for (let client of [mentor1Client, anonClient, client1Client]) {
        await expect(client.add(tbl, {name: 'bob'})).rejects.toBe('Access Denied');
        await expect(client.set(makePath([tbl.info.path, entryId, 'regular', regId]), {start: 7, stop: 8})).rejects.toBe('Access Denied');
        await expect(client.remove(makePath([tbl.info.path, entryId, 'regular', regId]))).rejects.toBe('Access Denied');
        await expect(client.remove(makePath([tbl.info.path, entryId]))).rejects.toBe('Access Denied');
        await expect(client.set(makePath([tbl.info.path, entryId]), {name: 'xxx'})).rejects.toBe('Access Denied');
    }

    await adminClient.remove(makePath([tbl.info.path, entryId, 'regular', regId]));
});

it('security-holidays', async () => {
    let tbl = tables.site_holidays;
    let entries = await adminClient.getData(tbl);
    let siteId = BigInt((await adminClient.getData(tables.site))[0].id);
    let hId = await checkHasPerms(adminClient, tbl, {siteid: siteId, start: 1, stop: 2}, {start: 3, stop: 4}, 'cru'); 
    
    for (let client of [mentor1Client, anonClient, client1Client]) {
        await checkHasPerms(client, tbl, {siteid: siteId, start: 3, stop: 4}, {start: 5}, 'r', hId);
        await checkHasntPerms(client, tbl, {siteid: siteId, start: 3, stop: 4}, {start: 5}, 'cud', hId);         
    }
    
    await checkHasPerms(adminClient, tbl, {}, {}, 'd', hId); 
});

it('security-mentor-availablity', async () => {

    let tbl = tables.mentor_availablity;
    let siteId = BigInt((await adminClient.getData(tables.site))[0].id);
    let aId1 = await checkHasPerms(adminClient, tbl, {siteid: siteId, mentorid: mentor1Id, start: 1, stop: 2, len: 1, appointmentLen: 1}, {stop: 4}, 'cru');
    let aId2 = await checkHasPerms(mentor1Client, tbl, {siteid: siteId, mentorid: mentor1Id, start: 1, stop: 2, len: 1, appointmentLen: 1}, {start: 3, stop: 4}, 'cru');
    let aId3 = await checkHasPerms(adminClient, tbl, {siteid: siteId, mentorid: mentor2Id, start: 1, stop: 2, len: 1, appointmentLen: 1}, {stop: 4}, 'cru');

    await checkHasntPerms(mentor1Client, tbl, {siteid: siteId, mentorid: mentor2Id, start: 1, stop: 2, len: 1, appointmentLen: 1}, {start: 3, stop: 4}, 'cud', aId3);
    await checkHasntPerms(client1Client, tbl, {siteid: siteId, mentorid: client1Id, start: 1, stop: 2, len: 1, appointmentLen: 1}, {start: 3, stop: 4}, 'cud', aId3);
    await checkHasntPerms(anonClient, tbl, {siteid: siteId, mentorid: client1Id, start: 1, stop: 2, len: 1, appointmentLen: 1}, {start: 3, stop: 4}, 'cud', aId3);

    await checkHasPerms(adminClient, tbl, {}, {stop: 4}, 'd', aId1);
    await checkHasPerms(mentor1Client, tbl, {}, {stop: 4}, 'd', aId2);
    await checkHasPerms(adminClient, tbl, {}, {stop: 4}, 'd', aId3);
});

it('security-permissions', async () => {

    let groupT = tables.group;
    let permissionT = tables.permission;
    let permissions;
    // all clients should be able to read what secuirty ther is
    let allClients = [anonClient, client1Client, mentor1Client, adminClient];
    let normalClients = [anonClient, client1Client, mentor1Client];
    for (let client of allClients) {
        permissions = await anonClient.getData(permissionT);
    }
    let clientPermId = BigInt(permissions.filter(x => x.name === 'client')[0].id);
    let mentorPermId = BigInt(permissions.filter(x => x.name === 'mentor')[0].id);

    for (let client of allClients) {
        await checkHasntPerms(mentor1Client, permissionT, {name: 'bob', description: 'fred'}, {name: 'bob1', description: 'fred1'}, 'cud',  clientPermId);
    }
    
    let testGroup1Id = await checkHasPerms(adminClient, groupT, {name: 'test', permission: [{permissionid: clientPermId}]}, {name: 'test-1'}, 'cru');
    let mentorGroupPermId = await adminClient.add(makePath([groupT, testGroup1Id, 'permission']), {permissionid: mentorPermId});
    for (let client of normalClients) {
        await checkHasntPerms(client, groupT, {name: 'test2', permission: [{permissionid: clientPermId}]}, {name: 'test-1'}, 'cud',  testGroup1Id);
        await expect(client.add(makePath([groupT, testGroup1Id, 'permission']), {permissionid: mentorPermId})).rejects.toBe('Access Denied');
        await expect(client.set(makePath([groupT, testGroup1Id, 'permission', mentorGroupPermId]), {permissionid: clientPermId})).rejects.toBe('Access Denied');
        await expect(client.remove(makePath([groupT, testGroup1Id, 'permission', mentorGroupPermId]))).rejects.toBe('Access Denied');
    }

    await adminClient.set(makePath([groupT, testGroup1Id, 'permission', mentorGroupPermId]), {permissionid: clientPermId}); 
    await adminClient.remove(makePath([groupT, testGroup1Id, 'permission', mentorGroupPermId]));
    await checkHasPerms(adminClient, groupT, {}, {}, 'd', testGroup1Id);
});




it('security-budget-perm', async () => {
    function makeEntry(order, amount) {
        return {
            order: order, description: 'desc ' + order,
            notes: 'note ' + order,
            value: '' +  amount,
            arrears: '',
            owing: '',
            type: 0,
            period: 1
        };
    }
    let tbl = tables.budget;
    let client2BudgetId = await adminClient.add(tbl, {
        name: 'budgetc2', userid: client2Id, period: 1, createTime: 1,
        entries: [makeEntry(1, 20), makeEntry(2, 30)]
    });

    const query = new recoil.db.Query();

    let client2Budget = (await adminClient.getData(tbl, query.eq(query.field(tbl.cols.id), query.val(client2BudgetId))))[0];
    
    let client1Budget1Id = await mentor1Client.add(tbl, {
        name: 'budgetc1.1', userid: client1Id, period: 1, createTime: 1,
        entries: [makeEntry(1, 20), makeEntry(2, 30)]
    });

    let client1Budget2Id = await client1Client.add(tbl, {
        name: 'budgetc2.1', userid: client1Id, period: 1, createTime: 1,
        entries: [makeEntry(1, 20), makeEntry(2, 30)]
    });

    // can't create budget for other users
    let i = 0;
    for (let client of [mentor1Client, client1Client, anonClient]) {
        await expect(client.add(tbl, {
            name: 'budgetc1.error', userid: client2Id, period: 1, createTime: 1,
            entries: [makeEntry(1, 20), makeEntry(2, 30)]
        })).rejects.toBe('Access Denied');

        const entryId = BigInt(client2Budget.entries[0].id);
        const budgetPath = makePath([tbl, client2BudgetId]);
        const itemPath = makePath([tbl, client2BudgetId, 'entries', entryId]);
        const anon = client === anonClient;

        await expect(client.remove(budgetPath)).rejects.toBe(doesNotExistError(budgetPath, anon));
        await expect(client.remove(itemPath)).rejects.toBe(doesNotExistError(itemPath, anon));

        const entriesPath = makePath([tbl, client2BudgetId, 'entries', client.nextPk()]);
        await expect(client.add(entriesPath, makeEntry(77, 20))).rejects.toBe(invalidParentError(entriesPath, anon));

        await expect(client.set(budgetPath, {'name': 'invalid'})).rejects.toBe(doesNotExistError(budgetPath,'name', anon));
        await expect(client.set(itemPath, {'description': 'invalid'})).rejects.toBe(doesNotExistError(itemPath, 'description', anon));
        
    }


    for (let info of [
        {client: adminClient, id: client2BudgetId},
        {client: mentor1Client, id: client1Budget1Id},
        {client: client1Client, id: client1Budget2Id},
    ]) {
        await info.client.set(makePath([tbl, info.id]), {name: 'stuff'});
        let budget = (await info.client.getData(tbl, query.eq(query.field(tbl.cols.id), query.val(info.id))))[0];
        let eid = BigInt(budget.entries[0].id);
        await info.client.set(makePath([tbl, info.id, 'entries', eid]), {description: 'stuff'});
        await info.client.add(makePath([tbl, info.id, 'entries']), makeEntry(77, 20));
        
        await info.client.remove(makePath([tbl, info.id]));

    }
    
});

it('security-notes', async () => {
    let userT = tables.user;
    const query = new recoil.db.Query();

    let client1Data = (await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(client1Id))))[0];
    let client2Data = (await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(client2Id))))[0];

    
    let notes1Id = await adminClient.add(makePath(userT, client1Id, 'notes'), {description: 'admin note', when: 1});
    let notes2Id = await mentor1Client.add(makePath(userT, client1Id, 'notes'), {description: 'mentor note', when: 2});
    let notes3Id = await adminClient.add(makePath(userT, client2Id, 'notes'), {description: 'admin note', when: 1});

    // clients should be able to read their notes
    expect ((await client1Client.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(client1Id))))[0].notes.length).toBe(2);

    for (const info of [{data: client1Data, clients: [{client: anonClient, seen: false},
                                                      {client: client1Client, seen: false}]},
                        {data: client2Data, clients: [{client: anonClient, seen: false},
                                                      {client: mentor1Client, seen: true},
                                                      {client: client1Client, seen: false}]}]){
        let id = BigInt(info.data.id);
        for (const cInfo of info.clients) {
            let client = cInfo.client;
            let pk = client.nextPk();
            let path = makePath(userT, id, 'notes');
            let itemPath = makePath(userT, id, 'notes', pk);
            await expect (client.add(path, {description: 'bad note', when: 1})).rejects.toBe(invalidParentError(itemPath, !cInfo.seen));
            
        }
    }
    for (const client of [anonClient, client1Client]) {
        await expect (client.set(makePath(userT, client1Id, notes1Id), {description: 'update note'})).rejects.toBe('Access Denied'); 
        
    }
    
    await expect (mentor1Client.set(makePath(userT, client1Id, notes1Id), {description: 'update note'})).rejects.toBeDefined();
    await expect (adminClient.set(makePath(userT, client1Id, notes1Id), {description: 'update note1'})).rejects.toBeDefined();
    for (const client of [client1Client, mentor1Client]) {
        let path = makePath(userT, client2Id, notes3Id);
        await expect (client.set(path, {description: 'update note'})).rejects.toBeDefined();
        
    }

    await adminClient.remove(makePath(userT, client1Id, 'notes', notes1Id));
    await mentor1Client.remove(makePath(userT, client1Id, 'notes', notes2Id));
    await adminClient.remove(makePath(userT, client2Id, 'notes', notes3Id));

});


it('security-documents', async () => {
    let userT = tables.user;
    for (let client in [adminClient]) {
        await expect (adminClient.add(makePath(userT, client1Id, 'documents'), {})).rejects.toBe('Access Denied');
    }
    let data = "1234567890".repeat(6400 * 2);
    await adminClient.uploadFile(makePath(userT, client1Id, 'documents'), 'bob1.txt', data);
    await mentor1Client.uploadFile(makePath(userT, client1Id, 'documents'), 'bob2.txt', data);
    await client1Client.uploadFile(makePath(userT, client1Id, 'documents'), 'bob3.txt', data);
    await expect(anonClient.uploadFile(makePath(userT, client1Id, 'documents'), 'bob4.txt', data)).rejects.toBe(404);
    await expect(mentor1Client.uploadFile(makePath(userT, client2Id, 'documents'), 'bob4.txt', data)).rejects.toBe(404);
    await expect(mentor1Client.uploadFile(makePath(userT, client2Id, 'documents'), 'bob4.txt', data)).rejects.toBe(404);
    
    const query = new recoil.db.Query();
    
    let documents = (await adminClient.getData(tables.user, query.eq(query.field(tables.user.cols.id), query.val(client1Id))))[0].documents;

    function findByName(list, name) {
        for (let i of list) {
            if (i.name === name) {
                return i;
            }
        }
        return null;
    }
    expect(documents.length).toBe(3);
    expect(findByName(documents, 'bob1.txt').size).toBe(data.length);

    let id1 = BigInt(findByName(documents, 'bob1.txt').id);
    let id2 = BigInt(findByName(documents, 'bob2.txt').id);
    let id3 = BigInt(findByName(documents, 'bob3.txt').id);


    
    // no body should be able to access a file directly

    let fileT = tables.file_storage;

    await expect(adminClient.getData(fileT)).rejects.toBe('Access Denied');


    await adminClient.set(makePath(userT, client1Id, 'documents', id1), {name: 'fred1.txt'});
    await client1Client.set(makePath(userT, client1Id, 'documents', id2), {name: 'fred2.txt'});
    await mentor1Client.set(makePath(userT, client1Id, 'documents', id3), {name: 'fred3.txt'});
    
    await expect(anonClient.set(makePath(userT, client1Id, 'documents', id3), {name: 'fred3.txt'})).rejects.toBeDefined();
    await expect(mentor2Client.set(makePath(userT, client1Id, 'documents', id3), {name: 'fred3.txt'})).rejects.toBeDefined();
    await expect(client2Client.set(makePath(userT, client1Id, 'documents', id3), {name: 'fred3.txt'})).rejects.toBeDefined();

    // no updating file ids
    await expect(adminClient.set(makePath(userT, client1Id, 'documents', id3), {fileid: id2})).rejects.toBeDefined();
    await expect(adminClient.set(makePath(fileT), {size: 6})).rejects.toBe('Access Denied');
    let p = makePath(fileT, BigInt(1), 'parts', BigInt(1));

    await expect(adminClient.set(p, {order: 77})).rejects.toBe('Access Denied');


    await expect(mentor2Client.remove(makePath(userT, client1Id, 'documents', id3))).rejects.toBeDefined();
    await expect(client2Client.remove(makePath(userT, client1Id, 'documents', id3))).rejects.toBeDefined();


    // download files

    await expect(client1Client.downloadFile(makePath(userT, client1Id, 'documents', id1))).resolves.toBe(data);
    await expect(adminClient.downloadFile(makePath(userT, client1Id, 'documents', id1))).resolves.toBe(data);
    await expect(mentor1Client.downloadFile(makePath(userT, client1Id, 'documents', id1))).resolves.toBe(data);

    await expect(mentor2Client.downloadFile(makePath(userT, client1Id, 'documents', id1))).rejects.toBe(404);
    await expect(client2Client.downloadFile(makePath(userT, client1Id, 'documents', id1))).rejects.toBe(404);


    await adminClient.remove(makePath(userT, client1Id, 'documents', id1));
    await mentor1Client.remove(makePath(userT, client1Id, 'documents', id2));
    await client1Client.remove(makePath(userT, client1Id, 'documents', id3));

    

});

it('security-appointments', async () => {
    let tableT = tables.appointments;
    function makeApt(mid, cid, start, opts) {
        
        let res =  {
            showed: false,
            mentorid: mid,
            userid: cid,
            start: start,
            firstName: 'joe',
            lastName: 'blogs',
            phone: '123',
            email: 'x@y',
            address: '123 x st',
            stop: start + 3600000,
            
        };
        goog.object.extend(res, opts || {});
        return res;
    };
    let apt1Id = await adminClient.add(makePath(tableT), makeApt(mentor1Id, client1Id, 100));
    let apt2Id = await adminClient.add(makePath(tableT), makeApt(mentor2Id, client2Id, 100));
    let apt3Id = await mentor1Client.add(makePath(tableT), makeApt(mentor1Id, client1Id, 200));
    let apt4Id = await client1Client.add(makePath(tableT), makeApt(mentor1Id, client1Id, 300));


    let client1Appts = await client1Client.getData(tableT);
    let mentor1Appts = await mentor1Client.getData(tableT);
    let anonAppts = await anonClient.getData(tableT);

    expect(anonAppts.length).toBe(0);
    expect(mentor1Appts.length).toBe(3);
    expect(client1Appts.length).toBe(3);
    // mentors and clients can't schedule appointments that don't involve them and a client the already have

    await expect(client1Client.add(makePath(tableT), makeApt(mentor1Id, client2Id, 100))).rejects.toBe('Access Denied');
    await expect(mentor1Client.add(makePath(tableT), makeApt(mentor1Id, client2Id, 100))).rejects.toBe('Access Denied');


    // can't change the users
    await expect(client1Client.set(makePath(tableT, apt1Id), {userid: client2Id})).rejects.toBe('Access Denied');
    await expect(mentor1Client.set(makePath(tableT, apt1Id), {userid: client2Id})).rejects.toBe('Access Denied');


    await expect(mentor1Client.set(makePath(tableT, apt2Id), {userid: client1Id})).rejects.toBe('Access Denied');
    await expect(mentor1Client.set(makePath(tableT, apt2Id), {mentorid: mentor1Id})).rejects.toBe('Access Denied');

    await mentor1Client.remove(makePath(tableT, apt1Id));
    await expect(mentor1Client.remove(makePath(tableT, apt2Id))).rejects.toBeDefined();
    await expect(client1Client.remove(makePath(tableT, apt2Id))).rejects.toBeDefined();


    await expect(anonClient.remove(makePath(tableT, apt2Id))).rejects.toBeDefined();
    await adminClient.remove(makePath(tableT, apt2Id));
    await client1Client.remove(makePath(tableT, apt3Id));
    await client1Client.remove(makePath(tableT, apt4Id));
    
    
        
    // customers should not be able to see scheduled appointments for other people

    // test rpcs
});


beforeAll(async () => {
    adminClient = await connectClient({username: 'admin', password: 'admin'});
    mentor1Id = await adminClient.add(tables.user, makeUser({username: 'mentor1', password: 'mentor1', groups: [{order: 1, groupid: 3}]}));
    mentor2Id = await adminClient.add(tables.user, makeUser({username: 'mentor2', password: 'mentor2', groups: [{order: 1, groupid: 3}]}));
    client1Id = await adminClient.add(tables.user, makeUser({username: 'client1', mentorid: mentor1Id, password: 'client1', groups: [{order: 1, groupid: 2}]}));
    client2Id = await adminClient.add(tables.user, makeUser({username: 'client2', password: mentor2Id,  password: 'client2', groups: [{order: 1, groupid: 2}]}));
    client3Id = await adminClient.add(tables.user, makeUser({username: 'client3', password: 'client2', groups: [{order: 1, groupid: 2}]}));
            
    client1Client = await connectClient({username: 'client1', password: 'client1'});
    mentor1Client = await connectClient({username: 'mentor1', password: 'mentor1'});

    client2Client = await connectClient({username: 'client2', password: 'client2'});
    mentor2Client = await connectClient({username: 'mentor2', password: 'mentor2'});
    anonClient = await connectClient();

});

afterAll(async () => {
    if (adminClient) {adminClient.close();}
    if (client1Client) {client1Client.close();}
    if (mentor1Client) {mentor1Client.close();}
    if (anonClient) {mentor1Client.close();}


    
    await new Promise(function (resolve, error) {
        const req = https.request('https://' + serverAddr + '/shutdown', {rejectUnauthorized: false}, function (res) {
            resolve('done');
        });
        req.end();

    });
});
