goog.provide('aurora.widgets.Chat');


goog.require('aurora.chat.shared');
goog.require('goog.dom');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.ButtonWidget');

/**
 * @constructor
 * @export
 * @param {!aurora.WidgetScope} scope
 * @param {boolean=} opt_manageButtons if false then will not draw call buttons
 * @implements {recoil.ui.Widget}
 */

aurora.widgets.Chat = function(scope, opt_manageButtons) {
    const State = aurora.widgets.Chat.State;
    let cd = goog.dom.createDom;
    let frp = scope.getFrp();
    this.scope_ = scope;
    this.remote_ = cd('video', {playsinline: true, autoplay: true});
    this.local_ = cd('video', {class: 'aurora-chat-local', playsinline: true, autoplay: true, muted: true});
    this.showLocal_ = true;
//    goog.style.setElementShown(this.local_, false);
    let declineDiv = cd('div', {class: 'aurora-chat-answer-button'});
    let answerDiv = cd('div', {class: 'aurora-chat-answer-button'});
    let answerWhoDiv = cd('div', {class: 'aurora-chat-answer-who'});
    let callWhoDiv = cd('div', {class: 'aurora-chat-call-who'});
    let errorTextDiv = cd('div', {class: 'aurora-chat-error-message'});

    let videoDiv = cd('div', {class: 'aurora-chat-call-button'});
    let muteDiv = cd('div', {class: 'aurora-chat-call-button'});
    let screenDiv = cd('div', {class: 'aurora-chat-call-button'});
    let hangupDiv = cd('div', {class: 'aurora-chat-call-button'});

    this.ring_ = new Audio('/images/ring.mp3');
    this.dial_ = new Audio('/images/dial.mp3');

    let html = new recoil.ui.HtmlHelper(scope);

    this.audioCallButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.videoCallButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.hangupButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.muteButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.screenButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.videoButton_ = new recoil.ui.widgets.ButtonWidget(scope);

    this.answerButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.declineButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    let errorCloseButton = new recoil.ui.widgets.ButtonWidget(scope);

    let answerButtons = cd('div', {class: 'aurora-chat-answer-buttons'}, answerDiv, declineDiv);
    let callButtons = cd('div', {class: 'aurora-chat-call-buttons'}, videoDiv, muteDiv, screenDiv, hangupDiv);
    let errorClose = cd('div', 'aurora-chat-error-close-button');

    errorCloseButton.getComponent().render(errorClose);

    this.answer_ = cd(
        'div', {class: 'aurora-chat-answer'}, answerWhoDiv,
        cd('i', 'fas fa-phone aurora-chat-answer-phone'),
        answerButtons);

    this.error_ = cd(
        'div', {class: 'aurora-chat-error'},
        cd('span', 'aurora-chat-error-icon'), errorTextDiv, errorClose);

    this.call_ = cd(
        'div', {class: 'aurora-chat-call'}, callWhoDiv,
        cd('i', 'fas fa-phone aurora-chat-answer-phone'),
        this.remote_, this.local_,
        callButtons);

    this.container_ = cd(
        'div', {class: 'aurora-chat-container'},
        this.answer_, this.call_, this.error_);
    if (opt_manageButtons !== false) {
        this.videoCallButton_.getComponent().render(this.container_);
        this.audioCallButton_.getComponent().render(this.container_);
    }
    this.hangupButton_.getComponent().render(hangupDiv);
    this.muteButton_.getComponent().render(muteDiv);
//    this.screenButton_.getComponent().render(screenDiv);
    this.videoButton_.getComponent().render(videoDiv);

    this.answerButton_.getComponent().render(answerDiv);
    this.declineButton_.getComponent().render(declineDiv);



    let me = this;
    this.channel_ = aurora.websocket.getObjectChannel(
        aurora.chat.shared.PLUGIN_ID, aurora.db.shared.DATA,
        /**
         * @param {!coms.Command} obj
         */
        function(obj) {
            if (obj.error) {
                me.silence_();
                me.closeConnection_();
                frp.accessTrans(function() {
                    me.stateB_.set({state: aurora.widgets.Chat.State.error, error: obj.error});
                }, me.stateB_);
                return;
            }

            if (obj.command === 'available') {
                frp.accessTrans(function() {
                    let avail = goog.object.clone(me.availB_.get());

                    if (obj.val) {
                        avail[obj.userid] = true;
                    }
                    else {
                        delete avail[obj.userid];
                    }
                    me.availB_.set(avail);
                }, me.availB_);

            }
            else if (obj.command === 'webrtc-offer') {
                console.log('got offer', obj.description);
                me.remoteOffer_(obj.description);
            }
            else if (obj.command === 'offer') {
                me.ring({who: obj.who, user: obj.user, clientId: obj.requestClientId});
            }
            else if (obj.command === 'disconnect' || obj.command === 'reject') {
                me.resetState_(aurora.widgets.Chat.State.idle);
            }
            else if (obj.command === 'answered') {
                me.callAnswered(obj);

            }
            else if (obj.command === 'iceCandidate') {
                if (me.peerConnection_ && obj.candidate) {
                    me.peerConnection_.addIceCandidate(obj.candidate).then(() => 1, e => 0);
                }
            }
        });

    this.availB_ = frp.createB({});
    this.stateB_ = frp.createB({state: State.idle, caller: null});
    this.whoB_ = frp.createB('');
    this.channelStateB_ = frp.createB({audio: true, video: true});

    html.innerText(answerWhoDiv, this.whoB_);
    html.innerText(callWhoDiv, this.whoB_);
    html.innerText(errorTextDiv, frp.liftB(x => x.error || 'This is a long test message for testing it should not ever show', this.stateB_));
    html.enableClass(this.call_, 'aurora-chat-incall', frp.liftB(s => s.state === State.inCall, this.stateB_));


    html.show(this.answer_, frp.liftB(x => x.state === State.ringing, this.stateB_));
    html.show(this.error_, frp.liftB(x => x.state === State.error, this.stateB_));
    html.show(screenDiv, frp.liftB(x => x.state === State.inCall && (navigator.getDisplayMedia || navigator.mediaDevices.getDisplayMedia), this.stateB_));
    html.show(this.call_, frp.liftB(function(state) {
        return [State.dialing, State.inCall, State.no_answer, State.connecting].indexOf(state.state) != -1;
    }, this.stateB_));

    this.videoCallButton_.attachStruct({
        action: frp.createCallback(function() {
            me.doCall({audio: true, video: true}, 1, 'unknown');
        }, this.stateB_), text: 'Video Call'
    });

    this.audioCallButton_.attachStruct({
        action: frp.createCallback(function() {
            me.doCall({audio: true, video: false}, 1, 'unknown');
        }, this.stateB_), text: 'Audio Call'
    });

    this.hangupButton_.attachStruct({
        action: frp.createCallback(function() {
            me.hangup();
        }, this.stateB_), text: 'Hangup'
    });

    let mute = cd('i', 'fas fa-microphone-alt-slash');
    let unmute = cd('i', 'fas fa-microphone-alt');

    let video = cd('i', 'fas fa-video');
    let novideo = cd('i', 'fas fa-video-slash');

    let screen = cd('i', 'fas fa-desktop');
    let noscreen = cd('i', 'fas fa-desktop aurora-chat-screen-off');

    this.muteButton_.attachStruct({
        action: frp.createCallback(function() {
            let state = goog.object.clone(me.channelStateB_.get());
            state.audio = !state.audio;
            me.channelStateB_.set(state);
        }, this.channelStateB_),
        text: frp.liftB(function(v) {
            return v.audio ? unmute : mute;
        }, this.channelStateB_)
    });


    this.screenButton_.attachStruct({
        action: frp.createCallback(function() {
            let state = goog.object.clone(me.channelStateB_.get());
            state.screen = !state.screen;
            me.channelStateB_.set(state);
        }, this.channelStateB_),
        text: frp.liftB(function(v) {
            return v.screen ? screen : noscreen;
        }, this.channelStateB_)
    });


    this.videoButton_.attachStruct({
        action: frp.createCallback(function() {
            let state = goog.object.clone(me.channelStateB_.get());
            state.video = !state.video;
            me.channelStateB_.set(state);
        }, this.channelStateB_),
        text: frp.liftB(function(v) {
            return v.video ? video : novideo;
        }, this.channelStateB_)
    });

    this.hangupButton_.attachStruct({
        action: frp.createCallback(function() {
            me.hangup();
        }, this.stateB_), text: 'Hangup'
    });

    this.answerButton_.attachStruct({
        action: frp.createCallback(function() {
            me.answerCall_();
        }, this.stateB_), text: 'Answer'
    });

    this.declineButton_.attachStruct({
        action: frp.createCallback(function() {
            me.decline();
        }, this.stateB_), text: 'Decline'
    });

    errorCloseButton.attachStruct({
        action: frp.createCallback(function() {
            me.resetState_(aurora.widgets.Chat.State.idle);
        }, this.stateB_), text: 'Ok'
    });
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.updateState_);
    this.helper_.attach(this.channelStateB_, this.stateB_, this.availB_);

};
/**
 * @param {!Array<number>} userids
 */
