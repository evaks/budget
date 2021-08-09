// anyone can register
// anyone can reset password

// cust can add/remove/update/view self
// cust can add/remove/update document to self
// cust can not add/remove/update note 
// cust can add/remove/update appointment to user
// cust cannot view other mentors (appart from names and if booked)


const aurora = require('./../output/module-test.min').aurora;
const recoil = require('./../output/module-test.min').recoil;
const goog = require('./../output/module-test.min').goog;
const TestClient = require('./testclient.js').TestClient;

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


it('query-fieldmap', () => {
    const query = new recoil.db.Query();
    // check null
    console.log( new aurora.db.Schema().makeQueryScope);
    let scope = new aurora.db.Schema().makeLookupScope(recoil.db.ChangeSet.Path.fromString(tables.budget.info.path), {}, {});

    expect(query.eq(query.field('id'), query.val(1)).makeLookup(scope)).toEqual([{'id': 1}]);
    expect(query.eq(query.field(['id']), query.val(1)).makeLookup(scope)).toEqual([{'id': 1}]);
    expect(query.eq(query.field([tables.budget.cols.id]), query.val(1)).makeLookup(scope)).toEqual([{'id': 1}]);

    expect(
        query.and(
            query.eq(query.field(['id']), query.val(1)),
            query.eq(query.field(['id']), query.val(1)),
        ).makeLookup(scope)).toEqual([{'id': 1}]);

    expect(
        query.and(
            query.eq(query.field(['id']), query.val(1)),
            query.eq(query.field(['id']), query.val(2)),
        ).makeLookup(scope)).toBeNull();

    
    expect(
        query.or(
            query.eq(query.field(['id']), query.val(1)),
            query.eq(query.field(['id']), query.val(2)),
        ).makeLookup(scope).sort(recoil.util.compare)).toEqual([{id: 2}, {id:1}].sort(recoil.util.compare));

});


beforeAll(async () => {
    adminClient = await TestClient.connect(serverAddr, {username: 'admin', password: 'admin'});
    mentor1Id = await adminClient.add(tables.user, makeUser({username: 'mentor1', password: 'mentor1', groups: [{order: 1, groupid: 3}]}));
    mentor2Id = await adminClient.add(tables.user, makeUser({username: 'mentor2', password: 'mentor2', groups: [{order: 1, groupid: 3}]}));
    client1Id = await adminClient.add(tables.user, makeUser({username: 'client1', mentorid: mentor1Id, password: 'client1', groups: [{order: 1, groupid: 2}]}));
    client2Id = await adminClient.add(tables.user, makeUser({username: 'client2', password: mentor2Id,  password: 'client2', groups: [{order: 1, groupid: 2}]}));
    client3Id = await adminClient.add(tables.user, makeUser({username: 'client3', password: 'client2', groups: [{order: 1, groupid: 2}]}));
            
    client1Client = await TestClient.connect(serverAddr, {username: 'client1', password: 'client1'});
    mentor1Client = await TestClient.connect(serverAddr, {username: 'mentor1', password: 'mentor1'});

    client2Client = await TestClient.connect(serverAddr, {username: 'client2', password: 'client2'});
    mentor2Client = await TestClient.connect(serverAddr, {username: 'mentor2', password: 'mentor2'});
    anonClient = await TestClient.connect(serverAddr);

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
