const ChangeWriter = require('../../output/testable.js').aurora.db.sql.ChangeWriter;
const ChangeSet = require('../../output/testable.js').recoil.db.ChangeSet;
const PrimaryKey = require('../../output/testable.js').aurora.db.PrimaryKey;
const aurora = /**/ require('../../output/testable.js').aurora;
const async = require('async');
const makePath = require('./schema.test-helper.js').makePath;
const makeSchema = require('./schema.test-helper.js').makeSchema;
const makeReader = require('./schema.test-helper.js').makeReader;
const config = require('../../output/testable.js').config;
const Pool = require('../../output/testable.js').aurora.db.Pool;

const Path = ChangeSet.Path;
const Add = ChangeSet.Add;
const Set = ChangeSet.Set;

let schema = makeSchema({
    't1' : {
        'name': {
            type: 'string'
        },
        'password': {
            type: 'password'
        },
        't1-list': {
            type: 'list',
            children: {
                'name': {
                    'type': 'string'
                },
                'password': {
                    type: 'password'
                },
            }
        },
        access: aurora.db.access.basic([{'': 'crud'}])

    },
    'z-ref' : {
        'name': { type: 'string'},
        access: aurora.db.access.basic([{'': 'crud'}])
    },
    'a-ref' : {
        'name': { type: 'string'},
        access: aurora.db.access.basic([{'': 'crud'}])
    },
    'referer': {
        'name': { type: 'string'},
        'z-ref': { type: 'ref', table: 'z-ref' },
        'a-ref': { type: 'ref', table: 'a-ref' },
        access: aurora.db.access.basic([{'': 'crud'}])
    },
    'sec-t1' : {
        'name': {
            type: 'string'
        },
        'sec-t1-list': {
            type: 'list',
            children: {
                'name': {
                    'type': 'string'
                    }
            }
        },
        access: aurora.db.access.basic([{'admin': 'crud'}, {'':''}])

    }


});


test('add children when parent does not exist', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);

    cw.applyChanges([
        new  ChangeSet.Add(
            makePath('t1', {mem: 1}, 't1-list', {mem: 1}),
            [
                new  Set(makePath('t1', {mem: 1}, 't1-list', {mem: 1}, 'name'), null, 'l1'),
            ]),
        new  ChangeSet.Add(
            makePath('t1', 1, 't1-list', {mem: 1}),
            [
                new  Set(makePath('t1', 1, 't1-list', {mem: 1}, 'name'), null, 'l1'),
            ])
    ], {userid: 1}, function (result) {
        expect(result.length).toBe(2);
        expect(result[0].error).toBeTruthy();
        expect(result[1].error).toBeTruthy();
        done();
    });
});

test('set-children-when-parent-does-not-exist', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);

    cw.applyChanges([
        new  ChangeSet.Set(
            makePath('t1', {mem: 1}, 'name'), 'bob'),
        new  ChangeSet.Set(
            makePath('t1', 1, 'name'), 'bob'),
    ], {userid: 1}, function (result) {
        expect(result.length).toBe(2);
        expect(result[0].error).toBeTruthy();
        expect(result[1].error).toBeTruthy();
        expect(mockReader.writes.length).toBe(0);
        done();
    });
});


test('add with sub tables', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);

    cw.applyChanges([
        new ChangeSet.Add(makePath('t1', {mem: 1}), [
            new  Set(makePath('t1', {mem: 1}, 'name'), null, 'bob'),
            new  ChangeSet.Add(
                makePath('t1', {mem: 1}, 't1-list', {mem: 1}),
                [
                    new  Set(makePath('t1', {mem: 1}, 't1-list', {mem: 1}, 'name'), null, 'l1'),
                ])
        ])], {userid: 1}, function (result) {
            let trans = mockReader.writes[0].transaction;
            expect(trans).toBeDefined();
            expect(trans.length).toBe(2);
            expect(trans[0]).toStrictEqual({type: 'insert', table: 't1', obj: {name: 'bob'}});
            expect(trans[1]).toStrictEqual({type: 'insert', table: 't1-list', obj: {parent: result[0].id, name: 'l1'}});
            let listId = (((result[0] || {}).children || [])[1]).id;
            expect(listId).toBeDefined();
            expect(result).toStrictEqual([{error: null, id: result[0].id, children: [
                {error: null}, {error: null, id: listId, children:[{error: null}]}]}]);
            done();
        });
});