aurora.widgets.Chat.prototype.interestedIn = function(userids) {
    this.channel_.send({command: 'watch', users: userids});
    let me = this;
    this.scope_.getFrp().accessTrans(function() {
        me.availB_.set({});
    }, me.availB_);
};

/**
 * @return {!recoil.frp.Behaviour<Object<string,boolean>>}
 */
aurora.widgets.Chat.prototype.getAvailableB = function() {
    return this.availB_;
};
/**
 * @private
 * @param {recoil.ui.ComponentWidgetHelper} helper
 */
aurora.widgets.Chat.prototype.updateState_ = function(helper) {
    const widgetId = 'aurora.widgets.Chat';
    let frp = this.scope_.getFrp();

    if (helper.isGood()) {
        let audio = this.channelStateB_.get().audio;
        let video = this.channelStateB_.get().video;
        let screen = this.channelStateB_.get().screen;
        let state = this.stateB_.get().state;

        if (navigator.getDisplayMedia || navigator.mediaDevices.getDisplayMedia) {
            if (!this.localScreen_ && screen) {
                let me = this;

                let gotScreen = function(stream) {
                    me.localScreen_ = stream;
                    stream.getTracks().forEach(track => me.peerConnection_.addTrack(track, stream));

                    console.log('got screen', stream);
                };
                let failedScreen = frp.accessTransFunc(function(e) {
                    console.log('got screen', e);
                    let state = goog.object.clone(me.channelStateB_.get());
                    state.screen = false;
                    me.channelStateB_.set(state);

                }, this.channelStateB_);
                try {
                    let screenStream;
                    if (navigator.getDisplayMedia) {
                        navigator.getDisplayMedia({video: true}).then(gotScreen, failedScreen);
                    }
                    else if (navigator.mediaDevices.getDisplayMedia) {
                        navigator.mediaDevices.getDisplayMedia({video: true}).then(gotScreen, failedScreen);
                    }
                    else {
                        failedScreen('Not Supported');
                    }
                }
                catch (e) {
                }
            } else {

                if (!screen) {
                    this.stopScreen_();
                }
            }
        }

        if (this.local_.srcObject) {
            let tracks = this.local_.srcObject.getAudioTracks();
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].enabled = audio;
            }

            tracks = this.local_.srcObject.getVideoTracks();
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].enabled = video;
            }

        }
        const State = aurora.widgets.Chat.State;
        aurora.ui.userChanges(widgetId, State.idle != state && State.error != state, 'Leaving the page will end the call');
        goog.style.setElementShown(this.remote_, state === aurora.widgets.Chat.State.inCall);
        goog.style.setElementShown(this.local_, state === aurora.widgets.Chat.State.inCall && this.showLocal_);
    }
    else {
        aurora.ui.userChanges(widgetId, false);
    }
};


