/****************************************************************************
 * Initial setup
 ****************************************************************************/
'use strict';

var width = 240;
var height =240;

var iceServers = [];

iceServers.push({
    url: 'stun:stun.l.google.com:19302'
});

iceServers.push({
    url: 'stun:stun.anyfirewall.com:3478'
});

iceServers.push({
    url: 'turn:turn.bistri.com:80',
    credential: 'homeo',
    username: 'homeo'
});

iceServers.push({
    url: 'turn:turn.anyfirewall.com:443?transport=tcp',
    credential: 'webrtc',
    username: 'webrtc'
});

var config = {'iceServers': iceServers},
    roomURL = document.getElementById('url'),
    localVideo = document.getElementsByTagName('video')[0],
    remoteVideo = document.getElementsByTagName('video')[1],
    photo = document.getElementById('photo'),
    photoContext = photo.getContext('2d'),
    trail = document.getElementById('trail'),
    snapAndSendBtn = document.getElementById('snapAndSend'),
    chatFrameDocument = document.getElementById("chatbox").contentDocument;
    //text =  document.getElementById("text");

//if (text.length) {
 //   chatFrameDocument.write(text);
 //   document.getElementById("chatbox").contentWindow.scrollByPages(1);
//}



// Create a random room if not already present in the URL.
var isInitiator;
var room = window.location.hash.substring(1);
//var room = 'jinliu';
if (!room) {
   room = window.location.hash = randomToken();
    //room = 'jinliu';
}


/****************************************************************************
 * Signaling server 
 ****************************************************************************/

// Connect to the signaling server
var socket = io.connect();

socket.on('ipaddr', function (ipaddr) {
    console.log('Server IP address is: ' + ipaddr);
    updateRoomURL(ipaddr);
});

socket.on('created', function (room, clientId) {
  console.log('Created room', room, '- my client ID is', clientId);
  isInitiator = true;
  grabWebCamVideo();
});

socket.on('joined', function (room, clientId) {
  console.log('This peer has joined room', room, 'with client ID', clientId);
  isInitiator = false;
  grabWebCamVideo();
});

socket.on('full', function (room) {
    alert('Room "' + room + '" is full. We will create a new room for you.');
    window.location.hash = '';
    window.location.reload();
});

socket.on('ready', function () {
    createPeerConnection(isInitiator, config);
})

socket.on('log', function (array) {
  console.log.apply(console, array);
});

socket.on('message', function (message){
    console.log('Client received message:', message);
    signalingMessageCallback(message);
});

// Join a room
socket.emit('create or join', room);

if (location.hostname.match(/localhost|127\.0\.0/)) {
    socket.emit('ipaddr');
}

/**
 * Send message to signaling server
 */
function sendMessage(message){
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

/**
 * Updates URL on the page so that users can copy&paste it to their peers.
 */
function updateRoomURL(ipaddr) {
    var url;
    if (!ipaddr) {
        url = location.href
    } else {
        url = location.protocol + '//' + ipaddr + ':2013/#' + room
    }
    roomURL.innerHTML = url;
}


/**************************************************************************** 
 * User media (webcam) 
 ****************************************************************************/
var sdpConstraints = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1,
    voiceActivityDetection: false  
};

function grabWebCamVideo() {

    navigator.mediaDevices.getUserMedia({video: true, audio: true}).then(successCallback).catch(errorCallback);
}    
        //stream type is MediaStream
function successCallback(stream) {
    localVideo.src =  window.URL.createObjectURL(stream);
    localVideo.srcObject = stream;
    localStream = stream;
    if (localPC && localPC !=undefined ) localPC.addStream(stream);
}
        
function errorCallback(error){
    console.debug("getUserMedia error:", error);
}

var streaming = false;

localVideo.addEventListener('canplay', function(ev){
    if (!streaming) {
        height = localVideo.videoHeight / (localVideo.videoWidth/width);
      
        // Firefox currently has a bug where the height can't be read from
        // the video, so we will make assumptions if this happens.
      
        if (isNaN(height)) {
            height = width / (4/3);
        }
      
        localVideo.setAttribute('width', width);
        localVideo.setAttribute('height', height);
        photo.setAttribute('width', width);
        photo.setAttribute('height', height);
        streaming = true;
    }
}, false);

 
snapAndSendBtn.addEventListener('click', snapAndSend); 
 
/**************************************************************************** 
 * WebRTC peer connection and data channel
 ****************************************************************************/

var localStream, localPC;
var dataChannel;

function signalingMessageCallback(message) {
    if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        localPC.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
        localPC.createAnswer(onLocalSessionCreated, logError);

    } else if (message.type === 'answer') {
        console.log('Got answer.');  
        localPC.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
        
    } else if (message.type === 'candidate') {
        console.log('addCandidate');
        localPC.addIceCandidate(new RTCIceCandidate({candidate: message.candidate}));

    } else if (message === 'bye') {
        // TODO: cleanup RTC connection?
    }
}


