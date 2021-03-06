'use strict'
var hub = require('./hub')
var engine = require('./engine')
var logger = require('../utils/composrLogger')
var config = require('./config')
var allowedVerbs = ['get', 'put', 'post', 'delete']
var phraseUtils = require('../utils/phraseUtils')
var phraseHooks = require('./phraseHooks/phraseHooks')

/* *
 * [analyzePhrase description]
 * @param  {[type]} acc [description]
 * @return {[type]}     [description]
 */
function analyzePhrase (acc) {
  return function (item) {
    var domain = phraseUtils.extractDomainFromId(item.id)

    allowedVerbs.forEach(function (verb) {
      if (item[verb]) {
        // Restify doesn't use delete it uses 'del' for storing the delete callback
        var restifyMappedVerb = verb === 'delete' ? 'del' : verb

        acc.push({
          restifyVerb: restifyMappedVerb,
          verb: verb,
          domain: domain,
          path: item.url,
          id: item.id
        })
      }
    })
  }
}

/**
 * [executePhraseById description]
 * @param  {[type]}   req       [description]
 * @param  {[type]}   res       [description]
 * @param  {Function} next      [description]
 * @param  {[type]}   routeItem [description]
 * @return {[type]}             [description]
 */
function executePhraseById (req, res, next, routeItem) {
  var params = executionMode({
    corbelDriver: req.corbelDriver,
    req: req,
    res: res,
    next: next,
    browser: true,
    timeout: config('phrases.timeout'),
    server: 'restify'
  })

  hub.emit('phrase:execution:start', routeItem.domain, routeItem.id, routeItem.verb)

  return engine.composr.Phrases.runById(routeItem.domain, routeItem.id, routeItem.verb, params)
    .then(function (response) {
      enforceGC()
      hub.emit('phrase:execution:end', response.status, routeItem.domain, routeItem.id, routeItem.verb)
      return next()
    })
    .catch(function (err) {
      if (err === 'phrase:cant:be:runned') {
        err = new engine.composr.ComposrError('endpoint:not:found', 'Endpoint not found', 404)
      }

      var parsedErr = engine.composr.parseToComposrError(err.body || err, 'internal:server:error:endpoint:execution')

      if (err.status || err.statusCode) {
        parsedErr.status = err.status || err.statusCode
        parsedErr.statusCode = parsedErr.status
      }

      logger.debug(err)
      logger.error('Failing executing Phrase', parsedErr.status, routeItem.domain, routeItem.id)
      // @TODO: log error in metrics

      hub.emit('phrase:execution:end', parsedErr.status, routeItem.domain, routeItem.id, routeItem.verb)

      if (res.headersSent) {
        return next()
      } else {
        // Shortcut for res.send if the phrase hasn't handled it
        return next(parsedErr)
      }
    })
}

/**
 * Set composr-core execution phrases with Node VM
 * @param  {Object} params execution configuration
 * @return {Object} modified execution params
 */
function executionMode (params) {
  if (config('execution.vm')) {
    params.browser = false
  }

  return params
}

/**
 * Enforce run Garbage Collector every phrase execution
 * @return {[type]} [description]
 */
function enforceGC () {
  if (config('execution.gc') && !!global.gc) {
    global.gc()
  }
}

/**
 * [createRoutes description]
 * @param  {[type]}   phrases [description]
 * @param  {Function} next    [description]
 * @return {[type]}           [description]
 */
function createRoutes (phrases, next) {
  var routeObjects = []
  phrases.forEach(analyzePhrase(routeObjects))
  next(routeObjects)
}

/**
 * Add End-Points to Restify Router
 * @param  {[type]} server       [description]
 * @param  {[type]} routeObjects [description]
 * @return {[type]}              [description]
 */
function bindRoutes (server, routeObjects) {
  for (var i = routeObjects.length - 1; i >= 0; i--) {
    (function (item) {
      var url = '/' + item.domain + '/' + item.path

      var bindRoute = function (req, res, next) {
        executePhraseById(req, res, next, item)
      }

      // Mandatory hooks
      var corbelDriverSetupHook = phraseHooks.get('corbel-driver-setup')
      var metricsHook = phraseHooks.get('metrics')
      // User-defined hooks
      var hooks = phraseHooks.getHooks(item)

      var args = [url]
      if (hooks) {
        args = args.concat(hooks)
      }
      args = args.concat(corbelDriverSetupHook)
      args = args.concat(metricsHook)
      args = args.concat(bindRoute)
      server[item.restifyVerb].apply(server, args)

      // Support also v1.0 paths for the moment
      var argsV1 = ['/v1.0' + url]
      if (hooks) {
        argsV1 = argsV1.concat(hooks)
      }
      argsV1 = argsV1.concat(corbelDriverSetupHook)
      argsV1 = argsV1.concat(metricsHook)
      argsV1 = argsV1.concat(bindRoute)
      server[item.restifyVerb].apply(server, argsV1)
    })(routeObjects[i])
  }
}

/**
 * List All End-points registered in
 * Restify Router.
 * @param  {[type]} server [description]
 * @return {[type]}        [description]
 */
function listAllRoutes (server) {
  logger.debug('GET paths:')
  server.router.routes.GET.forEach(
    function (value) {
      logger.info(value.spec.path)
    }
  )
  logger.debug('PUT paths:')
  server.router.routes.PUT.forEach(
    function (value) {
      logger.info(value.spec.path)
    }
  )
  logger.debug('POST paths:')
  server.router.routes.POST.forEach(
    function (value) {
      logger.info(value.spec.path)
    }
  )
}

module.exports = function (server) {
  hub.on('create:routes', function (phrases) {
    logger.debug('Creting or updating endpoints...')

    if (!Array.isArray(phrases)) {
      phrases = [phrases]
    }

    createRoutes(phrases, function (routeObjects) {
      bindRoutes(server, routeObjects)
    })
  })

  hub.once('create:staticRoutes', function (server) {
    logger.info('Creating static routes...')
    require('../routes')(server)
  })

  hub.on('remove:route', function (url) {
    logger.debug('=========== REMOVE ROUTE ===========', url)
    // Restify doesn't support removing routes on the fly, instead return a 404
    listAllRoutes()
  })
}
