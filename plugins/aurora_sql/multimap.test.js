
const MultiKeyMap = require('../../output/testable.js').recoil.structs.MultiKeyMap;
const recoil = require('../../output/testable.js').recoil;
const config = require('../../output/testable.js').config;

function sort(arr) {
    arr.sort(recoil.util.object.compare);
    return arr;
}
test('test-multi-map-add-remove', done => {
    let map = new MultiKeyMap(['a', 'b', 'c']);
    map.add({a: 1, b: 2, c: 3});
    map.add({a: 2, b: 2, c: 3});
    expect(sort(map.get(['a'], {a: 1}))).toStrictEqual(sort([{a: 1, b: 2, c: 3}]));
    expect(sort(map.get(['a', 'b'], {a: 2, b: 2}))).toStrictEqual(sort([{a: 2, b: 2, c: 3}]));
    map.removeIntersection(['a', 'b'], {a: 2, b: 2});
    expect(sort(map.get(['b'], {b: 2}))).toStrictEqual(sort([{a: 1, b: 2, c: 3}]));
    expect(map.size()).toBe(1);
    expect(map.keySize('a')).toBe(1);
    expect(map.keySize('b')).toBe(1);
    expect(map.keySize('c')).toBe(1);
    map.add({a: 2, b: 2, c: 3});
    expect(map.keySize('a')).toBe(2);
    expect(map.keySize('b')).toBe(1);
    expect(map.keySize('c')).toBe(1);

    expect(sort(map.get(['a', 'b'], {a: 2, b: 2}))).toStrictEqual(sort([{a: 2, b: 2, c: 3}]));
    map.removeIntersection(['b'], {a: 2, b: 2});
    expect(sort(map.get(['a', 'b'], {a: 2, b: 2}))).toStrictEqual(sort([]));

    expect(map.keySize('a')).toBe(0);
    expect(map.keySize('b')).toBe(0);
    expect(map.keySize('c')).toBe(0);

    done();
});

test('test-multi-map-double-add', done => {
    let map = new MultiKeyMap(['a','b','c']);

    map.add({a:1, b:2, c:3});
    map.add({a:1, b:2, c:3});

    expect(sort(map.get(['a','b'], {a:1, b:2}))).toStrictEqual(sort([{a:1, b:2, c:3}]));
    done();
});

test('test-multi-map-missing-key', done => {
    let map = new MultiKeyMap(['a','b','c']);

    map.add({a:1, b:2, c:3});
    map.add({a:2, b:2, c:3});
    map.add({a:7, b:8});

    expect(map.keySize('a')).toBe(3);
    expect(map.keySize('b')).toBe(2);
    expect(map.keySize('c')).toBe(1);
    done();

});
config.stop();
