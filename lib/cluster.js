
/*!
 * Cluster
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var fs = require('fs');

// load native API shim for node versions > 0.4.x
var Master,
    minorVersion = parseFloat(process.versions.node);
if (minorVersion > 0.4) {
    Master = require('./native');
}
else {
    Master = require('./master');
}

/**
 * Export `start` as the module.
 */

exports = module.exports = start;

/**
 * Library version.
 */

exports.version = '0.8.0';

/**
 * Expose utils.
 */

exports.utils = require('./utils');

/**
 * Start a new `Master` with the given `server`.
 *
 * @param {http.Server} server
 * @return {Master}
 * @api public
 */

function start(server) {
  return new Master(server);
}

/**
 * Expose middleware via lazy-requires.
 */

fs.readdirSync(__dirname + '/plugins').forEach(function(plugin){
  plugin = plugin.replace('.js', '');
  exports.__defineGetter__(plugin, function(){
    return require('./plugins/' + plugin);
  });
});