/**
 * @private
 */
aurora.widgets.Chat.prototype.closeConnection_ = function() {
    this.stopScreen_();
    this.makingOffer_ = false;
    this.ignoreOffer_ = false;
    this.polite_ = true;
    console.log('reseting state');
    if (this.peerConnection_) {
        this.peerConnection_.close();
        this.peerConnection_ = null;
    }
};

/**
 * @private
 */
aurora.widgets.Chat.prototype.stopScreen_ = function() {
    if (this.localScreen_) {
        this.localScreen_.getTracks().forEach(function(track) {
            track.stop();
        });
        this.localScreen_ = null;
    }
};
/**
 * @private
 * closes the connection and puts the state back to
 * the intial one
 */
aurora.widgets.Chat.prototype.resetTimeout_ = function() {
    if (this.dialTimeout_) {
        clearTimeout(this.dialTimeout_);
        this.dialTimeout_ = null;
    }

    if (this.ringTimeout_) {
        clearTimeout(this.ringTimeout_);
        this.ringTimeout_ = null;
    }

};
/**
 * @private
 * closes the connection and puts the state back to
 * the intial one
 * @param {number} state
 */
aurora.widgets.Chat.prototype.resetState_ = function(state) {
    this.closeConnection_();
    this.silence_();
    this.resetTimeout_();
    let me = this;
    this.scope_.getFrp().accessTrans(function() {

        me.stateB_.set({state: state, caller: null});
    }, me.stateB_);

};


