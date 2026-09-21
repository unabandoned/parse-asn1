'use strict';

// Zero-dependency drop-in for the slice of the `tape` API this suite uses,
// implemented on Node's built-in test runner. Keeping the test bodies
// byte-for-byte identical (only their `require('tape')` line changes) avoids
// hand-rewriting security-critical crypto assertions, while removing tape's
// ~25-dependency tree from the CI dev environment that holds publish creds.
//
// Supported surface (all that the crypto-browserify suite calls):
//   test(name[, opts], cb) / t.test(name[, opts], cb)  - tests and subtests
//   t.plan(n) / t.end()                                 - completion
//   t.ok / t.notOk / t.equal(s) / t.notEqual(s) / t.deepEqual / t.notDeepEqual
//   t.match / t.doesNotMatch / t.throws / t.doesNotThrow / t.error / t.ifError
//   t.pass / t.fail / t.comment                          - assertions and output
//   opts.skip (boolean or reason string)

var nodeTest = require('node:test');
var assert = require('node:assert');

function normalize(name, opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }
    return { name: name, opts: opts || {}, cb: cb };
}

function nodeOpts(o) {
    var out = {};
    if (o && typeof o.skip !== 'undefined') out.skip = o.skip;
    if (o && typeof o.todo !== 'undefined') out.todo = o.todo;
    return out;
}

// Runs one tape-style body against a node:test context, resolving when the
// body signals completion the way tape does: an exhausted plan(), an explicit
// end(), a returned promise, or (for a parent) once its subtests settle.
function runBody(t, cb) {
    return new Promise(function (resolve, reject) {
        var planned = null;
        var count = 0;
        var done = false;
        var subtests = [];

        function settle() {
            if (done) return;
            done = true;
            Promise.all(subtests).then(function () { resolve(); }, reject);
        }
        function bump() {
            count += 1;
            test.assertions += 1;
            if (planned !== null && count >= planned) settle();
        }

        var ctx = {
            plan: function (n) { planned = n; if (count >= n) settle(); },
            end: function () { settle(); },
            ok: function (v, m) { assert.ok(v, m); bump(); },
            equal: function (a, b, m) { assert.strictEqual(a, b, m); bump(); },
            equals: function (a, b, m) { assert.strictEqual(a, b, m); bump(); },
            notEqual: function (a, b, m) { assert.notStrictEqual(a, b, m); bump(); },
            notEquals: function (a, b, m) { assert.notStrictEqual(a, b, m); bump(); },
            error: function (e, m) { assert.ifError(e); bump(); },
            ifError: function (e, m) { assert.ifError(e); bump(); },
            notOk: function (v, m) { assert.ok(!v, m); bump(); },
            deepEqual: function (a, b, m) { assert.deepStrictEqual(a, b, m); bump(); },
            notDeepEqual: function (a, b, m) { assert.notDeepStrictEqual(a, b, m); bump(); },
            doesNotMatch: function (v, re, m) { assert.doesNotMatch(v, re, m); bump(); },
            match: function (v, re, m) { assert.match(v, re, m); bump(); },
            // tape treats a string second argument as the assertion message;
            // assert.throws treats it as the expected error and rejects it.
            throws: function (fn, expected, m) {
                if (typeof expected === 'string') { m = expected; expected = undefined; }
                assert.throws(fn, expected, m);
                bump();
            },
            doesNotThrow: function (fn, expected, m) {
                if (typeof expected === 'string') { m = expected; expected = undefined; }
                assert.doesNotThrow(fn, expected, m);
                bump();
            },
            fail: function (m) { assert.fail(m || 'fail'); },
            pass: function (m) { assert.ok(true, m); bump(); },
            comment: function (m) { if (typeof t.diagnostic === 'function') t.diagnostic(String(m)); },
            test: function (sn, so, sc) {
                var n = normalize(sn, so, sc);
                subtests.push(t.test(n.name, nodeOpts(n.opts), function (st) {
                    return runBody(st, n.cb);
                }));
            }
        };

        var ret;
        try {
            ret = cb(ctx);
        } catch (err) {
            reject(err);
            return;
        }

        if (!done && planned === null) {
            if (subtests.length > 0) {
                Promise.all(subtests).then(function () { settle(); }, reject);
            } else if (ret && typeof ret.then === 'function') {
                ret.then(function () { settle(); }, reject);
            }
            // otherwise: an async leaf that will call end() later
        }
    });
}

function test(name, opts, cb) {
    var n = normalize(name, opts, cb);
    return nodeTest(n.name, nodeOpts(n.opts), function (t) {
        return runBody(t, n.cb);
    });
}

test.test = test;
// Total assertions executed, so a tape-to-node:test conversion can be checked
// against the count tape reported rather than assumed equivalent.
test.assertions = 0;

// `node --test` reports tests, not assertions, so a conversion from tape can
// look green while quietly running fewer checks. Set TAPE_SHIM_COUNT=1 to print
// the total and compare it against the count tape reported.
if (process.env.TAPE_SHIM_COUNT) {
    process.on('exit', function () {
        process.stdout.write('# assertions ' + test.assertions + '\n');
    });
}

module.exports = test;
