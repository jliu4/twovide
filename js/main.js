/****************************************************************************
 * Initial setup
 ****************************************************************************/
'use strict';

var width = 320;
var height = 0;

var streaming = false;

var video_constraints = {
  mandatory: {
    maxHeight: 240,
    maxWidth: 240 
  },
  optional: []
};

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
    canvas = document.getElementById('canvas'),
    photo = document.getElementById('photo'),
    photoBtn =document.getElementById("photoButton");

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
    console.log('Getting user media (video) ...');
    getUserMedia({video: true, audio: true }, getMediaSuccessCallback, getMediaErrorCallback);
}

function getMediaSuccessCallback(stream) {
    
    localVideo.src =  window.URL.createObjectURL(stream);
    localVideo.srcObject = stream;
    localStream = stream;
    if (localPC && localPC !=undefined ) localPC.addStream(stream);
}

function getMediaErrorCallback(error){
    console.log("getUserMedia error:", error);
}

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
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
        streaming = true;
    }
}, false);

photoButton.addEventListener('click', function(ev){
    takepicture();
    ev.preventDefault();
}, false);
    
clearphoto();
 function clearphoto() {
    var context = canvas.getContext('2d');
    context.fillStyle = "#AAA";
    context.fillRect(0, 0, canvas.width, canvas.height);

    var data = canvas.toDataURL('image/png');
    photo.setAttribute('src', data);
  }
  
  // Capture a photo by fetching the current contents of the video
  // and drawing it into a canvas, then converting that to a PNG
  // format data URL. By drawing it on an offscreen canvas and then
  // drawing that to the screen, we can change its size and/or apply
  // other changes before drawing it.

  function takepicture() {
    var context = canvas.getContext('2d');
    if (width && height) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
    
      var data = canvas.toDataURL('image/png');
      photo.setAttribute('src', data);
    } else {
      clearphoto();
    }
  }
/**************************************************************************** 
 * WebRTC peer connection and data channel
 ****************************************************************************/

var localStream, localPC

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
        console.log('Creating an offer');
        
       // onRemoteStreamAdded;

        localPC.createOffer(onLocalSessionCreated, logError,sdpConstraints);
      
    } else {
        //localPC.addStream(localStream);
        

        //onRemoteStreamAdded;

        //localPC.addStream(localStream);
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
    
      remoteVideo.src =  window.URL.createObjectURL(event.streams[0]);
      remoteVideo.srcObejct = event.streams[0];
      remoteVideo.play();
   
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