/**
 * @private
 * closes the connection and puts the state back to
 * the intial one
 * @param {string} error
 */
aurora.widgets.Chat.prototype.setErrorState_ = function(error) {
    let frp = this.scope_.getFrp();
    let me = this;
    const State = aurora.widgets.Chat.State;

    let state = frp.accessTrans(x => me.stateB_.get(), me.stateB_);
    if (State.ringing == state.state) {
        this.hangup('reject');
    }
    else if (State.inCall == state.state) {
        this.hangup();
    }
    this.closeConnection_();
    this.silence_();
    this.resetTimeout_();

    frp.accessTrans(function() {
        me.stateB_.set({state: aurora.widgets.Chat.State.error, error: error || 'Unknown Error'});
    }, me.stateB_);

};

/**
 * @return {!goog.ui.Component}
 */
aurora.widgets.Chat.prototype.getComponent = function() {
    return this.component_;
};


/**
 * all widgets should not allow themselves to be flatterned
 *
 */

aurora.widgets.Chat.prototype.flatten = recoil.frp.struct.NO_FLATTEN;


aurora.widgets.Chat.State = {
    connecting: 1,
    dialing: 2,
    idle: 3,
    ringing: 4,
    no_answer: 5,
    rejected: 6,
    error: 7,
    inCall: 8
};
/**
 * @param {?} e
 */
aurora.widgets.Chat.prototype.gotRemoteStream = function(e) {
    if (!this.remote_.srcObject) {
        this.remote_.srcObject = new MediaStream();
    }
    this.remote_.srcObject.addTrack(e.track);
};

/**
 * @private
 * @param {boolean} polite
 * @return {RTCPeerConnection}
 */
aurora.widgets.Chat.prototype.makePeerConnection_ = async function(polite) {
    this.polite_ = polite;
    this.makingOffer_ = false;
    this.ignoreOffer_ = false;

    let stream;
    try {
        try {
            stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
        }
        catch (e) {
            // we failed to get camera and video just try to get video
            console.warn('unable to get video device trying voice only');
            stream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
        }
        this.local_.srcObject = stream;
    }
    catch (e) {
        this.setErrorState_('Unable to connect to Video or Microphone. Please check your browser permissions.');
        throw e;
    }

    const configuration = {};
    if (this.remote_.srcObject) {
        this.remote_.srcObject = new MediaStream();
    }
    let pc = new RTCPeerConnection(configuration);
    pc.addEventListener('icecandidate', this.onIceCandidate.bind(this));
    pc.addEventListener('iceconnectionstatechange', this.onIceStateChange.bind(this));
    let me = this;
    pc.addEventListener('negotiationneeded', async() => {
        try {
            this.makingOffer_ = true;
            const offer = await pc.createOffer();
            if (pc.signalingState != 'stable') return;
            await pc.setLocalDescription(offer);
            me.channel_.send({command: 'webrtc-offer', description: pc.localDescription});
        } catch (e) {
            me.setErrorState_(e.message || e);
        }
        finally {
            me.makingOffer_ = false;
        }
    });



    const gotRemoteStream = this.gotRemoteStream.bind(this);
    pc.addEventListener('track', gotRemoteStream);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    return pc;
};

