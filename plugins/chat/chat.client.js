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
    this.local_ = cd('video', {playsinline: true, autoplay: true, muted: true});
    goog.style.setElementShown(this.local_, false);
    let declineDiv = cd('div', {class: 'aurora-chat-answer-button'});
    let answerDiv = cd('div', {class: 'aurora-chat-answer-button'});
    let answerWhoDiv = cd('div', {class: 'aurora-chat-answer-who'});
    let callWhoDiv = cd('div', {class: 'aurora-chat-call-who'});

    let videoDiv = cd('div', {class: 'aurora-chat-call-button'});
    let muteDiv = cd('div', {class: 'aurora-chat-call-button'});
    let hangupDiv = cd('div', {class: 'aurora-chat-call-button'});

    this.ring_ = new Audio('/images/ring.mp3');
    this.dial_ = new Audio('/images/dial.mp3');

    let html = new recoil.ui.HtmlHelper(scope);

    this.audioCallButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.videoCallButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.hangupButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.muteButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.videoButton_ = new recoil.ui.widgets.ButtonWidget(scope);

    this.answerButton_ = new recoil.ui.widgets.ButtonWidget(scope);
    this.declineButton_ = new recoil.ui.widgets.ButtonWidget(scope);

    let answerButtons = cd('div', {class: 'aurora-chat-answer-buttons'}, answerDiv, declineDiv);
    let callButtons = cd('div', {class: 'aurora-chat-call-buttons'}, videoDiv, muteDiv, hangupDiv);
    this.answer_ = cd(
        'div', {class: 'aurora-chat-answer'}, answerWhoDiv,
        cd('i', 'fas fa-phone aurora-chat-answer-phone'),
        answerButtons);

    this.call_ = cd(
        'div', {class: 'aurora-chat-call'}, callWhoDiv,
        cd('i', 'fas fa-phone aurora-chat-answer-phone'),
        this.remote_, this.local_,
        callButtons);

    this.container_ = cd(
        'div', {class: 'aurora-chat-container'},
        this.answer_, this.call_);
    if (opt_manageButtons !== false) {
        this.videoCallButton_.getComponent().render(this.container_);
        this.audioCallButton_.getComponent().render(this.container_);
    }
    this.hangupButton_.getComponent().render(hangupDiv);
    this.muteButton_.getComponent().render(muteDiv);
    this.videoButton_.getComponent().render(videoDiv);

    this.answerButton_.getComponent().render(answerDiv);
    this.declineButton_.getComponent().render(declineDiv);

    this.pendingIceCandidates_ = [];


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

            if (obj.command === 'offer') {
                me.ring({who: obj.who, description: obj.description, user: obj.user, clientId: obj.requestClientId});
            }
            else if (obj.command === 'disconnect' || obj.command === 'reject') {
                me.resetState_(aurora.widgets.Chat.State.idle);
            }
            else if (obj.command === 'answered') {
                me.callAnswered(obj);

            }
            else if (obj.command === 'iceCandidate') {
                if (me.peerConnection_ && me.peerConnection_.currentRemoteDescription) {
                    console.log('add ice', obj.candidate);
                    me.peerConnection_.addIceCandidate(new RTCIceCandidate(obj.candidate)).then(() => 1, e => 0);
                }
                else {
                    me.pendingIceCandidates_.push(obj);
                }
            }
        });

    this.stateB_ = frp.createB({state: State.idle, caller: null});
    this.whoB_ = frp.createB('');
    this.channelStateB_ = frp.createB({audio: true, video: true});

    html.innerText(answerWhoDiv, this.whoB_);
    html.innerText(callWhoDiv, this.whoB_);

    html.show(this.answer_, frp.liftB(x => x.state === State.ringing, this.stateB_));
    html.show(this.call_, frp.liftB(function(state) {
        return [State.dialing, State.inCall, State.no_answer, State.connecting].indexOf(state.state) != -1;
    }, this.stateB_));

    this.videoCallButton_.attachStruct({
        action: frp.createCallback(function() {
            me.doCall({audio: true, video: true}, 1,'unknown');
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
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.container_);

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.updateState_);
    this.helper_.attach(this.channelStateB_, this.stateB_);

};


/**
 * @private
 * @param {recoil.ui.ComponentWidgetHelper} helper
 */
aurora.widgets.Chat.prototype.updateState_ = function(helper) {
    if (helper.isGood()) {
        let audio = this.channelStateB_.get().audio;
        let video = this.channelStateB_.get().video;
        let state = this.stateB_.get().state;

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
        goog.style.setElementShown(this.remote_, state === aurora.widgets.Chat.State.inCall);
    }
};


/**
 * @private
 */
aurora.widgets.Chat.prototype.closeConnection_ = function() {
    if (this.peerConnection_) {
        this.peerConnection_.close();
        this.peerConnection_ = null;
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
 * @return {RTCPeerConnection}
 */
aurora.widgets.Chat.prototype.makePeerConnection_ = async function() {


    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    console.log('Received local stream');
    this.local_.srcObject = stream;
    let localStream = stream;


    const configuration = {};
    let pc = new RTCPeerConnection(configuration);
    pc.addEventListener('icecandidate', this.onIceCandidate.bind(this));
    pc.addEventListener('iceconnectionstatechange', this.onIceStateChange.bind(this));


    const gotRemoteStream = this.gotRemoteStream.bind(this);
    pc.addEventListener('track', gotRemoteStream);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

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
 * @param {string} partner
 */
aurora.widgets.Chat.prototype.addPendingIceCandidates_ = async function(partner) {
    let pc = this.peerConnection_;

    this.pendingIceCandidates_.forEach(function(v) {
        if (v.who == partner) {
            pc.addIceCandidate(v.candidate).then(() => 1, e => console.error(e));
        }
    });
    this.pendingIceCandidates_ = [];
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
    me.silence_();

    await me.peerConnection_.setRemoteDescription(obj.description);
    this.addPendingIceCandidates_(obj.who);

};

/**
 * @return {!recoil.frp.Behaviour}
 */
aurora.widgets.Chat.prototype.getState = function () {
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
    const offerOptions = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
    };
    let frp = this.scope_.getFrp();

    try {

        frp.accessTrans(function() {
            this.whoB_.set(name);
            this.channelStateB_.set(media);
        }.bind(this), this.channelStateB_, this.whoB_);

        //        const videoTracks = localStream.getVideoTracks();
        //        const audioTracks = localStream.getAudioTracks();
        this.peerConnection_ = await this.makePeerConnection_(undefined);

        const offer = await this.peerConnection_.createOffer(offerOptions);
        await this.peerConnection_.setLocalDescription(offer);
        let me = this;
        this.channel_.send({command: 'offer', description: offer, who: userid});

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
 */
aurora.widgets.Chat.prototype.answerCall_ = async function() {
    try {
        const configuration = {};
        let frp = this.scope_.getFrp();
        //    let state = null;
        let me = this;
        this.resetTimeout_();
        let state = frp.accessTrans(() => me.stateB_.get(), me.stateB_);

        this.peerConnection_ = await this.makePeerConnection_(state.caller.clientId);
        await this.peerConnection_.setRemoteDescription(state.caller.description);
        this.addPendingIceCandidates_();
        const answer = await this.peerConnection_.createAnswer();
        await this.peerConnection_.setLocalDescription(answer);

        let clientId = state.caller.requestClientId;
        this.channel_.send({command: 'answered', description: answer, who: state.caller.clientId});

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
            console.log('ICE state: ' + this.peerConnection_.iceConnectionState);
            console.log('ICE state change event: ', event);
        }
    }
};


/*

function peer(other, polite, fail = undefined) {
    if (!fail) fail = e => void send(window.parent, {error: `${e.name}: ${e.message}`});
    const send = (target, msg) => void target.postMessage(JSON.parse(JSON.stringify(msg)), '*');


    const log = str => void console.log(`[${polite ? 'POLITE' : 'IMPOLITE'}] ${str}`);
    const assert_equals = !window.assert_equals ?
          (a, b, msg) => a === b || void fail(new Error(`${msg} expected ${b} but got ${a}`)) :
          window.assert_equals;
    const pc = new RTCPeerConnection();


    const localVideo1 = document.getElementById('localVideo1');
    const localVideo2 = document.getElementById('localVideo2');
    const remoteVideo = document.getElementById('remoteVideo');
    const transceiversForSending = [];
    try {
        pc.ontrack = e => {
            log('ontrack');
            remoteVideo.srcObject = new MediaStream();
            remoteVideo.srcObject.addTrack(e.track);
        };
        pc.onicecandidate = ({candidate}) => void send(other, {candidate});

        let makingOffer = false;
        let ignoreOffer = false;
        let srdAnswerPending = false;
        pc.onnegotiationneeded = async () => {
            try {
                log('SLD due to negotiationneeded');
                assert_equals(pc.signalingState, 'stable', 'negotiationneeded always fires in stable state');
                assert_equals(makingOffer, false, 'negotiationneeded not already in progress');
                makingOffer = true;
                await pc.setLocalDescription();
                assert_equals(pc.signalingState, 'have-local-offer', 'negotiationneeded not racing with onmessage');
                assert_equals(pc.localDescription.type, 'offer', 'negotiationneeded SLD worked');
                send(other, {description: pc.localDescription});
            } catch (e) {
                fail(e);
            } finally {
                makingOffer = false;
            }
        };
        window.onmessage = async ({data: {description, candidate, run}}) => {
            try {
                if (description) {
                    // If we have a setRemoteDescription() answer operation pending, then
                    // we will be "stable" by the time the next setRemoteDescription() is
                    // executed, so we count this being stable when deciding whether to
                    // ignore the offer.
                    const isStable =
                          pc.signalingState == 'stable' ||
                          (pc.signalingState == 'have-local-offer' && srdAnswerPending);
                    ignoreOffer =
                        description.type == 'offer' && !polite && (makingOffer || !isStable);
                    if (ignoreOffer) {
                        log('glare - ignoring offer');
                        return;
                    }
                    srdAnswerPending = description.type == 'answer';
                    log(`SRD(${description.type})`);
                    await pc.setRemoteDescription(description);
                    srdAnswerPending = false;
                    if (description.type == 'offer') {
                        assert_equals(pc.signalingState, 'have-remote-offer', 'Remote offer');
                        assert_equals(pc.remoteDescription.type, 'offer', 'SRD worked');
                        log('SLD to get back to stable');
                        await pc.setLocalDescription();
                        assert_equals(pc.signalingState, 'stable', 'onmessage not racing with negotiationneeded');
                        assert_equals(pc.localDescription.type, 'answer', 'onmessage SLD worked');
                        send(other, {description: pc.localDescription});
                    } else {
                        assert_equals(pc.remoteDescription.type, 'answer', 'Answer was set');
                        assert_equals(pc.signalingState, 'stable', 'answered');
                        pc.dispatchEvent(new Event('negotiated'));
                    }
                } else if (candidate) {
                    try {
                        await pc.addIceCandidate(candidate);
                    } catch (e) {
                        if (!ignoreOffer) throw e;
                    }
                }
            } catch (e) {
                fail(e);
            }
    };
  } catch (e) {
    fail(e);
  }
  return pc;
}*/
