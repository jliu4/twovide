'use strict';

window.moz = !!navigator.mozGetUserMedia;
if (moz) console.debug("MOZ");
//from https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/WebRTC_Basics 6/2/2016
//var configuration = {
//    iceServers: [
//       {urls: "stun:23.21.150.121"},
//       {urls: "stun:stun.l.google.com:19302"},
//        {urls: "turn:numb.viagenie.ca", credential: "webrtcdemo", username: "louis%40mozilla.com"}
//    ]
//}

 //url: 'stun:stun.l.google.com:19302'
 //url: 'stun:stun.anyfirewall.com:3478'
 //203.183.172.196:3478
 //113.32.111.126:3478
 //113.32.111.127:3478
 //stun.bcs2005.net
//iceServers.push({ 
//    urls: 'stun:203.183.172.196:3478'
//});

//iceServers.push({ 
//    urls: 'stun:113.32.111.127:3478'
//});
/*
1. The caller calls RTCPeerConnection.createOffer() to create an offer.
2. The caller calls RTCPeerConnection.setLocalDescription() to set that offer as the local description (that is, the description of the local end of the connection).
3. The caller uses the signaling server to transmit the offer to the intended receiver of the call.
4. The recipient receives the offer and calls RTCPeerConnection.setRemoteDescription() to record it as the remote description (the description of the other end of the connection).
5. The recipient does any setup it needs to do for its end of the call, including adding outgoing streams to the connection.
6. The recipient then creates an answer by calling RTCPeerConnection.createAnswer().
7. The recipient calls RTCPeerConnection.setLocalDescription() to set the answer as its local description. The recipient now knows the configuration of both ends of the connection.
8. The recipient uses the signaling server to send the answer to the caller.
9. The caller receives the answer.
10.The caller calls RTCPeerConnection.setRemoteDescription() to set the answer as the remote description for its end of the call. It now knows the configuration of both peers. Media begins to flow as configured.
*/

