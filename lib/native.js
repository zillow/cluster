
/*!
 * Clustered - Native
 * Copyright(c) 2012 Daniel Stockman <daniel.stockman@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */
var cluster = require('cluster'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    path = require('path'),
    os = require('os');

/**
 * Native Master
 */
var Master = module.exports = function Master(server) {
    var self = this;
    this.server = server;
    this.plugins = [];
    this.children = [];
    this.state = 'active';
    this.startup = new Date();
    this._killed = 0;

    // grab server root
    this.cmd = process.argv.slice(1);
    this.dir = path.dirname(this.cmd[0]);

    // environment
    this.env = process.env.NODE_ENV || 'development';

    // defaults
    this.options = {
        'backlog': 128,
        'working directory': this.dir,
        'socket port': 8989,
        'socket addr': '127.0.0.1',
        'timeout': 60000,
        'restart threshold': 'development' == this.env ? 5000 : 60000,
        'restart timeout': 'development' == this.env ? 5000 : 60000,
        'title': 'cluster',
        'worker title': 'cluster worker'
    };

    // process is a worker
    this.isWorker = cluster.isWorker;

    // process is a child
    this.isChild = this.isWorker;

    // process is master
    this.isMaster = cluster.isMaster;

    // process id
    this.pid = process.pid;

    // resolve server filename
    if (this.isWorker && 'string' == typeof this.server) {
        this.server = require(this.resolve(this.server));
    }

    // IPC is prepped
    this.on('start', function () {
        process.chdir(self.options['working directory']);
    });

    if (this.isMaster) {
        // spawn our workers
        this.on('start', function () {
            // console.log('spawning workers from master');
            var numWorkers = self.options.workers,
                numConnected = 0;

            self.on('worker connected', function (worker) {
                // console.log('worker connected fired', worker.id);
                if (++numConnected === numWorkers) {
                    // console.log('all workers connected, firing "listening" event');
                    self.emit('listening');
                    self.listening = true;
                }
            });

            self.spawn(numWorkers);
        });

        cluster.on('death', this.workerKilled.bind(this));

        // kill children on master exception
        process.on('uncaughtException', function (err) {
            self.kill('SIGKILL');
            console.error(err.stack || String(err));
            process.exit(1);
        });
    }
};

/**
 * Inherit from `EventEmitter`.
 */
util.inherits(Master, EventEmitter);

/**
 * Return `true` when the environment set by `Master#in()`
 * matches __NODE_ENV__.
 *
 * @return {Boolean}
 * @api private
 */
Master.prototype.__defineGetter__('environmentMatches', function () {
    if (this._env) {
        return this.env == this._env || 'all' == this._env;
    }
    return true;
});

/**
 * Conditionally perform the following action, if
 * __NODE_ENV__ matches `env`.
 *
 * Examples:
 *
 *      cluster(server)
 *        .in('development').use(cluster.debug())
 *        .in('development').listen(3000)
 *        .in('production').listen(80);
 *
 * @param {String} env
 * @return {Master} self or stubs
 * @api public
 */
Master.prototype['in'] = function (env) {
    this._env = env;
    return this;
};

/**
 * Set option `key` to `val`.
 *
 * @param {String} key
 * @param {Mixed} val
 * @return {Master} for chaining
 * @api public
 */
Master.prototype.set = function (key, val) {
    if (this.environmentMatches) {
        this.options[key] = val;
    }
    return this;
};

/**
 * Invoke `fn(master)`.
 *
 * @param {Function} fn
 * @api public
 */
Master.prototype['do'] = function (fn) {
    if (this.environmentMatches) {
        fn.call(this, this);
    }
    return this;
};

/**
 * Check if `option` has been set.
 *
 * @param {String} option
 * @return {Boolean}
 * @api public
 */
Master.prototype.has = function (option) {
    return !!this.options[option];
};

/**
 * Use the given `plugin`.
 *
 * @param {Function} plugin
 * @return {Master} for chaining
 * @api public
 */
Master.prototype.use = function (plugin) {
    if (this.environmentMatches) {
        this.plugins.push(plugin);
        if (this.isWorker && plugin.enableInWorker) {
            plugin(this);
        } else {
            plugin(this);
        }
    }
    return this;
};

/**
 * Perform setup tasks then invoke `fn()` when present.
 *
 * @param {Function} fn
 * @return {Master} for chaining
 * @api public
 */
Master.prototype.start = function (fn) {
    var self = this;

    // deferred title
    process.title = this.options.title;

    // prevent listen
    if (this.preventDefault) {
        return this;
    }

    // env match
    if (this.environmentMatches) {
        // worker process
        if (this.isWorker) {
            // console.log('worker ' + this.pid + ' delayed start');
            // this.worker = new Worker(this);
            // this.worker.start();

            // timeout
            this.timeout = this.options.timeout;

            // title
            // process.title = this.options['worker title'].replace('{n}', id);

            // signal handlers
            process.on('SIGINT',  this.destroy.bind(this));
            process.on('SIGTERM', this.destroy.bind(this));
            process.on('SIGQUIT', this.close.bind(this));

            this.server.listen(this.port, this.host, function () {
                process.send({
                    cmd: 'connected',
                    args: [self.options]
                });
                // console.log('sent "connected" message from worker ('+ self.pid +')');
            });

            // conditionally handle uncaughtException
            process.nextTick(function () {
                if (!process.listeners('uncaughtException').length) {
                    process.on('uncaughtException', function (err) {
                        // stderr for logs
                        console.error(err.stack || err.message);

                        // report exception
                        process.send({
                            cmd: 'workerException',
                            args: [err]
                        })

                        // exit
                        process.nextTick(function () {
                            self.destroy();
                        });
                    });
                }
            });
        // master process
        } else if (fn) {
            fn();
        // standalone
        } else {
            this.on('start', function () {
                self.emit('listening');
            });
            if (this.isChild) {
                // this.acceptFd();
                console.error('TODO: acceptFd replacement');
            }
            // this.setupIPC();
            console.error('TODO: setupIPC replacement');
        }
    }

    return this;
};

/**
 * Defer `http.Server#listen()` call.
 *
 * @param {Number|String} port or unix domain socket path
 * @param {String|Function} host or callback
 * @param {Function} callback
 * @return {Master} for chaining
 * @api public
 */
Master.prototype.listen = function (port, host, callback) {
    // console.log('listen() called from ' + (this.isMaster ? 'master' : 'worker'));
    var self = this;
    if (!this.environmentMatches) {
        return this;
    }
    if ('function' == typeof host) {
        callback = host;
        host = null;
    }
    this.port = port;
    this.host = host;
    this.callback = callback;

    return this.start(function () {
        self.on('start', function () {
            if (self.callback) {
                self.callback();
            }
            // self.emit('listening');
        });

        // signal handlers
        self.registerSignalHandlers();

        // Default worker to the # of cpus
        self.defaultWorkers();

        process.nextTick(function () {
            self.emit('start');
        });
    });
};

/**
 * Resolve `path` relative to the server file being executed.
 *
 * @param {String} path
 * @return {String}
 * @api public
 */
Master.prototype.resolve = function (path) {
    return '/' == path[0] ? path : this.dir + '/' + path;
};

/**
 * Restart workers only, sending `signal` defaulting
 * to __SIGQUIT__.
 *
 * @param {Type} name
 * @return {Type}
 * @api public
 */
Master.prototype.restartWorkers = function (signal) {
    this.kill(signal || 'SIGQUIT');
};

/**
 * Remove `n` workers with `signal`
 * defaulting to __SIGQUIT__.
 *
 * @param {Number} n
 * @param {String} signal
 * @api public
 */

Master.prototype.remove = function (n, signal) {
    if (!arguments.length) {
        n = 1;
    }
    var len = this.children.length,
        worker;

    // cap at worker len
    if (n > len) {
        n = len;
    }

    // remove the workers
    while (n--) {
        worker = this.children.pop();
        worker.kill(signal || 'SIGQUIT');
        this.emit('worker removed', worker);
        this.removeWorker(worker.id);
    }
};

/**
 * Remove worker `id`.
 *
 * @param {Number} id
 * @api public
 */

Master.prototype.removeWorker = function (id) {
    var worker = this.children[id];
    if (!worker) {
        return;
    };
    delete this.children[id];
};

/**
 * Spawn `n` workers.
 *
 * @param {Number} n
 * @api public
 */

Master.prototype.spawn = function (n) {
    if (!arguments.length) {
        n = 1;
    }

    while (n--) {
        this.spawnWorker();
    }
};

/**
 * Graceful shutdown, wait for all workers
 * to reply before exiting.
 *
 * @api public
 */
Master.prototype.close = function () {
    if (this.isMaster) {
        this.state = 'graceful shutdown';
        this.emit('closing');
        this.kill('SIGQUIT');
        this.pendingDeaths = this.children.length;
    }
    else {
        var self = this,
            server = this.server;

        if (server && server.connections) {
            server.on('close', this.destroy.bind(this));

            // stop accepting
            server.close();

            // check pending connections
            /*
            setInterval(function () {
                process.send({
                    cmd: 'workerWaiting',
                    args: [server.connections]
                });
                server.connections || self.destroy();
            }, 2000);
            */

            // timeout
            if (this.timeout) {
                setTimeout(function () {
                    process.send({
                        cmd: 'workerTimeout',
                        args: [self.timeout]
                    });
                    self.destroy();
                }, this.timeout);
            }
        } else {
            this.destroy();
        }
    }
};

/**
 * Hard shutdown, immediately kill all workers.
 *
 * @api public
 */
Master.prototype.destroy = function () {
    if (this.isMaster) {
        this.state = 'hard shutdown';
        this.emit('closing');
        this.kill('SIGKILL');
        this._destroy();
    }
    else {
        // console.log('destroying worker', this.pid);
        this.emit('close');
        process.nextTick(process.exit);
    }
};

/**
 * Send `sig` to all worker processes, defaults to __SIGTERM__.
 *
 * @param {String} sig
 * @api public
 */
Master.prototype.kill = function (sig) {
    this.emit('kill', sig);
    this.children.forEach(function (worker) {
        worker.kill(sig);
    });
};

/**
 * Maintain worker count, re-spawning if necessary.
 *
 * @api private
 */
/*
Master.prototype.maintainWorkerCount = function () {
    this.children.forEach(function (worker) {
        var pid = worker.proc.pid;
        if (!pid) {
            this.workerKilled(worker);
        }
    }, this);
};
*/

/**
 * Register signal handlers.
 *
 * @api private
 */
Master.prototype.registerSignalHandlers = function () {
    process.on('SIGINT',  this.destroy.bind(this));
    process.on('SIGTERM', this.destroy.bind(this));
    process.on('SIGQUIT', this.close.bind(this));
    // process.on('SIGUSR2', this.attemptRestart.bind(this));
    // process.on('SIGCHLD', this.maintainWorkerCount.bind(this));
};

/**
 * Default workers to the number of cpus available.
 *
 * @api private
 */
Master.prototype.defaultWorkers = function () {
    if (!this.has('workers')) {
        this.set('workers', os ? os.cpus().length : 1);
    }
};

/**
 * Spawn a worker with optional `id`.
 *
 * @param {Number} id
 * @return {Worker}
 * @api private
 */

Master.prototype.spawnWorker = function (id) {
    var worker = cluster.fork();
    // console.log('spawnWorker', worker.pid);

    // id given
    if ('number' === typeof id) {
        this.children[id] = worker;
    // generate an id
    } else {
        id = this.children.length;
        this.children.push(worker);
    }

    worker.id = id;

    worker.on('message', this.onWorkerMessage.bind(this, worker));

    // emit
    this.emit('worker', worker);

    return worker;
};

Master.prototype.onWorkerMessage = function (worker, obj) {
    if ('number' === typeof worker) {
        worker = this.children[worker];
    }
    this.invoke(obj.cmd, obj.args, worker);
};

/**
 * Invoke `cmd` with the given `args`.
 *
 * @param {String} cmd
 * @param {Mixed} args
 * @param {Worker} worker
 * @api private
 */
Master.prototype.invoke = function (cmd, args, worker) {
    // avoid queryServer command
    if (!cmd || cmd === 'queryServer') {
        return;
    }
    if (!Array.isArray(args)) {
        args = [args];
    }
    if (worker) {
        args.unshift(worker);
    }
    if (!this[cmd]) {
        throw new Error('method ' + cmd + '() does not exist');
    }

    this[cmd].apply(this, args);
};

/**
 * Close servers and emit 'close' before exiting.
 *
 * @api private
 */
Master.prototype._destroy = function () {
    this.emit('close');
    process.nextTick(process.exit.bind(process));
};

/**
 * Worker is connected.
 *
 * @param {Worker} worker
 * @api private
 */
Master.prototype.connected = function (worker) {
    // console.log('fired worker connected', worker.id);
    this.emit('worker connected', worker);
};

/**
 * Worker is online.
 *
 * @param {Worker} worker
 * @api private
 */
Master.prototype.online = function (worker) {
    // console.log('fired worker online', worker.id);
    this.emit('worker online', worker);
};

/**
 * The given `worker` has been killed.
 * Emit the "worker killed" event, remove
 * the worker, and re-spawn depending on
 * the master state.
 *
 * @api private
 */

Master.prototype.workerKilled = function (worker) {
    // if we have many failing workers at boot
    // then we likely have a serious issue.
    if (new Date() - this.startup < 20000) {
        if (++this._killed == 20) {
            console.error('');
            console.error('Cluster detected over 20 worker deaths in the first');
            console.error('20 seconds of life, there is most likely');
            console.error('a serious issue with your server.');
            console.error('');
            console.error('aborting.');
            console.error('');
            process.exit(1);
        }
    }

    // emit event
    this.emit('worker killed', worker);

    // always remove worker
    this.removeWorker(worker.id);

    // state specifics
    switch (this.state) {
    case 'hard shutdown':
        break;
    case 'graceful shutdown':
        if (--this.pendingDeaths === 0) {
            this._destroy();
        }
        break;
    default:
        this.spawnWorker(worker.id);
    }
};

/**
 * `worker` received exception `err`.
 *
 * @api private
 */
Master.prototype.workerException = function (worker, err) {
    this.emit('worker exception', worker, err);
};

/**
 * Received worker timeout.
 *
 * @api private
 */
Master.prototype.workerTimeout = function (worker, timeout) {
    this.emit('worker timeout', worker, timeout);
};

/**
 * Worker waiting on `connections` to close.
 *
 * @api private
 */
Master.prototype.workerWaiting = function (worker, connections) {
    this.emit('worker waiting', worker, connections);
};
