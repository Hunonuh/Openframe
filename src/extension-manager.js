var debug = require('debug')('openframe:extensions_manager'),
    execFile = require('child_process').execFile,
    exec = require('child_process').exec,

    config = require('./config'),

    pm = module.exports = {};

/**
 * Initialize extensionss module
 *
 * TODO: UNUSED - delete me?
 *
 * @param  {Object} ofrc config object
 */
pm.init = function() {
    debug('init');
};

/**
 * Install extensionss.
 *
 * TODO: since we're just running npm cli via exec(), and reason not to install
 * all extensionss at once instead of one at a time?
 *
 * @param {object} extensionss A hash of extensionss to install
 * @param {Boolean} force Install the extensions even if it's already installed (skip the check)
 * @return {Promise} A promise resolved with all of the npmi results for each extensions
 */
pm.installExtensions = function(extensionss, force) {
    debug('installExtensions');

    var promises = [],
        key,
        _force = force === true ? true : false;

    // install each extensions
    for (key in extensionss) {
        if (extensionss.hasOwnProperty(key)) {
            promises.push(_installExtension(key, extensionss[key], _force));
        }
    }

    return Promise.all(promises);
};

/**
 * Add a new extensions to this frame.
 *
 * Installs the extensions, and if that's successful then adds it to the extensionss list.
 *
 * TODO: deal with conflicting versions of extensionss
 *
 * @param  {String} package_name NPM package name
 * @param  {String} version      NPM package version (or repo URL for extensionss not in NPM)
 * @return {Promise} A promise resolving with the result from npmi
 */
pm.addExtension = function(package_name, version) {
    debug('addExtension', package_name, version);
    return new Promise((resolve, reject) => {
        pm.installExtension(package_name, version)
            .then(function() {
                pm.extensionss[package_name] = version;
                config.save();
                resolve(package_name);
            })
            .catch(function(err) {
                debug(err);
                reject(err);
            });
    });
};

/**
 * Initialize extensionss.
 *
 * @param  {String} extensions
 * @param  {Object} ofExtensionApi An interface to the frame provided to each extensions
 */
pm.initExtensions = function(extensionss, ofExtensionApi) {
    debug('initExtensions', extensionss);
    var promises = [],
        key;

    return new Promise((resolve, reject) => {
        // add each extensions to package.json
        for (key in extensionss) {
            if (extensionss.hasOwnProperty(key)) {
                promises.push(_initExtension(key, ofExtensionApi));
            }
        }

        Promise.all(promises)
            .then(resolve)
            .catch(resolve);
    });
};

/**
 * Install a single extensions via NPM
 *
 * Uses machine's npm as a child_process so that we don't have to depend on the npm package.
 *
 * @private
 *
 * @param  {String} package_name NPM package name
 * @param  {String} version      NPM package version (or repo URL for extensionss not in NPM)
 * @param {Boolean} force Install the extensions even if it's already installed (skip the check)
 * @return {Promise} A promise resolving with the package_name
 */
function _installExtension(package_name, version, force) {
    debug('installExtension', package_name, version);
    var cmd = 'npm install -g ' + package_name;
    if (version) {
        cmd += '@'+version;
    }
    cmd += ' --save';
    return new Promise((resolve, reject) => {
        if (force) {
            _runNpmCommand(cmd).then(function() {
                resolve(package_name);
            });
        } else {
            _checkExtension(package_name, version).then(function(is_installed) {
                if (!is_installed) {
                    // only install if it's not already installed.
                    _runNpmCommand(cmd).then(function() {
                        resolve(package_name);
                    }).catch(function(err) {
                        debug('Could not install', package_name, version);
                        reject(err);
                    });
                } else {
                    // otherwise just resolve
                    resolve(package_name);
                }
            });
        }
    });
}

// public exposure
pm.installExtension = _installExtension;

/**
 * Removes a single extensions by removing it from the npm package.
 *
 * @param  {String} package_name NPM package name
 * @return {Promise} A promise resolving with the package_name
 */
function _removeExtension(package_name) {
    debug('removeExtension', package_name);
    var cmd = 'npm remove -g ' + package_name;
    cmd += ' --save';
    return new Promise((resolve, reject) => {
        _runNpmCommand(cmd).then(function() {
            resolve(package_name);
        }).catch(reject);
    });
}

// public exposure
pm.uninstallExtension = _removeExtension;

/**
 * Check whether a extension is already installed.
 *
 * @param  {String} package_name NPM package name
 * @param  {String} version      NPM package version (or repo URL for extensionss not in NPM)
 * @return {Promise} A promise resolving with either true (extensions installed) or false (extensions not installed)
 */
function _checkExtension(package_name, version) {
    debug('checkExtension', package_name, version);
    var cmd = 'npm list -g ' + package_name;
    if (version) {
        cmd += '@'+version;
    }
    return new Promise((resolve, reject) => {
        _runNpmCommand(cmd)
            .then(function() {
                debug('extensions installed');
                resolve(true);
            }).catch(function() {
                debug('extensions NOT installed');
                resolve(false);
            });
    });
}

/**
 * Initialize a single extensions.
 *
 * If the extensions has an install.sh file, execute it. Then call the extensions's init method
 * passing in a reference to the frame controller.
 *
 * TODO: initialize extensionss with sandboxed API?
 * - addFormat
 * - installDeps (?)
 *
 * TODO: should install.sh execute as part of NPM install?
 *
 * @private
 *
 * @param  {String} extensions_name
 * @param  {Object} ofExtensionApi An interface to the frame provided to each extensions
 * @return {Promise}
 */
function _initExtension(extensions_name, ofExtensionApi) {
    debug('_initExtension', extensions_name);
    var extensions;
    return new Promise((resolve, reject) => {
        try {
            extensions = require(extensions_name);
            extensions._init(ofExtensionApi);
            resolve(extensions);
        } catch (e) {
            // problem trying to require extensions
            debug('ERROR - ', e);
            reject(e);
        }
    });
}



function _runNpmCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            debug(`stdout: ${stdout}`);
            debug(`stderr: ${err}`);
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}
