
/*!
 * Cluster - pidfiles
 * Copyright (c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var fs = require('fs')
  , mkdir = require('mkdirp').mkdirp.sync;

/**
 * Save pidfiles to the given `dir` or `./pids`.
 *
 * Examples:
 *
 *    // save to ./pids
 *    cluster(server)
 *      .use(cluster.pidfiles())
 *      .listen(3000);
 *
 *    // save to /tmp
 *    cluster(server)
 *      .use(cluster.pidfiles('/tmp'))
 *      .listen(3000);
 *
 *    // save to /var/run/node
 *    cluster(server)
 *      .use(cluster.logger('/var/run/node'))
 *      .listen(3000);
 *
 * @param {String} dir
 * @return {Function}
 * @api public
 */

module.exports = function(dir){
  return function(master){
    dir = master.pidfiles = master.resolve(dir || 'pids');

    // augment master
    master.pidof = function(name){
      var dir = master.pidfiles
        , path = dir + '/' + name + '.pid'
        , pid = fs.readFileSync(path, 'ascii');

      return parseInt(pid, 10);
    };

    master.workerpids = function(){
      var dir = master.pidfiles;
      return fs.readdirSync(dir).filter(function(file){
        return file.match(/^worker\./);
      }).map(function(file){
        return parseInt(fs.readFileSync(dir + '/' + file, 'ascii'), 10);
      });
    };

    try {
      mkdir(dir, 0755);
    }
    catch (err) {
      throw err;
    }

      // save worker pids
      master.on('worker', function(worker){
        var path = dir + '/worker.' + worker.id + '.pid';
        // worker.pid for node 0.6.x, worker.proc.pid for 0.4.x and below
        var pid = worker.pid || worker.proc.pid;
        fs.writeFile(path, pid.toString(), 'ascii', function(err){
          if (err) throw err;
          master.emit('worker pidfile');
        });
      });

      master.on('listening', function(){
        // save master pid
        fs.writeFile(dir + '/master.pid', process.pid.toString(), 'ascii', function(err){
          if (err) throw err; 
          master.emit('pidfile');
        });
      });

  }
};