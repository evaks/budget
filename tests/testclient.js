const https = require('https');
const WebSocketClient = require('websocket').client;
const aurora = require('./../output/module-test.min').aurora;
const recoil = require('./../output/module-test.min').recoil;
const goog = require('./../output/module-test.min').goog;

let TestClient = function (serverAddr, connection, user, cookies) {
    this.serverAddr_ = serverAddr;
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
};



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
        const url = 'https://' + me.serverAddr_ + '/system/upload/' + pName.join('/') + '/[' + pKeys.map(x => encodeURIComponent(x.db + '')).join(',')  + ']';
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
        const url = 'https://' + me.serverAddr_ + '/system/download/' + pName.join('/') + '/[' + pKeys.map(x => encodeURIComponent(x.db + '')).join(',')  + ']';
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
TestClient.connect = function(serverAddr, login) {
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
            let testClient = new TestClient(serverAddr, connection, login ? login.username : 'anon', cookie);
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


exports.TestClient = TestClient;
