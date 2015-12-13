'use strict';
var jsonfile = require('jsonfile'),
    pubsub = require('./pubsub'),
    exec = require('child_process').exec,
    child;

var PluginManager = function(frame_controller, pubsub) {
    this.frame_controller = frame_controller;
    this.pubsub = pubsub;
};

PluginManager.prototype.addNpmDependency = function(package_name, version) {
    var package_file = './package.json';

    jsonfile.readFile(package_file, function(err, obj) {
        if (err) {
            console.error(err);
        }
        obj.dependencies = obj.dependencies || {};
        obj.dependencies[package_name] = version;

        jsonfile.writeFile(package_file, obj, {
            spaces: 2
        }, function(err) {
            console.error(err);
            if (err) {
                return;
            }
        });
    });
};

/**
 * Installs the npm dependencies via npm install.
 *
 * TODO: maybe reload the application? or at least run initPlugins?
 * @param  {[type]} package_name [description]
 */
PluginManager.prototype.installNpmDependencies = function(package_name, version) {
    package_name = package_name || '';
    version = version || '';
    var npmPackage = (package_name ? ' "' + package_name : '') + (version ? ':' + version + '"' : '');
    if (npmPackage !== '') {
        npmPackage += ' --save';
        // addNpmDependency(package_name, version);
    }
    var command = 'npm install' + npmPackage;

    // TODO: exec this through process manager?
    child = exec(command,
        function(error, stdout, stderr) {
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if (error !== null) {
                console.log('exec error: ' + error);
            }
        });

    if (child.stdout) {
        child.stdout.on('data', function(data) {
            console.log('stdout: ' + data);
        });
    }

    if (child.stderr) {
        child.stderr.on('data', function(data) {
            console.log('stdout: ' + data);
        });
    }

    child.on('exit', function(exit_code) {
        if (exit_code === 0) {
            pubsub.emit('plugins:installed');
        }
    });
};

// // When the frame connects, load any plugins from the plugins dir
// pubsub.on('connected', function(_socket) {
//     socket = _socket;

//     if (config('install_plugins')) {
//         console.log('loading plugins');
//         installPlugins();
//     } else {
//         initPlugins(socket, pubsub);
//     }
// });

// pubsub.on('plugins:installed', function() {
//     initPlugins(socket, pubsub);
// });


/**
 * Add the plugins listed in .ofrc to package.json.
 *
 * By default, npm install will be run at the end. To stop this,
 * pass false as the first argument.
 *
 * @param {Boolean} do_install Whether or not to run npm install. Defaults to true.
 */
PluginManager.prototype.addPluginsToDependencies = function(do_install) {
    do_install = do_install !== false;
    // load plugins file and add this thing.
    var plugins_file = './.ofrc',
        package_file = './package.json';

    // open plugins file
    jsonfile.readFile(plugins_file, function(err, plugins_obj) {
        if (err) {
            console.error(err);
            return;
        }
        var plugins = plugins_obj.plugins || {};

        // open package file, add plugins as dependencies
        jsonfile.readFile(package_file, function(err, package_obj) {
            if (err) {
                console.error(err);
            }

            // add each plugin to package.json
            for (var key in plugins) {
                if (plugins.hasOwnProperty(key)) {
                    package_obj.dependencies[key] = plugins[key];
                }
            }

            jsonfile.writeFile(package_file, package_obj, {
                spaces: 2
            }, function(err) {
                console.error(err);
                if (err) {
                    return;
                }
                // install the packages if so chosen
                if (do_install) {
                    this.installNpmDependencies();
                }
            });
        });
    });
};

/**
 * Install all of the plugins currently listed in .ofrc
 */
PluginManager.prototype.installPlugins = function() {
    this.addPluginsToDependencies();
};

/**
 * Add a plugin to the .ofrc file.
 *
 * @param  {[type]} package_name [description]
 * @param  {[type]} version      [description]
 * @return {[type]}              [description]
 */
PluginManager.prototype.addPlugin = function(package_name, version) {
    version = version || '*';

    // load plugins file and add this thing.
    var plugins_file = './.ofrc';

    jsonfile.readFile(plugins_file, function(err, obj) {
        if (err) {
            console.error(err);
            // if file doesn't exist, create it.
            // var new_obj = { plugins: {} };
            // new_obj.plugins[package_name] = version;
        }
        obj.plugins = obj.plugins || {};
        obj.plugins[package_name] = version;

        jsonfile.writeFile(plugins_file, obj, {
            spaces: 2
        }, function(err) {
            if (err) {
                console.error(err);
                return;
            }
            this.installNpmDependencies(package_name);
        });
    });
};

/**
 * Initialize all of the plugins.
 *
 * Assumes all of the plugins in .ofrc have been installed.
 *
 * @param  {Object} pubsub Access to the global pubsub system.
 */
PluginManager.prototype.initPlugins = function(pubsub) {
    console.log('initPlugins()');
    // load plugins file and add this thing.
    var plugins_file = './.ofrc';

    jsonfile.readFile(plugins_file, function(err, obj) {
        console.log(obj);
        if (err) {
            console.error(err);
            return;
        }
        obj.plugins = obj.plugins || {};

        for (var key in obj.plugins) {
            if (obj.plugins.hasOwnProperty(key)) {
                console.log('requiring ', key);
                var plugin;
                try {
                    plugin = require(key)(pubsub);
                } catch (e) {
                    console.log('The ' + key + ' plugin hasn\'nt been installed.');
                }
            }
        }
    });
};

/**
 * Check to see if a package is currently installed.
 *
 * TODO: should be we checking the node_modules dir, or
 * is checking package.json dependencies enough?
 *
 * @param  {String} package_name The name of the package
 * @param  {String} version      The version or repo path of the package
 * @return {Boolean}             True if package already installed
 */
PluginManager.prototype.checkDepInstalled = function(package_name, version) {

};

module.exports = PluginManager;
