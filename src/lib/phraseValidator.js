'use strict';

/* jshint evil:true */

var check = require('syntax-error'),
    namespace = require('require-namespace');

//CompoSR modules
var docBuilder = namespace.lib.docBuilder,
    ComposerError = namespace.lib.composerError,
    validator = namespace.lib.validate;

/**
 * Validates if a phrase is well formed
 * @param  {String} domain
 * @param  {Object} phrase
 * @throws {Error} If phrase is not well formed
 * @return {Promise}
 */
var validate = function(domain, phrase) {

    validator.isValue(domain, 'undefined:domain');
    validator.isValue(phrase, 'undefined:phrase');
    validator.isValue(phrase.url, 'undefined:phrase:url');

    var methodPresent = false;

    ['get', 'post', 'put', 'delete', 'options'].forEach(function(method) {
        if (phrase[method]) {
            validator.isValue(phrase[method].code, 'undefined:phrase:' + method + ':code');
            validator.isValue(phrase[method].doc, 'undefined:phrase:' + method + ':doc');

            var funct = new Function('req', 'res', 'next', 'corbelDriver', phrase[method].code);
            var error = check(funct);
            if (error) {
                throw new ComposerError('error:phrase:syntax', error.message, error.status);
            }

            methodPresent = true;
        }
    });

    if (!methodPresent) {
        throw new ComposerError('undefined:phrase:http_method', 'no http method defined', 400);
    }

    return docBuilder.load(domain, [phrase]);
};


module.exports.validate = validate;
