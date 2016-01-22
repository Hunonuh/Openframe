'use strict';

/**
 * The main controller for the frame.
 */

// app dependencies
var util = require('util'),
    debug = require('debug')('frame_controller'),
    EventEmitter = require('events').EventEmitter,
    Swagger = require('swagger-client');

var downloader = require('./downloader'),
    pubsub = require('./pubsub'),
    url = require('url'),
    path = require('path'),
    proc_man = require('./process-manager'),
    pm = require('./plugin-manager'),
    config = require('./config');

// set all downloads to go to the correct spot
// downloader.setDownloadDir(config('download_dir'));


var fc = module.exports = {};

// inherit from EventEmitter
util.inherits(fc, EventEmitter);

/**
 * Initialize the frame controller
 * - generate Swagger client
 * - login user
 * - connect frame
 * TODO:
 * - load plugins
 */
fc.init = function() {
    debug('init');

    this.config = config;

    var settings = config.ofrc.settings,
        api_url = settings.api_protocol + '://' + settings.api_domain + ':' + settings.api_port;

    this.buildRestClient(api_url)
        .then(this.login)
        .then(this.connect)
        .then(this.ready)
        .catch(function(err) {
            debug(err);
        });
};

/**
 * Called when the frame has finished initializing.
 */
fc.ready = function() {
    debug('ready', fc.config.ofrc.frame);
    var frame = fc.config.ofrc.frame;

    if (frame && frame._current_artwork) {
        fc.changeArtwork();
    }
};

/**
 * Auto-generates a semantic client for the REST API based
 * on the swagger definition.
 *
 * A reference to the client is stored on the frame controller as
 * `fc.client`
 *
 * @param  {String} api_url
 * @return {Promise} A promise resolving with the generated client.
 */
fc.buildRestClient = function(api_url) {
    debug('buildRestClient');

    return new Promise(function(resolve, reject) {
        new Swagger({
            url: api_url + '/explorer/swagger.json',
            usePromise: true
        }).then(function(client) {
            // To see all available methods:
            // debug(client);
            fc.client = client;
            resolve(client);
        }).catch(function(err) {
            reject(err);
        });
    });
};

/**
 * Authenticate to the API server using the supplied user/pass.
 *
 * @param  {Swagger} client Auto-generated swagger client
 * @return {Promise} A promise resolving with the logged-in user's ID
 */
fc.login = function(client) {
    debug('login');

    var creds = fc.config.ofrc.auth;
    return new Promise(function(resolve, reject) {
        client.OpenframeUser.OpenframeUser_login({
                credentials: creds
            })
            .then(function(resp) {
                if (resp.obj.id) {
                    creds.access_token = resp.obj.id;
                    client.clientAuthorizations.add('access_token', new Swagger.ApiKeyAuthorization('access_token', resp.obj.id, 'query'));
                }
                resolve(resp.obj.userId);
            })
            .catch(function(err) {
                console.log('err', err);
                reject(err);
            });
    });
};

/**
 * Connect this Frame. If the Frame has not yet been created, i.e. there is no
 * id on the Frame object in ofrc, create a new Frame.
 *
 * @param  {String} userId
 * @return {Promise}
 */
fc.connect = function(userId) {
    debug('connect', userId);

    return new Promise(function(resolve, reject) {
        // called when frame is ready to connect
        function readyToConnect() {
            fc.pubsub = pubsub.init(fc);
            resolve();
        }

        // do we already have an id? if so pull latest state

        fc.updateFrame()
            .then(readyToConnect)
            .catch(function(err) {
                debug(err);
                // In case of 404, we can capture here...
                // var code = err.errObj.response.statusCode;

                // the Frame is either not stored locally, or is missing
                // on the server.
                fc.registerNewFrame(userId)
                    .then(readyToConnect)
                    .catch(reject);
            });
    });
};

/**
 * Grab and store the latest Frame state from the server.
 *
 * @return {Promise}
 */
fc.updateFrame = function() {
    debug('updateFrame');

    var frame = fc.config.ofrc.frame;

    return new Promise(function(resolve, reject) {
        if (frame && frame.id) {
            // a frame with an ID is present
            fc.client.Frame.Frame_findById({
                    id: frame.id
                })
                .then(function(data) {
                    debug('Frame_findById - found', data);
                    var frame = data.obj;
                    fc.config.ofrc.frame = frame;
                    fc.config.save();
                    fc.updatePlugins(frame)
                        .then(function() {
                            resolve(frame);
                        });
                })
                .catch(reject);
        } else {
            reject();
        }
    });
};

/**
 * Use the plugin manager module to update the plugins based on the current frame state.
 *
 * TODO: how to know which plugins to remove?
 *
 * @param  {[type]} frame [description]
 * @return {[type]}       [description]
 */
fc.updatePlugins = function(frame) {
    debug('updatePlugins');
    return new Promise(function(resolve, reject) {
        pm.installPlugins(frame.plugins)
            .then(function() {
                fc.initPlugins(frame.plugins);
            })
            .then(function() {
                debug('Success initializing plugins');
                resolve();
            })
            .catch(reject);
    });
};

fc.initPlugins = function(plugins) {
    debug('initPlugins', plugins);
    return new Promise(function(resolve, reject) {
        pm.initPlugins(plugins, fc)
            .then(resolve)
            .catch(reject);
    });
};

/**
 * Register this as a new frame for user [userId]. This creates a new
 * Frame object on the server via the REST api.
 *
 * @param  {String} userId
 * @return {Promise} A promise resolving with the newly created Frame object
 */
fc.registerNewFrame = function(userId) {
    debug('registerNewFrame', userId);

    var frame = fc.config.ofrc.frame;
    return new Promise(function(resolve, reject) {
        fc.client.OpenframeUser.OpenframeUser_prototype_create_frames({
                data: {
                    name: frame.name,
                    settings: {},
                    plugins: {
                        'openframe-pluginexample': 'git+https://git@github.com/OpenframeProject/Openframe-PluginExample.git'
                    }
                },
                id: userId
            })
            .then(function(data) {
                var frame = data.obj;
                fc.config.ofrc.frame = frame;
                fc.config.save();
                // update the plugins
                fc.updatePlugins(frame)
                    .then(function() {
                        resolve(frame);
                    });
            })
            .catch(reject);
    });
};

/**
 * Change the artwork being displayed to that which is stored in the
 * Frame's _current_artwork.
 */
fc.changeArtwork = function() {
    var frame = fc.config.ofrc.frame,
        artwork = frame._current_artwork,
        curArt = fc.current_artwork;

    function startArt(command) {
        if (curArt) {
            proc_man.exec(curArt._format.end_command, function() {
                proc_man.startProcess(command);
                fc.current_artwork = artwork;
            });
        } else {
            proc_man.startProcess(command);
            fc.current_artwork = artwork;
        }
    }

    if (artwork._format.download) {
        var parsed = url.parse(artwork.url),
            file_name = path.basename(parsed.pathname);

        downloader.downloadFile(artwork.url, artwork._id + file_name)
            .then(function(file) {
                var command = artwork._format.start_command + ' ' + file.path;
                startArt(command);
            });
    } else {
        var command = artwork._format.start_command + ' ' + artwork.url;
        startArt(command);
    }
};