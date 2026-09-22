'use strict';

// EVP_BytesToKey, vendored from evp_bytestokey@1.0.3 (MIT, Calvin Metcalf),
// unmaintained since 2017. Forty-five lines whose only real content is MD5,
// which @unabandoned/hash.js provides with no dependencies of its own;
// depending on the package meant carrying md5.js (2018) and hash-base too.

var Buffer = require('safe-buffer').Buffer;
var md5 = require('@unabandoned/hash.js').md5;

function digest(parts) {
	var hash = md5();
	for (var i = 0; i < parts.length; i++) {
		if (parts[i]) { hash.update(parts[i]); }
	}
	return Buffer.from(hash.digest());
}

/* eslint-disable camelcase */
function EVP_BytesToKey(password, salt, keyBits, ivLen) {
	if (!Buffer.isBuffer(password)) { password = Buffer.from(password, 'binary'); }
	if (salt) {
		if (!Buffer.isBuffer(salt)) { salt = Buffer.from(salt, 'binary'); }
		if (salt.length !== 8) { throw new RangeError('salt should be Buffer with 8 byte length'); }
	}

	var keyLen = keyBits / 8;
	var key = Buffer.alloc(keyLen);
	var iv = Buffer.alloc(ivLen || 0);
	var tmp = Buffer.alloc(0);

	while (keyLen > 0 || ivLen > 0) {
		tmp = digest([tmp, password, salt]);

		var used = 0;

		if (keyLen > 0) {
			var keyStart = key.length - keyLen;
			used = Math.min(keyLen, tmp.length);
			tmp.copy(key, keyStart, 0, used);
			keyLen -= used;
		}

		if (used < tmp.length && ivLen > 0) {
			var ivStart = iv.length - ivLen;
			var length = Math.min(ivLen, tmp.length - used);
			tmp.copy(iv, ivStart, used, used + length);
			ivLen -= length;
		}
	}

	tmp.fill(0);
	return { key: key, iv: iv };
}

module.exports = EVP_BytesToKey;