function createPeerConnection(isInitiator, config) {
  
    console.log('Creating local Peer connection as initiator?', isInitiator, 'config:', config);
    localPC = new RTCPeerConnection(config);
    
    localPC.onicecandidate = function (event) {
        console.log('onIceCandidate event:', event);
        if (event.candidate) {
            sendMessage(event.candidate);
        } else {
            console.log('End of candidates.');
        }
    };  

    if (localPC && localPC !=undefined && localStream && localStream !=undefined) localPC.addStream(localStream);

    localPC.ontrack = onRemoteStreamAdded;

    if (isInitiator) {
        dataChannel = localPC.createDataChannel("photos", {});

        onDataChannelCreated(dataChannel);

        localPC.createOffer(onLocalSessionCreated, logError,sdpConstraints);
      
    } else {
        localPC.ondatachannel = function (event) {
            console.log('ondatachannel:', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }
           
}

function onLocalSessionCreated(desc) {
    console.log('local session created:', desc);
    localPC.setLocalDescription(desc, function () {
        console.log('sending local desc:', localPC.localDescription);
        sendMessage(localPC.localDescription);
    }, logError);
}

function onRemoteStreamAdded(event) {
    remoteVideo.setAttribute('height',height);
    remoteVideo.setAttribute('width',width);
    remoteVideo.src =  window.URL.createObjectURL(event.streams[0]);
    remoteVideo.srcObejct = event.streams[0];
    remoteVideo.play();
}

function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function () {
        console.log('CHANNEL opened!!!');
    };

    channel.onerror = function (err) {
        console.error("Channel Error:", err);
    };
    console.log("adapter.js says this is " + adapter.browserDetails.browser + " " + adapter.browserDetails.version);
    channel.onmessage = receiveData();
}

function receiveData() {
    var buf, count;
    return function onmessage(event) {
        if (typeof event.data === 'string') {
            var el = document.createElement("p");
            var textNode = document.createTextNode(event.data);
            el.appendChild(textNode);
            //chatFrameDocument.write(event.data);
           // document.getElementById("chatbox").contentWindow.scrollByPages(1);
            document.getElementById("chatbox").appendChild(el);
            buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('Expecting a total of ' + buf.byteLength + ' bytes');
            return;
        }

        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);

        count += data.byteLength;
        console.log('count: ' + count);

        if (count === buf.byteLength) {
            // we're done: all data chunks have been received
            console.log('Done. Rendering photo.');
            renderPhoto(buf);
        }
    
    }
}

function handleKey(evt) {
  if (evt.keyCode === 13 || evt.keyCode === 14) {
      sendText();
  }
}


function sendText() {
    var whom = "2: ";
    if (isInitiator) whom = "1: "; 
    var data = whom + document.getElementById("text").value +"\n";
       dataChannel.send(data);
    document.getElementById("text").value = "";
}
function snapPhoto() {
    photoContext.drawImage(localVideo, 0, 0, width, height);
    //show(photo, sendBtn);
    show(photo);
}

function sendPhoto() {
    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;

    var img = photoContext.getImageData(0, 0, width, height),
        len = img.data.byteLength,
        n = len / CHUNK_LEN | 0;

    console.log('Sending a total of ' + len + ' byte(s)');
    dataChannel.send(len);

    // split the photo and send in chunks of about 64KB
    for (var i = 0; i < n; i++) {
        var start = i * CHUNK_LEN,
            end = (i+1) * CHUNK_LEN;
        console.log(start + ' - ' + (end-1));
        dataChannel.send(img.data.subarray(start, end));
    }

    // send the reminder, if any
    if (len % CHUNK_LEN) {
        console.log('last ' + len % CHUNK_LEN + ' byte(s)');
        dataChannel.send(img.data.subarray(n * CHUNK_LEN));
    }
}

function snapAndSend() {
    snapPhoto();
    sendPhoto();
}


function renderPhoto(data) {
    var canvas = document.createElement('canvas');
    canvas.classList.add('photo');
    trail.insertBefore(canvas, trail.firstChild);
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    var img = context.createImageData(width, height);
    img.data.set(data);
    context.putImageData(img, 0, 0);
}


function show() {
    Array.prototype.forEach.call(arguments, function(elem){
        elem.style.display = null;
    });
}

function hide() {
    Array.prototype.forEach.call(arguments, function(elem){
        elem.style.display = 'none';
    });
}

/**************************************************************************** 
 * Aux functions, mostly UI-related
 ****************************************************************************/

function randomToken() {
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function logError(err) {
    console.log(err.toString(), err);
}
