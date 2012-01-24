
/**
 * Module dependencies.
 */

var cluster = require('../')
  , assert = require('assert')
  , http = require('http');

var WORKER_ENV_VAR;
if (parseFloat(process.versions.node) > 0.4) {
    WORKER_ENV_VAR = 'NODE_WORKER_ID';
}
else {
    WORKER_ENV_VAR = 'CLUSTER_WORKER';
}

require('./common');

var server = http.createServer(function(req, res){
  res.writeHead(200);
  res.end('Hello World');
});

cluster = cluster(server)
  .listen(3000);

if (cluster.isMaster) {
  process.env.FOO = 'bar';
  assert.ok(!process.env[WORKER_ENV_VAR]);
} else {
  process.env.FOO.should.equal('bar');
  assert.ok(process.env[WORKER_ENV_VAR]);
}

cluster.on('listening', function(){
  cluster.close();
});