/**
 * stops all ringing and dialing
 */
aurora.widgets.Chat.prototype.silence_ = function() {

    this.ring_.pause();
    this.ring_.currentTime = 0;
    this.dial_.pause();
    this.dial_.currentTime = 0;


};

/**
 * the other side has answered out call
 * @param {{who:number,description:?}} obj information about the call
 */
aurora.widgets.Chat.prototype.callAnswered = async function(obj) {
    let me = this;
    let frp = this.scope_.getFrp();
    let state = null;
    frp.accessTrans(function() {
        state = me.stateB_.get();
    }, me.stateB_);


    if (!state || state.state != aurora.widgets.Chat.State.dialing) {
        // todo cleanup state
        return;
    }

    frp.accessTrans(function() {
        me.stateB_.set({state: aurora.widgets.Chat.State.connecting, caller: {userid: state.who, clientid: obj.who}});
    }, me.stateB_);

    this.peerConnection_ = await this.makePeerConnection_(false);

    /*

      const offerOptions = {
      offerToReceiveAudio: 1,
      offerToReceiveVideo: 1
      };
    const offer = await this.peerConnection_.createOffer(offerOptions);
    await this.peerConnection_.setLocalDescription(offer);
    */
    me.silence_();


};

/**
 * @return {!recoil.frp.Behaviour}
 */
aurora.widgets.Chat.prototype.getState = function() {
    return this.stateB_;
};
/**
 * @param {{audio:boolean, video:boolean}} media , what type of call is this
 * @param {number} userid who to call
 * @param {string} name
 */
aurora.widgets.Chat.prototype.doCall = async function(media, userid, name) {
    const cls = aurora.widgets.Chat;
    // we can recieve anything that depends on what the other side decides
    let frp = this.scope_.getFrp();

    try {

        frp.accessTrans(function() {
            this.whoB_.set(name);
            this.channelStateB_.set(media);
        }.bind(this), this.channelStateB_, this.whoB_);

        let me = this;
        this.channel_.send({command: 'offer', who: userid});

        this.dial_.loop = true;
        this.dial_.play().then(x => undefined, x => undefined);

        frp.accessTrans(function() {
            me.stateB_.set({state: aurora.widgets.Chat.State.dialing, caller: {who: userid}});
        }, this.stateB_);


        this.dialTimeout_ = setTimeout(function() {
        frp.accessTrans(function() {
            me.silence_();
            me.stateB_.set({state: aurora.widgets.Chat.State.no_answer, caller: {who: userid}});
        }, me.stateB_);
        }, aurora.widgets.Chat.RING_TIME);
    } catch (e) {
        console.error('error in call', e);
    }

};

/**
 * @const
 * how long to ring before giving up
 */
aurora.widgets.Chat.RING_TIME = 30000;

/**
 * decline to answer a call
 */
aurora.widgets.Chat.prototype.decline = function() {
    this.hangup('reject');
};

/**
 * decline to answer a call
 * @param {string=} opt_method what to other side as to why can be reject
 */
aurora.widgets.Chat.prototype.hangup = function(opt_method) {
    if (this.ringTimeout_) {
        clearTimeout(this.ringTimeout_);
        this.ringTimeout_ = null;
    }
    let frp = this.scope_.getFrp();
    let me = this;

    this.silence_();

    let info = frp.accessTrans(function() {
        return me.stateB_.get().caller || {};
    }, this.stateB_);

    this.resetState_(aurora.widgets.Chat.State.idle);
    this.channel_.send({command: opt_method || 'hangup', client: info.clientId});

};

/**
 * somebody is calling, who is the id of the user, user is the username and
 * clientid is a unique id of the client and the window that they are using
 *
 * @param {{who: number, description:?, user:string, clientId: string}} info
 */
