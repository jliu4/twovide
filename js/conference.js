
'use strict';

var conference = function(config) {
    var self = {
        userToken: uniqueToken()
    };
    var channels = '--', isbroadcaster;
    var isGetNewRoom = true;
    var sockets = [];
    var defaultSocket = { };
 
    function openDefaultSocket() {
        defaultSocket = config.openSocket({
            onmessage: onDefaultSocketResponse,
            callback: function(socket) {
                defaultSocket = socket;
            }
        });
    }

    function onDefaultSocketResponse(response) {
        if (response.userToken == self.userToken) return;

        if (isGetNewRoom && response.roomToken && response.broadcaster) config.onRoomFound(response);

        if (response.newParticipant && self.joinedARoom && self.broadcasterid == response.userToken) onNewParticipant(response.newParticipant);

        if (response.userToken && response.joinUser == self.userToken && response.participant && channels.indexOf(response.userToken) == -1) {
            channels += response.userToken + '--';
            openSubSocket({
                isofferer: true,
                channel: response.channel || response.userToken
            });
        }

        // to make sure room is unlisted if owner leaves		
        if (response.left && config.onRoomClosed) {
            config.onRoomClosed(response);
        }
    }

    function openSubSocket(_config) {
        if (!_config.channel) return;
        var socketConfig = {
            channel: _config.channel,
            onmessage: socketResponse,
            onopen: function() {
                if (isofferer && !mypeer) initPeer();
                sockets[sockets.length] = socket;
            }
        };

        socketConfig.callback = function(_socket) {
            socket = _socket;
            this.onopen();
        };

        var socket = config.openSocket(socketConfig),
            isofferer = _config.isofferer,
            gotstream,
            video = document.createElement('video'),
            inner = { },
            mypeer;

        var peerConfig = {
            attachStream: config.attachStream, 
            //candidate is type of _RTCIceCandidate
            //it will call on each new ICE candidate
            //it can use SIP or any other signaling method to send these ICE candidates 
            onICE: function(candidate) {
                //signal channel to send the candidate to the peer.
                socket.send({
                    userToken: self.userToken,
                    candidate: {
                        //JLIU-TODO what is difference just send candidate without JSON
                        sdpMLineIndex: candidate.sdpMLineIndex,
                        candidate: JSON.stringify(candidate.candidate)
                    }
                });
            },
            //it will called as soon as peer.ontrack event fire.
            onRemoteStream: function(stream) {
                if (!stream) return;

               // video.src = URL.createObjectURL(stream); //JLIUT-TODO
                video.srcObject = stream;
                video.play();

                _config.stream = stream;
                onRemoteStreamStartsFlowing();
            },
            //it will called when remote stream stops flowing
            onRemoteStreamEnded: function(stream) {
                if (config.onRemoteStreamEnded)

                    config.onRemoteStreamEnded(stream,video);
            }
        };

        function initPeer(offerSDP) {
            //offerSDP is only useful for answer. As soon as you received offer sdp send by offerer;
            //offerSDP must be an object and look like
            //{ type: 'offer',
            //  sdp: '.....offerer sdp......'}
            if (!offerSDP) {
                peerConfig.onOfferSDP = sendsdp;
            } else {
                //after successfully creating offer SDP, 
                //An object of type RTCSessionDescription will be passed over this method
                peerConfig.offerSDP = offerSDP;
                //it will call after successfully creating answer SDP.
                peerConfig.onAnswerSDP = sendsdp;
            }
            mypeer = MyPeerConnection(peerConfig);
        }
        
        function afterRemoteStreamStartedFlowing() {
            gotstream = true;

            if (config.onRemoteStream)
                config.onRemoteStream({
                    video: video,
                    stream: _config.stream
                });

            if (isbroadcaster && channels.split('--').length > 3) {
                /* broadcasting newly connected participant for video-conferencing! */
                defaultSocket.send({
                    newParticipant: socket.channel,
                    userToken: self.userToken
                });
            }
        }

        function onRemoteStreamStartsFlowing() {
            if(navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i)) {
                // if mobile device
                return afterRemoteStreamStartedFlowing();
            }
            
            if (!(video.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA || video.paused || video.currentTime <= 0)) {
                afterRemoteStreamStartedFlowing();
            } else setTimeout(onRemoteStreamStartsFlowing, 50);
        }

        function sendsdp(sdp) {
            socket.send({
                userToken: self.userToken,
                sdp: JSON.stringify(sdp)
            });
        }

        function socketResponse(response) {
            if (response.userToken == self.userToken) return;
            if (response.sdp) {
                inner.sdp = JSON.parse(response.sdp);
                selfInvoker();
            }

            if (response.candidate && !gotstream) {
                if (!mypeer) console.error('missed an ice', response.candidate);
                else
                    mypeer.addICE({
                        sdpMLineIndex: response.candidate.sdpMLineIndex,
                        candidate: JSON.parse(response.candidate.candidate)
                    });
            }
            
            if (false && response.left) { //JLIU-TODO
                if (mypeer && mypeer.peer) {
                    mypeer.peer.close();
                    mypeer.peer = null;
                }
            }
        }

        var invokedOnce = false;

        function selfInvoker() {
            if (invokedOnce) return;

            invokedOnce = true;

            if (isofferer) mypeer.addAnswerSDP(inner.sdp);
            else initPeer(inner.sdp);
        }
    }

    function leave() {
        console.log("Leave");

        var length = sockets.length;
        for (var i = 0; i < length; i++) {
            var socket = sockets[i];
            if (socket) {
                socket.send({
                    left: true,
                    userToken: self.userToken
                });
                delete sockets[i];
            }
        }
      
        // if owner leaves; try to remove his room from all other users side
        //JLIU-TODO NOT Only isbroadcaster, other leave as will.
        if (isbroadcaster) {
            defaultSocket.send({
                left: true,
                userToken: self.userToken,
                roomToken: self.roomToken
            });
        }
        //JLIU-TODO
        if (config.attachStream) {
            config.attachStream.getVideoTracks().forEach(function (track) {
            track.stop();
            });
        } 
    }
    

    window.addEventListener('beforeunload', function (e) {
        leave();
    }, false);

    window.addEventListener('keyup', function (e) {
        if (e.keyCode == 116)
            leave();
    }, false);
 
    function startBroadcasting() {
        defaultSocket && defaultSocket.send({
            roomToken: self.roomToken,
            roomName: self.roomName,
            broadcaster: self.userToken
        });
        setTimeout(startBroadcasting, 3000);
    }

    function onNewParticipant(channel) {
        if (!channel || channels.indexOf(channel) != -1 || channel == self.userToken) return;
        channels += channel + '--';

        var new_channel = uniqueToken();
        openSubSocket({
            channel: new_channel
        });

        defaultSocket.send({
            participant: true,
            userToken: self.userToken,
            joinUser: channel,
            channel: new_channel
        });
    }

    function uniqueToken() {
        var s4 = function() {
            return Math.floor(Math.random() * 0x10000).toString(16);
        };
        return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
    }

    openDefaultSocket();
    return {
        createRoom: function(_config) {
            self.roomName = _config.roomName || 'Anonymous';
            self.roomToken = uniqueToken();

            isbroadcaster = true;
            isGetNewRoom = false;
            startBroadcasting();
        },
        joinRoom: function(_config) {
            self.roomToken = _config.roomToken;
            isGetNewRoom = false;

            self.joinedARoom = true;
            self.broadcasterid = _config.joinUser;

            openSubSocket({
                channel: self.userToken
            });

            defaultSocket.send({
                participant: true,
                userToken: self.userToken,
                joinUser: _config.joinUser
            });
        },
        //leaveRoom: leave
        leaveRoom: function(){
            leave();
        }
    };
    
};