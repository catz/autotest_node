'use strict';

var http = require('http'),
    fs = require('fs'),
    socketio = require('socket.io'),
    common = require('./common'),
    watch = require('watch'),
    jade = require('jade'),
    spawn = require('child_process').spawn;

var log_files = [];  

function createLogServer() {
  return http.createServer(function(req, res) {
    fs.readFile(__dirname + '/index.jade', function(err, data) {
      if(err) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('Internal error');
      } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        var index = jade.compile(data, {});        
        res.end(index({pageTitle: 'Log watcher'}).toString('utf-8'), 'utf-8');
      }
    })
  });
}

var server = createLogServer()
server.listen(5001);

var io = socketio.listen(server, {
  log: false
});

io.sockets.on('connection', function(socket) {
  var walk = require('walk');

  // receive list of log files
  var walker  = walk.walk(common.NODES_PATH, { followLinks: false });
  walker.on('file', function(root, stat, next) {
    if(/log$/.test(stat.name)) {
      var file_name = common.removeRoot(root + '/' + stat.name);
      var idx = log_files.indexOf(file_name);
      if (idx < 0) {
        log_files.push(file_name);

        // send initial data portion
        var tail = spawn('tail', ['-n', 20].concat(common.NODES_PATH + '/' + file_name));
        tail.stdout.on('data', function(data) {
          console.log('emit starting ' + file_name + ':lines' + ' with ' + data.toString('utf-8'));
          io.sockets.emit(file_name + ':lines', data.toString('utf-8').split('\n'));
        });

        watchFile(file_name);
      }
    }
      
    next();
  });

  walker.on('end', function() {
    socket.emit('log_files_add', log_files);
  });    
})

watch.createMonitor(common.NODES_PATH, function (monitor) {
  monitor.on("created", function (f, stat) {
    var file_name = common.removeRoot(f); 
    console.log(file_name + ' created');
    var idx = log_files.indexOf(file_name);
    if (idx < 0) {
      log_files.push(file_name);
      io.sockets.emit('log_files_add', [file_name]);
      watchFile(file_name);
    }
  })
  monitor.on("removed", function (f, stat) {
    var file_name = common.removeRoot(f); 
    console.log(file_name + ' removed');
    console.log(log_files);
    var idx = log_files.indexOf(file_name);
    console.log(idx);
    if (idx >= 0) {
      log_files.splice(idx, 1);
      io.sockets.emit('log_files_remove', [file_name]);
      unwatchFile(file_name);
    }
  })
})

var watching_processes = {};

// send incoming data
function watchFile(file) {
  console.log('start watching: ' + file);
  var tail = spawn('tail', ['-f'].concat(common.NODES_PATH + '/' + file));
  watching_processes[file] = tail;
  tail.stdout.on('data', function(data) {
    console.log('emit ' + file + ':lines' + ' with ' + data.toString('utf-8'));
    io.sockets.emit(file + ':lines', data.toString('utf-8').split('\n'));
  })
}

function unwatchFile(file) {
   console.log('end watching: ' + file);
   var process = watching_processes[file];
   process.kill();
   watching_processes[file] = null;
}