var MyPeerConnection = function(options) {
    var iceServers = [];
    if (moz) {
        iceServers.push({
            urls: 'stun:23.21.150.121'
        });

        iceServers.push({
            urls: 'stun:stun.services.mozilla.com'
        });
    }

    if (!moz) {
        iceServers.push({
            urls: 'stun:stun.l.google.com:19302'
        });

        iceServers.push({
            urls: 'stun:stun.anyfirewall.com:3478'
        });
    }

    iceServers.push({
        urls: 'turn:turn.bistri.com:80',
        credential: 'homeo',
        username: 'homeo'
    });

    iceServers.push({
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        credential: 'webrtc',
        username: 'webrtc'
    });

    var iceServers = {
        iceServers: iceServers
    };

    var optional = {
        optional: []
    };
    //iceServers are used during the finding of the ICE candidates.
    var peer = new RTCPeerConnection(iceServers,optional);

    openOffererChannel();

    //setup ice handling
    //when the browser finds an ice candiate we send it to another peer, as they are received.
    //an event will be fired once the ICE framework has found some “candidates” that will allow you to connect with a peer. 
    //This is known as an ICE Candidate and will execute a callback function on
    //When the callback is executed, we must use the signal channel to send the Candidate to the peer. 
    //On Chrome, multiple ICE candidates are usually found, we only need one so I typically send the first one then remove the handler. 
    //Firefox includes the Candidate in the Offer SDP.


    peer.onicecandidate = function(event) {
        if (event.candidate) {
            options.onICE(event.candidate);
        }
    };
    
    if (options.attachStream) {
        //JLIU-TODO addTrack addStream is deprecated.
        peer.addStream(options.attachStream);
    }
  

    //event is of type RTCTrackEvent, this event is sent when a new incoming mediaStreamTrack has
    //been created and associated with an RTCRtpRecever object which has been added to the set or recerivers on connection
    //it handles the mediatrack once it is received frim the remote peer.
    peer.ontrack = function(event) {
        setTimeout(function(){
        //remoteMediaStream is mediaStream type
        var remoteMediaStream = event.streams[0];
        //JLIU-TODO event
        //console.debug('on:add:stream', remoteMediaStream);
        //need to removeTrack to trigger this one.
        remoteMediaStream.onremovetrack = function() {
            if (options.onRemoteStreamEnded) options.onRemoteStreamEnded(remoteMediaStream);
        };
  
        if (options.onRemoteStream) options.onRemoteStream(remoteMediaStream);             

        console.debug('on:add:stream', remoteMediaStream);
    },2000);
    };

    // Set up audio and video regardless of what devices are present.
    // Disable comfort noise for maximum audio quality.     
    var sdpConstraints = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1,
        voiceActivityDetection: false  
    };
            
    //sdp, session description protocal is intended to described media communication session.
    function createOffer() {
        if (!options.onOfferSDP) return;
        //the caller create off
        peer.createOffer(function(sessionDescription) {
            //sessionDescription.sdp = setBandwidth(sessionDescription.sdp);
            sessionDescription.sdp = preferOpus(sessionDescription.sdp);
            //to set that offer as the local description(that is the description of the local end of the description)
            peer.setLocalDescription(sessionDescription);
            options.onOfferSDP(sessionDescription);

            console.debug('from createoffer offer-sdp ', sessionDescription.sdp);
        }, onSdpError, sdpConstraints);
    }

    function createAnswer() {
        if (!options.onAnswerSDP) return;

            //options.offerSDP.sdp = addStereo(options.offerSDP.sdp);
        console.debug('from createanswer offer-sdp', options.offerSDP.sdp);
        //before answser setRemoteDescription
        //when someone wants to call us.
        //if the message contains RTCSessionDescription, it should be added to the peer by using setRemoteDescription
        //recipient receives the offer and call setRemoteDescription to record it
        //as the remote description(the description of the other end of the connection)
        peer.setRemoteDescription(new RTCSessionDescription(options.offerSDP), onSdpSuccess, onSdpError);
        peer.createAnswer(function(sessionDescription) {
            //sessionDescription.sdp = setBandwidth(sessionDescription.sdp);
            sessionDescription.sdp = preferOpus(sessionDescription.sdp);
            peer.setLocalDescription(sessionDescription);
            options.onAnswerSDP(sessionDescription);
            //sessionDescription.type === 'answer'
            console.debug('answer-sdp', sessionDescription.sdp);
        }, onSdpError); //, sdpConstraints);
    }

   // if Mozilla Firefox & DataChannel; offer/answer will be created later 
    //if ((options.onChannelMessage && !moz) || !options.onChannelMessage) { //JLIU-TODO have to cancel it out, otherwise wont work with Firefox
        createOffer();
        createAnswer();
    //}
    //options.bandwidth = { audio: 128, video: 128, data: 30 * 1000 * 1000 }
    var bandwidth = options.bandwidth;
 
    function setBandwidth(sdp) {
        if (!bandwidth  || navigator.userAgent.match( /Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i )  ) return sdp;

            // remove existing bandwidth lines
        sdp = sdp.replace(/b=AS([^\r\n]+\r\n)/g, '');

        if (bandwidth.audio) {
           // sdp = sdp.replace(/m=audio ([0-9]+) RTP\/SAVPF ([0-9 ]*)/g, 'm=audio $1 RTP\/SAVPF 9' );
            sdp = sdp.replace(/a=mid:audio\r\n/g, 'a=mid:audio\r\nb=AS:' + bandwidth.audio + '\r\n');
        }
        if (bandwidth.video) {
            sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:' + bandwidth.video + '\r\n');
        }

        if (bandwidth.data) {
            sdp = sdp.replace(/a=mid:data\r\n/g, 'a=mid:data\r\nb=AS:' + bandwidth.data + '\r\n');
        }

        return sdp;
    }

    // DataChannel management
    var channel;

       function openOffererChannel() {
        if (!options.onChannelMessage)
            return;

        _openOffererChannel();
    }

    function _openOffererChannel() {
        // protocol: 'text/chat', preset: true, stream: 16
        // maxRetransmits:0 && ordered:false
        var dataChannelDict = { };
        channel = peer.createDataChannel(options.channel || 'sctp-channel', dataChannelDict);
        setChannelEvents();
    }

    function setChannelEvents() {
        channel.onmessage = function(event) {
            if (options.onChannelMessage) options.onChannelMessage(event);
        };

        channel.onopen = function() {
            if (options.onChannelOpened) options.onChannelOpened(channel);
        };
        channel.onclose = function(event) {
            if (options.onChannelClosed) options.onChannelClosed(event);

            console.warn('WebRTC DataChannel closed', event);
        };
        channel.onerror = function(event) {
            if (options.onChannelError) options.onChannelError(event);

            console.error('WebRTC DataChannel error', event);
        };
    }

    if (options.onAnswerSDP && options.onChannelMessage) {
        openAnswererChannel();
    }

    function openAnswererChannel() {
        peer.ondatachannel = function(event) {
            channel = event.channel;
            setChannelEvents();
        };
    }

    function onSdpSuccess() {}

    function onSdpError(e) {
        console.error('onSdpError:', JSON.stringify(e, null, '\t'));
    }
    //added from Adrian Ber
    var preferOpus = function(sdp) {
        var sdpLines = sdp.split('\r\n');

        for (var i = 0; i < sdpLines.length; i++) {
            if (sdpLines[i].search('m=audio') !== -1) {
                var mLineIndex = i;
                break;
            }
        }

        if (mLineIndex === null) return sdp;

        for (i = 0; i < sdpLines.length; i++) {
            if (sdpLines[i].search('opus/48000') !== -1) {
                var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
                if (opusPayload) 
                    sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
                break;
            }
        }

        sdpLines = removeCN(sdpLines, mLineIndex);

        sdp = sdpLines.join('\r\n');
        return sdp;
    };

    var extractSdp = function(sdpLine, pattern) {
        var result = sdpLine.match(pattern);
        return (result && result.length == 2)? result[1]: null;
    };

    var setDefaultCodec = function(mLine, payload) {
        var elements = mLine.split(' ');
        var newLine = new Array();
        var index = 0;
        for (var i = 0; i < elements.length; i++) {
            if (index === 3) newLine[index++] = payload;
            if (elements[i] !== payload) newLine[index++] = elements[i];
        }
        return newLine.join(' ');
    };

    var removeCN = function(sdpLines, mLineIndex) {
        var mLineElements = sdpLines[mLineIndex].split(' ');
        for (var i = sdpLines.length-1; i >= 0; i--) {
            var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
            if (payload) {
                var cnPos = mLineElements.indexOf(payload);
                if (cnPos !== -1) mLineElements.splice(cnPos, 1);
                sdpLines.splice(i, 1);
            }
        }
        sdpLines[mLineIndex] = mLineElements.join(' ');
        return sdpLines;
    };

    return {
        addAnswerSDP: function(sdp) {
            console.debug('adding answer-sdp', sdp.sdp);
            //when another user answers to our offer
            // which means the message contains RTCSessionDescription.
            //remotedescription describe the other end of the call.
            peer.setRemoteDescription(new RTCSessionDescription(sdp), onSdpSuccess, onSdpError);
        },
        addICE: function(candidate) {
            //when we got ice candidate from another user.
            //which means the message contains RTCIceCandidates
            peer.addIceCandidate(new RTCIceCandidate({
                sdpMLineIndex: candidate.sdpMLineIndex,
                candidate: candidate.candidate
            }));

            console.debug('adding-ice', candidate.candidate);
        },

        peer: peer,
        channel: channel,
        sendData: function(message) {
            channel && channel.send(message);
        }
    };
};

function listenEventHandler(eventName, eventHandler) {
    window.removeEventListener(eventName, eventHandler);
    window.addEventListener(eventName, eventHandler, false);
}