test('add with invalid child', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);

    cw.applyChanges([
        new ChangeSet.Add(makePath('t1', {mem: 1}), [
            new  Set(makePath('t1', {mem: 2}, 'name'), null, 'bob'),
        ])], {userid: 1}, function (result) {

            expect(result.length).toBe(1);
            expect(result[0].error).toBeTruthy();
            done();
        });
});


test('check-password', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);
    mockReader.addObject('t1', {id: 1, name: 'fred','t1-list': [{id: BigInt(7), name: 'l1'}]});
    cw.applyChanges([
        new ChangeSet.Set(makePath('t1', 1, 'password'), null, 'apple'),
        new ChangeSet.Set(makePath('t1', 1, 't1-list', 7, 'password'), null, 'orange')
    ], {userid: 1}, function (result) {
        let trans = mockReader.writes[0].transaction;
        expect(result.length).toBe(2);
        expect(result[0].error).toBeFalsy();
        expect(result[1].error).toBeFalsy();

        expect(trans).toBeDefined();
        expect(trans.length).toBe(2);
        expect(trans[0]).toMatchObject({type: 'update', table: 't1', id: BigInt(1)});
        expect(trans[1]).toMatchObject({type: 'update', table: 't1-list', id: BigInt(7)});

        Pool.checkPassword('apple', trans[0].obj.password, function (res) {
            expect(res).toBe(true);
            Pool.checkPassword('orange', trans[1].obj.password, function (res) {
                expect(res).toBe(true);
                done();
            });
        });

    });
});


// todo delete object that doesn't exist

test('add with no permission', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);

    cw.applyChanges([
        new ChangeSet.Add(makePath('sec-t1', {mem: 1}), [
            new  Set(makePath('sec-t1', {mem: 1}, 'name'), null, 'bob'),
        ])], {userid: 1, permissions: {'guest': true}}, function (result) {

            expect(result.length).toBe(1);
            expect(result[0].error).toBeTruthy();
            done();
        });
});


test('test-new-reference', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);

    cw.applyChanges([
        new ChangeSet.Add(makePath('z-ref', {mem: 1}), [
            new  Set(makePath('z-ref', {mem: 1}, 'name'), null, 'ref')]),
        new ChangeSet.Add(makePath('referer', {mem: 1}), [
            new  Set(makePath('referer', {mem: 1}, 'name'), null, 'referer'),
            new  Set(makePath('referer', {mem: 1}, 'z-ref'), null, new PrimaryKey(null, 1)),
        ]),

    ], {userid: 1, permissions: {'admin': true}}, function (result) {
        let trans = mockReader.writes[0].transaction;
        expect(result.length).toBe(2);
        expect(result[0].error).toBeFalsy();
        expect(result[1].error).toBeFalsy();
        let refId = (result[0] || {}).id;
        expect(trans[0]).toStrictEqual({type: 'insert', table: 'z-ref', obj: {name: 'ref'}});
        expect(trans[1]).toStrictEqual({type: 'insert', table: 'referer', obj: {name: 'referer', 'z-ref' : refId}});

        done();
    });
});

