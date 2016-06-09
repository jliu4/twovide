
var isUseHTTPs = !(!!process.env.PORT || !!process.env.IP);

var server = require(isUseHTTPs ? 'https' : 'http'),
    url = require('url'),
    path = require('path'),
    fs = require('fs');
    os = require('os');
    
function serverHandler(request, response) {
    var uri = url.parse(request.url).pathname,
        filename = path.join(process.cwd(), uri);

    var stats;

    try {
        stats = fs.lstatSync(filename);
    } catch (e) {
        response.writeHead(404, {
            'Content-Type': 'text/plain'
        });
        response.write('404 Not Found: ' + path.join('/', uri) + '\n');
        response.end();
        return;
    }
    if (fs.statSync(filename).isDirectory()) {
        response.writeHead(404, {
            'Content-Type': 'text/html'
        });

       
        if (filename.indexOf('/public/') !== -1) {
            filename = filename.replace('/public/', '');
            filename += '/public/index.html';
        } else {
            filename += '/public/index.html';
        }
    }

    fs.readFile(filename, 'binary', function(err, file) {
        if (err) {
            response.writeHead(500, {
                'Content-Type': 'text/plain'
            });
            response.write('404 Not Found: ' + path.join('/', uri) + '\n');
            response.end();
            return;
        }

        response.writeHead(200);
        response.write(file, 'binary');
        response.end();
    });

}

var app;

if (isUseHTTPs) {
    var options = {
        key: fs.readFileSync(path.join(__dirname, 'keys/server.key')),
        cert: fs.readFileSync(path.join(__dirname, 'keys/server.crt'))
    };
    app = server.createServer(options, serverHandler);
        
} else app = server.createServer(serverHandler);


app = app.listen(process.env.PORT || 9001, process.env.IP || "0.0.0.0", function() {
    var addr = app.address();
    console.log("Server listening at", addr.address + ":" + addr.port);
});

var socketIO = require('socket.io');

var io = socketIO.listen(app);

io.sockets.on('connection', function (socket) {
    // convenience function to log server messages on the client
    function log(){
        var array = [">>> Message from server:"];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }
    socket.on('message', function (data) {
        socket.broadcast.emit('message', data);
    });

    socket.on('create or join', function (room) {
        log('Request to create or join room ' + room);
        
        var clients = io.sockets.adapter.rooms[room];
        log("clients: " + clients);
        var numClients =clients!=undefined ? clients.length:0;

        log('Room ' + room + ' has ' + numClients + ' client(s)');

        if (numClients === 0){
            socket.join(room);
            socket.emit('created', room, socket.id);

        } else if (numClients < 10) {
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready');

        } else { // max two clients
            socket.emit('full', room);
        }
        socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
        socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

    });

    socket.on('ipaddr', function () {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function (details) {
                if (details.family=='IPv4' && details.address != '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
          });
        }
    });

    socket.on('disconnect', function () {
        io.emit('user disconnected');
    });

});

