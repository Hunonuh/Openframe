#! /usr/bin/env node

var program = require('commander'),
    inquirer = require('inquirer'),
    debug = require('debug')('openframe:cli'),
    p = require('../package.json'),
    version = p.version.split('.').shift(),
    config = require('../src/config'),
    frame = require('../src/frame'),
    user = require('../src/user'),
    rest = require('../src/rest'),
    frame_controller = require('../src/controller'),
    pexec = require('../src/process-manager').pexec,
    initializers;

program
    .version(version)
    .option('-r, --reset', 'Reset this frame. Erases current frame data, and registers this as a new frame.')
    .option('-i, --install [extension]', 'Install an extension. The argument should be in the npm package name format, e.g. "openframe-image" or "openframe-image@^0.1.0"')
    .option('-u, --uninstall [extension]', 'Uninstall an extension. The argument should be the npm package name, e.g. "openframe-image"')
    .arguments('[username] [password] [framename]')
    .parse(process.argv);

// load config, frame, and user from local dot files
initializers = [
    checkForUpdates(),
    config.load(),
    frame.load(),
    user.load()
];

Promise.all(initializers)
    .then(rest.init)
    .then(function() {
        debug(config.ofrc);
        debug(frame.state);
        debug(user.state);

        if (program.reset) {
            reset()
                .then(processArgs)
                .catch(debug);
        } else {
            processArgs();
        }

    }).catch(function(err) {
        debug(err);
    });


function processArgs() {
    debug('processArgs');
    // if username was passed, set it
    user.state.username = program.username || user.state.username;
    // if password was passed, set it
    user.state.password = program.password || user.state.password;
    // if framename passed, set it
    frame.state.name = program.framename || frame.state.name;

    debug(user.state, frame.state);

    var questions = [];

    if (!user.state.username) {
        // ask for user
        questions.push({
            name: 'username',
            message: 'Enter your Openframe username:'
        });
    }

    if (!user.state.password) {
        // ask for pass
        questions.push({
            name: 'password',
            type: 'password',
            message: 'Enter your Openframe password:'
        });
    }

    if (!frame.state.name) {
        // ask frame name
        questions.push({
            name: 'frame_name',
            message: 'Enter a name for this Frame:'
        });
    }

    if (questions.length) {
        inquirer.prompt(questions, function(answers) {
            saveAnswers(answers)
                .then(init);
        });
    } else {
        init();
    }
}

/**
 * Reset the frame. This means:
 * - delete current frame state
 * - delete current user state
 *
 * @return {Promise} A promise resolving when the user and frame have been reset
 */
function reset() {
    debug('Reseting frame.');
    return new Promise(function(resolve, reject) {
        user.state = {};
        frame.state = {};
        user.save()
            .then(frame.persistStateToFile)
            .then(resolve)
            .catch(reject);
    });
}

/**
 * Save the answers from the prompt to .ofrc file.
 * @param  {Object} answers
 * @return {Promise}
 */
function saveAnswers(answers) {
    if (answers) {
        if (answers.username) {
            user.state.username = answers.username;
        }
        if (answers.password) {
            user.state.password = answers.password;
        }
        if (answers.frame_name) {
            frame.state.name = answers.frame_name;
        }
    }

    return user.save();
}

function checkForUpdates() {
    debug('checkForUpdates');
    var cmd = 'npm outdated -g openframe';
    // var cmd = 'npm outdated -g openframe openframe-image openframe-website openframe-glslviewer';
    return pexec(cmd).then(function(result) {
        if (result[1]) {
            console.log('\n');
            console.log('=============================================================================');
            console.log('=============================================================================');
            console.log('\n');
            console.log('      NOTICE: There is a new version of openframe available! To update, run: ');
            console.log('\n');
            console.log('      > npm install -g openframe');
            console.log('\n');
            console.log('=============================================================================');
            console.log('=============================================================================');
        }
    });
}

/**
 * Start up the frame
 */
function init() {
    debug('Initializing Frame Controller');

    // if we've gotten here, presumably we have a user/pass
    if (program.install) {
        console.log('\n');
        console.log('[o]   Installing ' + program.install + ' extension...');
        console.log('\n');
        frame_controller.installPlugin(program.install);
    } else if (program.uninstall) {
        console.log('\n');
        console.log('[o]   Uninstalling ' + program.uninstall + ' extension...');
        console.log('\n');
        frame_controller.uninstallPlugin(program.uninstall);
    } else {
        frame_controller.init();
    }
}