test('set-reference', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);
    mockReader.addObject('a-ref', {id: 1, name: 'a-ref1'});
    mockReader.addObject('z-ref', {id: 1, name: 'z-ref1'});
    mockReader.addObject('referer', {id: 2, name: 'a-ref', 'a-ref': 1, 'z-ref': 1});
    cw.applyChanges([
        new ChangeSet.Delete(makePath('a-ref', 1), null),
        new Add(makePath('a-ref', {mem: 1}), [
            new Set(makePath('a-ref', {mem: 1}, 'name'), null, 'a-ref2'),
        ]),
        new Add(makePath('z-ref', {mem: 1}), [
            new Set(makePath('z-ref', {mem: 1}, 'name'), null, 'z-ref2'),
        ]),
        new Set(makePath('referer', 2, 'a-ref'), null, new PrimaryKey(null, 1)) ,
        new Set(makePath('referer', 2, 'z-ref'), null, new PrimaryKey(null, 1)),
    ], {userid: 1, permissions: {'admin': true}}, function (result)  {
        expect(result.length).toBe(5);
        expect(result[0].error).toBeFalsy();
        expect(result[1].error).toBeFalsy();
        expect(result[2].error).toBeFalsy();
        expect(result[3].error).toBeFalsy();
        expect(result[4].error).toBeFalsy();
        let aid = result[0].id;
        let zid = result[0].id;
        let trans = mockReader.writes[0].transaction;
        expect(trans.length).toBe(4);

        let refs = [trans[0], trans[1]];

        refs.sort(function (x, y) { return x.table.localeCompare(y.table);});

        expect(refs[0]).toStrictEqual({type: 'insert', table: 'a-ref', obj: {name: 'a-ref2'}});
        expect(refs[1]).toStrictEqual({type: 'insert', table: 'z-ref', obj: {name: 'z-ref2'}});


        done();
    });
});
//test('rec-delete'
test('test-delete-reference', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);
    mockReader.addObject('a-ref', {id: 1, name: 'a-ref','name': 'ref1'});
    mockReader.addObject('referer', {id: 2, name: 'a-ref', 'a-ref': 1});

    cw.applyChanges([
        new ChangeSet.Delete(makePath('a-ref', 1), null),
        new ChangeSet.Delete(makePath('referer', 2), null),
    ], {userid: 1, permissions: {'admin': true}}, function (result) {
        let trans = mockReader.writes[0].transaction;
        expect(result.length).toBe(2);
        expect(result[0].error).toBeFalsy();
        expect(result[1].error).toBeFalsy();
        let refId = (result[0] || {}).id;
        expect(trans[0]).toStrictEqual({type: 'delete', table: 'referer', id: BigInt(2)});
        expect(trans[1]).toStrictEqual({type: 'delete', table: 'a-ref', id: BigInt(1)});

        done();
    });
});
test('add-child', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);
    mockReader.addObject('t1', {id: 1, name: 'a-ref', 't1-list': []});

    cw.applyChanges([
        new ChangeSet.Add(makePath('t1', 1, 't1-list', {mem: 1}), [
            new ChangeSet.Set(makePath('t1', 1, 't1-list', {mem: 1}, 'name'), null, 'bob')
        ])
    ], {userid: 1, permissions: {'admin': true}}, function (result) {
        let trans = mockReader.writes[0].transaction;
        expect(result.length).toBe(1);
        expect(result[0].error).toBeFalsy();
        expect(trans.length).toBe(1);
        expect(trans[0]).toStrictEqual({type: 'insert', table: 't1-list', obj: {parent: BigInt(1), name: 'bob'}});
        done();

    });
});
test('test-delete-objects', done => {
    let mockReader = makeReader(schema);
    let cw = new ChangeWriter(schema, mockReader);
    mockReader.addObject('t1', {id: 1, name: 'a-ref', 't1-list': [{id: 2, name: 'bob'}]});

    cw.applyChanges([
        new ChangeSet.Delete(makePath('t1', 1), null)
    ], {userid: 1, permissions: {'admin': true}}, function (result) {
        let trans = mockReader.writes[0].transaction;
        expect(result.length).toBe(1);
        expect(result[0].error).toBeFalsy();
        expect(trans.length).toBe(2);
        expect(trans[0]).toStrictEqual({type: 'delete', table: 't1-list', id: BigInt(2)});
        expect(trans[1]).toStrictEqual({type: 'delete', table: 't1', id: BigInt(1)});

        done();
    });
});

config.stop();
