'use strict';

/**
 * Starts, stops, and tracks child processes. Used to open artworks with their specified container apps.
 */

// spawn would be necessary if we wanted to exchange data with child process (maybe for live coding?)
var spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    psTree = require('ps-tree');

// module members
var processes = {},
    processStack = [];


/**
 * Kick off a new child process
 * @param  {String} command The command to execute.
 */
function startProcess(command) {
    console.log('startProcess: ', command);
    var command_ary = command.split(' ');
    var command_bin = command_ary[0];
    var command_args = command_ary.slice(1);
    var child = spawn(command_bin, command_args, {detached: true});
    _setupChildProcessEvents(child);
    processes[child.pid] = child;
    processStack.push(child.pid);
    console.log('processes: ', processes);
    console.log('processStack: ', processStack);
}

/**
 * Kill a child process
 * @param  {Number} pid The process id of the process to kill.
 */
function killProcess(pid) {
    console.log('killProcess: ', pid);
    // processes[pid].kill();
    // _killAllDescendents(pid);
    try {
	process.kill(-pid);
    } catch(e) {
	console.log(e);
    }
    delete processes[pid];
    var stack_idx = processStack.indexOf(pid);
    if (stack_idx !== -1) {
        processStack.splice(stack_idx, 1);
    }
}

/**
 * Execute the kill command.
 * @param  {[type]} command [description]
 * @return {[type]}         [description]
 */
function killCommand(command) {
    console.log('killCommand: ', command);
    exec(command, function(err, stdout, stderr) {
        if (err) {
            console.log(err);
        }
    });
}

/**
 * light wrapper on exec, outputting errors.
 * @param  {String} command
 */
function _exec(command) {
    console.log('exec: ', command);
    exec(command, function(err, stdout, stderr) {
        if (err) {
            console.log(err);
        }
    });
}

/**
 * Kill the currently running process (top of the stack)
 */
function killCurrentProcess() {
    console.log('killCurrentProcess');
    var cur_proc = getCurrentProcess();
    if (cur_proc) {
        killProcess(cur_proc);
    }
}

/**
 * Get the current process id (top of the stack);
 * @return {Number} pid
 */
function getCurrentProcess() {
    if (processStack.length) {
        return processStack[0];
    } else {
        return null;
    }
}

/**
 * Attach event handlers to the child processes.
 * @param  {Process} child
 */
function _setupChildProcessEvents(child) {
    child.stdout.on('data', function(data) {
        console.log('stdout: ' + data);
    });

    child.stderr.on('data', function(data) {
        console.log('stdout: ' + data);
    });

    child.on('close', function(code) {
        console.log('child ' + child.pid + ' closing code: ' + code);
    });
}

/**
 * Kill process and all its children.
 * @param  {Number}   pid      [description]
 * @param  {String}   signal   [description]
 * @param  {Function} callback [description]
 */
function _killAllDescendents(pid, signal, callback) {
    console.log('_killAllDescendents: ', pid);
    signal = signal || 'SIGKILL';
    callback = callback || function() {};
    var killTree = true;
    if (killTree) {
        psTree(pid, function(err, children) {
            [pid].concat(
                children.map(function(p) {
                    return p.PID;
                })
            ).forEach(function(tpid) {
                try {
                    process.kill(tpid, signal);
                } catch (ex) {}
            });
            callback();
        });
    } else {
        try {
            process.kill(pid, signal);
        } catch (ex) {}
        callback();
    }
}

exports.exec = _exec;
exports.startProcess = startProcess;
exports.killProcess = killProcess;
exports.killCurrentProcess = killCurrentProcess;
exports.stack = processStack;
