const access = require('../../output/testable.js').aurora.db.access;
const config = require('../../output/testable.js').config;

test('check basic access', () => {
    let testee = access.basic([{'admin': 'crud'}, {'edit': 'ru'}, {'': 'r'}]);

    expect(testee({userid: 1, permissions: {admin: true}}, 'c')).toBe(true);
    expect(testee({userid: 1, permissions: {admin: true}}, 'r')).toBe(true);
    expect(testee({userid: 1, permissions: {admin: true}}, 'u')).toBe(true);
    expect(testee({userid: 1, permissions: {admin: true}}, 'd')).toBe(true);
    expect(testee({userid: 1, permissions: {edit: true}}, 'c')).toBe(false);
    expect(testee({userid: 1, permissions: {edit: true}}, 'r')).toBe(true);
    expect(testee({userid: 1, permissions: {edit: true}}, 'u')).toBe(true);
    expect(testee({userid: 1, permissions: {}}, 'u')).toBe(false);
    expect(testee({userid: 1, permissions: {}}, 'r')).toBe(true);

});

test('check none access', () => {
    let testee = access.none;
    expect(testee({userid: 1, permissions: {admin: true}}, 'c')).toBe(false);
});

config.stop();
