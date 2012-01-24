
/**
 * Module dependencies.
 */

var cluster = require('../')
  , http = require('http')
  , fs = require('fs');

// load native API shim for node versions > 0.4.x
var Master;
if (parseFloat(process.versions.node) > 0.4) {
    Master = require('../lib/native');
}
else {
    Master = require('../lib/master');
}

require('./common');

var server = http.createServer(function(req, res){
  setTimeout(function(){
    res.writeHead(200);
    res.end('Hello World');
  }, 1000);
});

cluster = cluster(server)
  .set('workers', 1)
  .use(cluster.pidfiles())
	.use(cluster.cli())
	.in('development').listen(3000)
	.in('staging').listen(3010);


cluster.on('listening', function(){
	cluster.preventDefault = true;
	cluster.start().should.be.an.instanceof(Master);
	cluster.close();
});