aurora.widgets.Chat.prototype.ring = function(info) {
    let me = this;
    let frp = this.scope_.getFrp();

    let busy = false;

    frp.accessTrans(function() {
        let state = me.stateB_.get();
        busy = aurora.widgets.Chat.State.idle !== state.state && aurora.widgets.Chat.State.error !== state.state;

        if (!busy) {
            me.stateB_.set({state: aurora.widgets.Chat.State.ringing, caller: info});
            me.whoB_.set(info.user || '');
        }
    }, this.stateB_, this.whoB_);

    if (busy) {
        // todo send busy message
        return;
    }

    this.ring_.loop = true;
    this.ring_.play().then(x => undefined, x => undefined);
    this.ringTimeout_ = setTimeout(function() {
        me.decline();
    }, aurora.widgets.Chat.RING_TIME);

};


/**
 * we have got an offer now answer the call, and the user has accepted it
 *
 * @private
 * @param {?} description
 */
aurora.widgets.Chat.prototype.remoteOffer_ = async function(description) {
    if (!this.peerConnection_ || !description) {
        return;
    }
    let pc = this.peerConnection_;

    const isStable =
          pc.signalingState == 'stable' ||
          (pc.signalingState == 'have-local-offer' && this.srdAnswerPending_);


    this.ignoreOffer_ = description.type == 'offer' && !this.polite_ && (this.makingOffer_ || !isStable);

    if (this.ignoreOffer_) {
        return;
    }
    this.srdAnswerPending_ = description.type == 'answer';
    console.log('answer', description.type == 'answer');
    await pc.setRemoteDescription(description);
    this.srdAnswerPending_ = false;
    if (description.type == 'offer') {
        await pc.setLocalDescription(),
        this.channel_.send({command: 'webrtc-offer', description: pc.localDescription});
    }
};

/**
 * we have got an offer now answer the call, and the user has accepted it
 *
 * @private
 */
aurora.widgets.Chat.prototype.answerCall_ = async function() {
    try {
        const configuration = {};
        let frp = this.scope_.getFrp();
        //    let state = null;
        let me = this;
        this.resetTimeout_();
        let state = frp.accessTrans(() => me.stateB_.get(), me.stateB_);

        this.peerConnection_ = await this.makePeerConnection_(true);

        let clientId = state.caller.requestClientId;
        this.channel_.send({command: 'answered', who: state.caller.clientId});

        frp.accessTrans(function() {
            me.stateB_.set({state: aurora.widgets.Chat.State.connecting, caller: {userid: state.who, clientid: clientId}});

        }, this.stateB_);
        this.silence_();
    } catch (e) {
        console.error('error in answer', e);
    }
};

/**
 * send candiate information to the other client
 *
 * @param {?} event
 */

aurora.widgets.Chat.prototype.onIceCandidate = function(event) {
    if (event.candidate) {
        this.channel_.send({command: 'iceCandidate', candidate: event.candidate.toJSON()});
    }
};

/**
 * fired when internet connection exchange (ice) state changes
 * we care when we are connected
 * @param {?} event
 */
aurora.widgets.Chat.prototype.onIceStateChange = function(event) {
    if (this.peerConnection_) {
        let frp = this.scope_.getFrp();
        let conState = this.peerConnection_.iceConnectionState;
        console.log('ICE state: ' + this.peerConnection_.iceConnectionState);
        if (conState === 'connected') {
            this.resetTimeout_();
            frp.accessTrans(function() {
                let state = goog.object.clone(this.stateB_.get());
                if (state.caller) {
                    state.state = aurora.widgets.Chat.State.inCall;
                }
                this.stateB_.set(state);
            }.bind(this), this.stateB_);
        }
        else if (conState === 'failed') {
            this.resetTimeout_();
            frp.accessTrans(function() {
                let state = goog.object.clone(this.stateB_.get());
                state.state = aurora.widgets.Chat.State.eror;
                this.stateB_.set(state);
            }.bind(this), this.stateB_);
        }
        else {
            console.log('ICE state change event: ', event);
        }
    }
};

