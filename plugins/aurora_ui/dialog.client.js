goog.provide('aurora.dialog.Dialog');


goog.require('goog.dom');


/**
 * @constructor
 * @param {Object} params this takes a structure that can have the following fields:
 *      hasCloseX: boolean
 *      heading: {message: string|Object, className: string}
 *      subHeading: {message: string|Object, className: string}
 *      body:
 *      overlay: boolean
 *      buttons: [{name: string, className: string, func: function}]
 *      autoClose: {close: boolean, timeOut: number}
 *      isModal: boolean
 *      closeCallback: function called closed if exists
 *      clickToClose : boolean (default true)
 *      headerIcon
 */
aurora.dialog.Dialog = function(params) {
    this.dialog_ = null;
    this.params_ = params;
    this.buttons_ = [];
    var thisPtr = this;
};

/**
 * @param {boolean} show
 */
aurora.dialog.Dialog.prototype.show = function(show) {
    var params = this.params_;
    var overlay = null;
    var me = this;
    var appendStringOrHtml = function(cont, message) {
        if (typeof(message) === 'string') {
            cont.innerHTML = message;
        }
        else {
            cont.appendChild(message);
        }
    };
    if (this.dialog_ !== null) {
        this.remove();
        if (this.keyListenerKey_)
        {
            goog.events.unlistenByKey(this.keyListenerKey_);
            this.keyListenerKey_ = null;
        }
    }
    if (show) {
        var dialogContainer_ = this.createElement_('div', 'dialogContainer');
        var dialog = document.createElement('div');
        dialog.className = 'dialog-box';

        dialog.onclick = function(e) {
            e.stopPropagation();
        };

        var headerDiv = this.createElement_('div', 'headerDiv');

        dialog.appendChild(headerDiv);

        var closeXBtn = null;
        var closeBtn = params.hasCloseX;
        if (closeBtn !== undefined && closeBtn !== null) {
            if (closeBtn) {
                // dialog.append('<div id="' + closeBtn.id + '" class="' + closeBtn.className + '">' + closeBtn.buttonText);

                closeXBtn = goog.dom.createDom('button', {class: 'close'}, 'x');
                headerDiv.appendChild(closeXBtn);
                goog.events.listen(closeXBtn, goog.events.EventType.CLICK, function() {
                    me.remove();
                });
            }

        }

        if (params.clickToClose === undefined || params.clickToClose) {
            // need to set a timeout because otherwise if a click opened this the document will recieve the click and close the dialog again
            setTimeout(function() {
                goog.events.listenOnce(document.body, goog.events.EventType.CLICK, function() {
                    me.remove();
                });
            }, 1);
        }

        if (params.headerIcon) {
            var headerIcon = goog.dom.createDom('div', {class: 'dialog-header-icon'});
            headerDiv.appendChild(headerIcon);
        }

        if (params.heading) {
            var header = this.createElement_('div', params.heading.className);
            if (typeof(params.heading.message) === 'string') {
                header.innerHTML = params.heading.message;
            }
            else {
                header.appendChild(params.heading.message);
            }
            headerDiv.appendChild(header);
        }

        // headerDiv.append('<hr/>');

        if (params.subHeading) {
            var subHeading = this.createElement_('div', params.subHeading.className);
            appendStringOrHtml(subHeading, params.subHeading.message);


            headerDiv.appendChild(subHeading);
        }

        if (params.overlay) {
            overlay = this.createElement_('div', 'dialog-overlay');
            dialogContainer_.appendChild(overlay);
        }

        if (params.body) {
            var bodyDiv = this.createElement_('div', 'bodyDiv');

            bodyDiv.appendChild(params.body);
            dialog.appendChild(bodyDiv);
        }

        if (params.bodyText) {
            var bodyText = this.createElement_('div', params.bodyText.className);
            bodyText.innerHTML = params.bodyText.message;
            dialog.appendChild(bodyText);
        }

        var defaultButton = undefined;
        if (params.buttons) {

            var footerDiv = this.createElement_('div', 'footerDiv');
            this.buttons_ = [];
            for (var i = 0; i < params.buttons.length; i++) {
                var button = goog.dom.createDom(
                    'button', {class: params.buttons[i].className}, params.buttons[i].name);
                footerDiv.appendChild(button);
                if (params.buttons[i].isDefault) {
                    defaultButton = params.buttons[i];
                }
                this.buttons_.push(button);
                footerDiv.appendChild(goog.dom.createDom('span', {class: 'default-button'}, button));
                goog.events.listen(button, goog.events.EventType.CLICK, params.buttons[i].func);
            }
            dialog.appendChild(footerDiv);
        }


        dialogContainer_.appendChild(dialog);
        this.dialog_ = dialogContainer_;
        document.body.appendChild(this.dialog_);

        if (params.autoClose) {
            if (params.autoClose.close === true) {
                window.setTimeout(function(e) {
                    me.remove();
                }, params.autoClose.timeOut);
            }
        }

        if (!params.isModal && dialogContainer_ !== null) {
            goog.events.listen(
                overlay === undefined ? window : overlay, goog.events.EventType.CLICK,

                function() {
                    me.remove();
                });
        }

        this.keyListener_ = function(e) {
            if (me.dialog_ !== null) {
                if (e.keyCode === 27 || e.keyCode === 13) {
                    if (e.keyCode === 13 && params.hasDefault === false) {
                        return;
                    }
                    if (defaultButton && e.keyCode === 13) {
                        defaultButton.func(e);
                    }
                    else if (params.finish && e.keyCode === 13) {

                        params.finish(e);
                    }
                    else {
                        me.remove();
                    }
                }
            }
        };

        this.keyListenerKey_ = goog.events.listen(document, goog.events.EventType.KEYUP, this.keyListener_);
    }
};
/**
 * @param {number} i
 * @param {boolean} enabled
 */
aurora.dialog.Dialog.prototype.enableButton = function(i, enabled) {
    this.buttons_[i].disabled = !enabled;
};

/**
 *
 * @param {string} type
 * @param {string} className
 * @return {Element}
 * @private
 */
aurora.dialog.Dialog.prototype.createElement_ = function(type, className) {
    var element = document.createElement(type);
    element.id = className;
    element.className = className;
    return element;
};

/**
 * removes this dialog
 */
aurora.dialog.Dialog.prototype.remove = function() {
    if (this.dialog_ === null) {
        return;
    }
    var params = this.params_;
    if (params && params.closeCallback) {
        params.closeCallback();
    }

    if (this.keyListenerKey_) {
        goog.events.unlistenByKey(this.keyListenerKey_);
        this.keyListenerKey_ = null;
    }
    this.dialog_.remove();
    this.dialog_ = null;
};

/**
 * hides the dialog
 */
aurora.dialog.Dialog.prototype.hide = function() {
    if (this.dialog_ === null) {
        return;
    }
    var params = this.params_;
    if (params && params.closeCallback) {
        params.closeCallback();
    }
    if (this.keyListenerKey_)
    {
        goog.events.unlistenByKey(this.keyListenerKey_);
        this.keyListenerKey_ = null;
    }
    goog.style.setElementShown(this.dialog_, false);
};

