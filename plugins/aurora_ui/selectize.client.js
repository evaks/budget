goog.provide('aurora.columns.Selectize');
goog.provide('aurora.widgets.Selectize');

goog.require('goog.fx.Animation');
goog.require('recoil.util');
/**
 * @constructor
 * @param {!aurora.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
aurora.widgets.Selectize = function(scope) {
    let createDom = goog.dom.createDom;
    let frp = scope.getFrp();
    let self = this;
    this.scope_ = scope;
    this.controlInput_ = createDom('input', {type: 'text', autocomplete: 'new-password'});
    this.errorDiv_ = createDom('div', {class:'recoil-error'});
    this.control_ = createDom('div', {class: 'selectize-input items'}, this.controlInput_);
    this.dropdownContent_ = createDom('div', {class: 'selectize-dropdown-content'});
    this.dropdown_ = createDom('div', {class: 'selectize-dropdown', style: 'display:none'}, this.dropdownContent_);
    this.wrapper_ = createDom('div', {class: 'selectize-control'}, this.control_, this.dropdown_, this.errorDiv_);
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.wrapper_);
    this.optionsHelper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.updateOptions_, function() {});

    this.activeB_ = frp.createB(new goog.structs.AvlTree(recoil.util.compare));
    this.caretB_ = frp.createB(/** @type {?number} */ (null));
    this.activeOptionB_ = frp.createB(/** @type {?} */ (null));
    this.userOptionsB_ = frp.createB(/** @type {!Array} */ ([]));

    this.curValues_ = [];
    this.curOptions_ = [];
    this.currentWidth_ = null;


    let on = function(el, obj) {
        for (let e in obj) {
            goog.events.listen(el, e, function() { obj[e].apply(this, arguments);});
        }
    };

    on(this.control_, {
        mousedown: function() { return self.onMouseDown.apply(self, arguments); },
        click: function() { return self.onClick.apply(self, arguments); }
    });

    on(this.controlInput_, {
        mousedown: function(e) { e.stopPropagation(); },
        keydown: function() { return self.onKeyDown.apply(self, arguments); },
        keyup: function() { return self.onKeyUp.apply(self, arguments); },
        resize: function() { self.positionDropdown.apply(self, []); },
        blur: function() { return self.onBlur.apply(self, arguments); },
        focus: function() { self.ignoreBlur = false; return self.onFocus.apply(self, arguments); },
        paste: function() { return self.onPaste.apply(self, arguments); }
    });

    let globalListners = [];
    globalListners.push(goog.events.listen(document, 'mousedown', function(e) {
        if (self.isFocused) {
            // prevent events on the dropdown scrollbar from causing the control to blur
            if (e.target === self.dropdown_ || e.target.parentNode === self.dropdown_) {
                return false;
            }
            // blur on click outside
            if (!goog.dom.contains(self.control_, e.target) && e.target !== self.control_) {
                self.finishCreate();
                self.blur(e.target);
            }
        }
        return undefined;
    }));
    let position = function() {
        if (self.isOpen) {
            self.positionDropdown.apply(self, arguments);
        }
    };
    globalListners.push(goog.events.listen(window, 'scroll', position));
    globalListners.push(goog.events.listen(window, 'resize', position));
    globalListners.push(goog.events.listen(window, 'mousemove', function() {
        self.ignoreHover = false;
    }));

    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_, function() {
        globalListners.forEach(goog.events.unlistenByKey);
    });
    this.autoGrow(this.controlInput_);
};

/**
 * @param {?} e
 * @return {boolean}
 */
aurora.widgets.Selectize.prototype.isCmd = function(e) {
    return !!e[goog.userAgent.MAC ? 'metaKey' : 'ctrlKey'];
};

/**
 * @param {?} e
 * @return {boolean}
 */
aurora.widgets.Selectize.prototype.isCtrl = function(e) {
    return !!e[goog.userAgent.MAC ? 'altKey' : 'ctrlKey'];
};


/**
 * takes a list old list of values in a parent and updates them in
 * an efficent way the order is maintained
 * @param {Element} parent
 * @param {!Array<{value:?, id: number, node:Element}>} oldValues
 * @param {!Array<?>} values
 * @param {function(?):Element} renderer something to create the new node
 * @param {Element=} opt_input
 * @return {!Array<{value:?, node:Element}>} new values to assign
 */
aurora.widgets.Selectize.updateValueList = function(parent, oldValues, values, renderer, opt_input) {
    let newValues = values.map(function(v) {
        return {value: v, node: null};
    });
    let newValuesMap = new goog.structs.AvlTree(recoil.util.object.compareKey);

    newValues.forEach(function(v) {
        newValuesMap.add({key: v.value, entry: v});
    });

    oldValues.forEach(function(v) {
        let newEntry = newValuesMap.findFirst({key: v.value, entry: null});
        if (newEntry) {
            newEntry.entry.node = v.node;
        }
        else {
            goog.dom.removeNode(v.node);
            v.node = null;
        }
    });
    let curEl = goog.dom.getFirstElementChild(parent);
    let seenInput = opt_input && curEl === opt_input;
    if (seenInput) {
       curEl = goog.dom.getNextElementSibling(curEl);
    }
    newValues.forEach(function(el, idx) {
        if (el.node) {
            if (curEl === el.node) {
                curEl = goog.dom.getNextElementSibling(curEl);
                if (opt_input && curEl === opt_input) {
                    seenInput = true;
                    curEl = goog.dom.getNextElementSibling(curEl);
                }

            } else {
                goog.dom.removeNode(el.node);
                goog.dom.insertChildAt(parent, el.node, idx);
            }
        }
        else {
            let item = renderer(el.value);
            el.node = item;
            goog.dom.insertChildAt(parent, item, idx);
        }
    });
    return newValues;
};

/**
 * @private
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 */
aurora.widgets.Selectize.prototype.updateOptions_ = function(helper) {
    let cl = goog.dom.classlist;
    let createDom = goog.dom.createDom;
    let self = this;
    if (helper.isGood()) {
        let settings = this.settingsB_.get();
        let inputMode = self.mode_();
        let hideSelected = settings.hideSelected === null ? inputMode === 'multi' : settings.hideSelected;
        let results = self.search(goog.string.trim(this.controlInput_.value), self.optionsB_.get());
        self.activeOption_ = null;
        let defOptionRenderer = function(opt) {
            if (opt === undefined) {
                console.log('undefined !!!');
            }
            return goog.dom.createTextNode(opt);
        };
	    goog.dom.classlist.enable(self.wrapper_, 'selectize-disabled', self.isDisabled_());
        let renderOption = function(v) {
            let outer = createDom('div', {class: 'option'}, (settings.optionRenderer || defOptionRenderer) (v));
            goog.events.listen(outer, 'mouseenter', function() { self.onOptionHover.apply(self, arguments); });
            goog.events.listen(outer, ['mousedown', 'click'], function() { return self.onOptionSelect.apply(self, arguments); });
            outer['data-value'] = v;
            if (settings.highlight && results.query.length && results.tokens.length) {
                for (let i = 0, n = results.tokens.length; i < n; i++) {
                    aurora.widgets.Selectize.highlight(outer, results.tokens[i].regex);
                }
            }
            return outer;
        };

        let valMap = new goog.structs.AvlTree(recoil.util.compare);
        self.valueB_.get().forEach(valMap.add.bind(valMap));
        let rawOpts = self.optionsB_.get();
        let options = results.items.filter(v => rawOpts.hasOwnProperty(v.id)).map(function(v) {
            return rawOpts[v.id];
        }).filter(function(v) {
            return hideSelected ? !valMap.findFirst(v) : true;
        });

        if (settings.maxOptions !== null) {
            options = options.slice(0, settings.maxOptions);
        }

        self.curOptions_ = aurora.widgets.Selectize.updateValueList(
            self.dropdownContent_, this.curOptions_,
            options, renderOption);

        let found = false;
        self.scope_.getFrp().accessTrans(function() {
            self.curOptions_.forEach(function(obj) {
                let isActive = recoil.util.isEqual(self.activeOptionB_.get(), obj.value);
                if (isActive) {
                    found = true;
                    self.activeOption_ = obj.node;
                }
                cl.enable(obj.node, 'active', isActive);
            });
            if (!found && self.curOptions_.length > 0 && self.isOpen) {
                self.activeOptionB_.set(self.curOptions_[0].value);
            }
        }, self.activeOptionB_);
    }
};
/**
 * @param {boolean} multi
 * @param {?} settings
 * @return {function (?):?}
 */
aurora.widgets.Selectize.prototype.renderValue_ = function (multi, settings) {
    let createDom = goog.dom.createDom;
    let self = this;
    if (multi) {
        return function (v) {
            let remove = createDom('a', {
                class: 'remove',
                title: 'Remove',
                tabindex: '-1',
                href: 'javascript:void(0)'}, 'x');
            
            let res = createDom('div', {class: 'item', 'data-value': v.id}, settings.renderer(v.value), remove);
            
            goog.events.listen(res, 'mousedown', function(e) {
                self.onItemSelect(e, v);
            });
            
            goog.events.listen(remove, 'mousedown', function(e) {
                self.deleteItem(v);
                e.preventDefault();
                e.stopPropagation();
            });
            
            res['data-value'] = v;
            return res;
        };
    }
    return function (v) {
        let res = createDom('div', {class: 'item', 'data-value': v.id}, settings.renderer(v.value));
        goog.events.listen(res, 'mousedown', function(e) {
            self.onItemSelect(e, v);
        });
        
        res['data-value'] = v;
        return res;
    };
};

/**
 * @private
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 */
aurora.widgets.Selectize.prototype.update_ = function(helper) {
    let cl = goog.dom.classlist;
    let createDom = goog.dom.createDom;
    let wrapperClasses = ['selectize-control'];
    let controlClasses = ['selectize-input', 'items', 'not-full', 'has-options', 'has-items'];
    let dropdownClasses = ['selectize-dropdown'];
    let me = this;
    let self = this;
    cl.set(me.control_, controlClasses.join(' '));
    goog.dom.removeChildren(this.errorDiv_);
    goog.style.setElementShown(this.errorDiv_, false);
    if (helper.isGood()) {
        let inputMode = me.mode_();

        let settings = this.settingsB_.get();

        if (inputMode === 'multi') {
            wrapperClasses.push('plugin-remove_button');
        }

        me.curValues_ = aurora.widgets.Selectize.updateValueList(
            this.control_, this.curValues_, this.uniqValueB_.get(),
            this.renderValue_(inputMode == 'multi', settings), this.controlInput_);
        me.curValues_.forEach(function(el) {
            cl.enable(el.node, 'active', !!self.activeB_.get().findFirst(el.value));
        });

        // controlInput can't be removed because it will loose focus move things around it

        let caretPos = self.calcCaret_();
        for (let i = 0; i < this.curValues_.length; i++) {
            if (i < caretPos) {
                this.control_.insertBefore(this.curValues_[i].node, this.controlInput_);
            }
            else {
                this.control_.insertBefore(this.curValues_[i].node, null);
            }
        }

        wrapperClasses.push(inputMode); // todo plugins
        dropdownClasses.push(inputMode);
        let isFull = settings.maxValues != null && settings.maxValues <= this.curValues_.length;

        cl.enable(me.control_, 'disabled', !settings.enabled.val());
        cl.enable(me.control_, 'focus', self.isFocused);
        cl.enable(me.control_, 'required', settings.required);
        cl.enable(me.control_, 'locked', !settings.enabled.val() || self.isLocked);
        cl.enable(me.control_, 'full', isFull);
        cl.enable(me.control_, 'not-full', !isFull);
        cl.enable(me.control_, 'input-active', self.isFocused && !self.isInputHidden);
        cl.enable(me.control_, 'dropdown-active', !self.isOpen);
        cl.enable(me.control_, 'has-options', self.curOptions_.length > 0);
        cl.enable(me.control_, 'has-items', this.curValues_.length > 0);




        self.controlInput_.removeAttribute('placeHolder');
        if (self.valueB_.get().length == 0 && settings.placeholder) {
            goog.dom.setProperties(this.controlInput_, {'placeholder': settings.placeholder});
        }
    }
    else {
        cl.enable(me.control_, 'disabled', true);

        let errors = helper.isGood() ? [] : helper.errors();
        goog.style.setElementShown(this.errorDiv_, errors.length > 0);
        errors.forEach(function(error) {
            var div = goog.dom.createDom('div', {class: 'error'}, goog.dom.createTextNode(error.toString()));
            div.onclick = function() {
                console.error('Error was', error);
            };
            me.errorDiv_.appendChild(
            div);
            
        });

    }

    cl.set(this.wrapper_, wrapperClasses.join(' '));
    cl.set(this.control_, controlClasses.join(' '));
    this.updateSize_();
};

/**
 * Removes the selected item.
 *
 * @param {Object} item
 * @return {boolean}
 */
aurora.widgets.Selectize.prototype.deleteItem = function(item) {
    var self = this;
    self.helper_.accessTrans(function() {
        let values = [];
        let activeItems = self.activeB_.get().clone();
        let caret = self.calcCaret_();

        activeItems.remove(item);

        let oldVals = self.uniqValueB_.get();
        let delIdx = null;
        values = oldVals.filter(function(v, idx) {
            if (v.id === item.id) {
                delIdx = idx;
                return false;
            }
            return true;
        });

        let caretPos = (delIdx < caret) ? caret - 1 : caret;

        self.setCaret(caretPos);

        self.uniqValueB_.set(values);
        self.activeB_.set(activeItems);

    });

    setTimeout(self.positionDropdown.bind(this), 1);
    return true;

};



/**
 * @return {number}
 */
aurora.widgets.Selectize.prototype.calcCaret_ = function() {
    let self = this;
    let pos = self.curValues_.length;
    this.helper_.accessTrans(function() {
        let settings = self.settingsB_.get();
        let single = settings.maxValues != null && settings.maxValues.length === 1;
        if (!single) {
            if (self.caretB_.get() !== null) {
                pos = Math.max(0, Math.min(pos, self.caretB_.get()));
            }
        }
    });
    return pos;
};
/**
 * @param {string} str
 * @param {Element} parent
 * @return {number}
 */
aurora.widgets.Selectize.measureString = function(str, parent) {
    if (!str) {
        return 0;
    }
    let createDom = goog.dom.createDom;

    var test = createDom('test', {}, str);
    goog.style.setStyle(test, {
        position: 'absolute',
        top: -99999,
        left: -99999,
        width: 'auto',
        padding: 0,
        whiteSpace: 'pre'
    });
    document.body.appendChild(test);

    var transferStyles = function($from, $to, properties) {
        var i, n, styles = {};
        for (i = 0, n = properties.length; i < n; i++) {
            styles[properties[i]] = goog.style.getStyle($from, properties[i]);
        }

        goog.style.setStyle($to, styles);
    };

    transferStyles(parent, test, [
        'letterSpacing',
        'fontSize',
        'fontFamily',
        'fontWeight',
        'textTransform'
    ]);

    var width = goog.style.getBounds(test).width;
    goog.dom.removeNode(test);

    return width;
};
/**
 * Sets up an input to grow horizontally as the user
 * types. If the value is changed manually, you can
 * trigger the "update" handler to resize:
 *
 * $input.trigger('update');
 *
 * @param {Element} input
 */
aurora.widgets.Selectize.prototype.autoGrow = function(input) {
    goog.events.listen(input, ['keyup', 'keydown', 'update', 'blur'], this.updateSize_.bind(this));
};

/**
 * @private
 * @param {goog.events.Event=} opt_e
 * @param {Object=} opt_options
 */
aurora.widgets.Selectize.prototype.updateSize_ = function(opt_e, opt_options) {
    let KeyCodes = goog.events.KeyCodes;
    var value, keyCode, printable, placeholder, width;
    var shift, character, selection;
    let self = this;
    let e = opt_e || window.event || {};
    let options = opt_options || {};
    let input = this.controlInput_;
    if (e.metaKey || e.altKey) return;
    self.helper_.accessTrans(function() {
        if (!options.force && self.settingsB_.get().grow === false) return;
        let oldVal = input.value;
        value = input.value;
        if (e.type && e.type.toLowerCase() === 'keydown') {
            keyCode = e.keyCode;
            printable = (
                (keyCode >= 97 && keyCode <= 122) || // a-z
                    (keyCode >= 65 && keyCode <= 90) || // A-Z
                    (keyCode >= 48 && keyCode <= 57) || // 0-9
                    keyCode === 32 // space
            );
            if (keyCode === KeyCodes.DELETE || keyCode === KeyCodes.BACKSPACE) {
                selection = {start: input.selectionStart, length: input.selectionEnd - input.selectionStart};
                if (selection.length) {
                        value = value.substring(0, selection.start) + value.substring(selection.start + selection.length);
                } else if (keyCode === KeyCodes.BACKSPACE && selection.start) {
                    value = value.substring(0, selection.start - 1) + value.substring(selection.start + 1);
                } else if (keyCode === KeyCodes.DELETE && typeof selection.start !== 'undefined') {
                    value = value.substring(0, selection.start) + value.substring(selection.start + 1);
                }
            } else if (printable) {
                shift = e.shiftKey;
                character = String.fromCharCode(e.keyCode);
                if (shift) character = character.toUpperCase();
                else character = character.toLowerCase();
                value += character;
            }
        }
        placeholder = input.getAttribute('placeholder');
        if (!value && placeholder) {
            value = placeholder;
        }


        // we need the width of the widest char because the input box must be at least that wide otherwise it
        // shuffles the text to the left then resizes this causes it to jitter

        width = aurora.widgets.Selectize.measureString(value + 'M', input);

        if (width === self.currentWidth_) {
            return;
        }
        self.oldVal_ = value;
        self.currentWidth_ = width;

        goog.style.setWidth(input, width);
        self.positionDropdown();

    });
};

/**
 * Triggered when the main control element
 * has a click event.
 *
 * @param {!goog.events.Event} e
 */
aurora.widgets.Selectize.prototype.onClick = function(e) {
    let self = this;
    // necessary for mobile webkit devices (manual focus triggering
    // is ignored unless invoked within a click event)
    if (self.mode_() === 'single' && !self.isInputHidden) {
        self.controlInput_.focus();
    }
    if (!self.isFocused) {
        self.focus();
        e.preventDefault();
    }
};

/**
 * Triggered when the main control element
 * has a mouse down event.
 *
 * @param {!goog.events.Event} e
 * @return {boolean|undefined}
 */
aurora.widgets.Selectize.prototype.onMouseDown = function(e) {
    let self = this;
    let defaultPrevented = e.defaultPrevented;
    if (self.isFocused) {
        // retain focus by preventing native handling. if the
        // event target is the input it should not be modified.
        // otherwise, text selection within the input won't work.
        if (e.target !== self.controlInput_) {
            if (self.mode_() === 'single') {
                // toggle dropdown
                self.isOpen ? self.close() : self.open();
            } else if (!defaultPrevented) {
                self.helper_.accessTrans(function() {
                    self.activeB_.set(new goog.structs.AvlTree(recoil.util.compare));
                });
            }
            return false;
        }
    } else {
        // give control focus
        if (!defaultPrevented) {
            window.setTimeout(function() {
                self.focus();
            }, 0);
        }
    }
    return undefined;
};

/**
 * Triggered on <input> paste.
 *
 * @param {Object} e
 */
aurora.widgets.Selectize.prototype.onPaste = function(e) {
    let self = this;
    if (self.isFull() || self.isInputHidden || self.isLocked) {
        e.preventDefault();
    } else {
        // If a regex or string is included, this will split the pasted
        // input and create Items for each separate value
        self.helper_.accessTrans(function() {
            let settings = self.settingsB_.get();
            if (settings.splitOn) {
                setTimeout(function() {
                    let splitInput = goog.string.trim(self.controlInput_.value || '').split(settings.splitOn);
                    for (let i = 0, n = splitInput.length; i < n; i++) {
                        self.createItem(splitInput[i]);
                    }
                }, 0);
            }
        });
    }
};

/**
 * Triggered on <input> keydown.
 *
 * @param {Object} e
 */
aurora.widgets.Selectize.prototype.onKeyDown = function(e) {
    let KeyCodes = goog.events.KeyCodes;
    let isInput = e.target === this.controlInput_;
    let self = this;
    if (self.isLocked) {
        if (e.keyCode !== KeyCodes.TAB) {
            e.preventDefault();
        }
        return;
    }
    let frp = this.scope_.getFrp();

    switch (e.keyCode) {
    case KeyCodes.A:
        if (self.isCmd(e)) {
            self.selectAll();
            return;
        }
        break;
    case KeyCodes.ESC:
        if (self.isOpen) {
            e.preventDefault();
            e.stopPropagation();
            self.close();
        }
        return;
    case KeyCodes.N:
        if (!e.ctrlKey || e.altKey) break;
    case KeyCodes.DOWN:
        self.helper_.accessTrans(function() {
            if (!self.isOpen && self.hasOptions) {
                self.open();
            } else if (self.activeOptionB_.get() !== null) {
                self.ignoreHover = true;
                let $next = self.getAdjacentOption(self.activeOptionB_.get(), 1);
                if ($next) self.setActiveOption($next, true);
            }
        });
        e.preventDefault();
        return;
    case KeyCodes.P:
        if (!e.ctrlKey || e.altKey) break;
    case KeyCodes.UP:
        self.helper_.accessTrans(function() {
            if (self.activeOptionB_.get()) {
                self.ignoreHover = true;
                let $prev = self.getAdjacentOption(self.activeOptionB_.get(), -1);
                if ($prev) self.setActiveOption($prev, true);
            }
        });
        e.preventDefault();
        return;
    case KeyCodes.ENTER:
        if (self.isOpen && self.activeOption_) {
            self.onOptionSelect({currentTarget: self.activeOption_});
            e.preventDefault();
        } else if (self.canCreate(self.controlInput_.value)) {
            let res = self.createItem(self.controlInput_.value);
            if (res) {
                frp.accessTrans(function() {
                    self.setActiveOption(res, true);
                }, self.activeOptionB_);
                //                self.optionsHelper_.forceUpdate();
            }
            e.preventDefault();
        }
        return;
    case KeyCodes.LEFT:
        self.advanceSelection(-1, e);
        return;
    case KeyCodes.RIGHT:
        self.advanceSelection(1, e);
        return;
    case KeyCodes.TAB:
        self.helper_.accessTrans(function() {
            let settings = self.settingsB_.get();
            if (settings.selectOnTab && self.isOpen && self.activeOption_) {
                self.onOptionSelect({currentTarget: self.activeOption_});

                // Default behaviour is to jump to the next field, we only want this
                // if the current field doesn't accept any more entries
                if (!self.isFull()) {
                    e.preventDefault();
                }
            }
            if (settings.create && self.createItem(null)) {
                e.preventDefault();
            }
        });
        return;
    case KeyCodes.BACKSPACE:
    case KeyCodes.DELETE:
        self.deleteSelection(e);
        return;
    }

    if ((self.isFull() || self.isInputHidden) && !(goog.userAgent.MAC ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        return;
    }
};

/**
 * Triggered on <input> keyup.
 *
 * @param {Object} e
 * @return {boolean|undefined}
 */
aurora.widgets.Selectize.prototype.onKeyUp = function(e) {
    let self = this;
    if (self.isLocked) return e && e.preventDefault();

    let value = self.controlInput_.value || '';
    if (self.lastValue !== value) {
        if (goog.dom.getActiveElement(document) !== self.controlInput_) {
            // wierd chrome bug sends the key up event to us, even though no key
            // was presses this blocks that if the input doesn't have focus
            console.log('keyup blocked', self.lastValue, value);
        }
        else {

            self.lastValue = value;
            self.onSearchChange(value);
        }
    }
    return undefined;
};

/**
 * Invokes the user-provide option provider / loader.
 *
 * Note: this function is debounced in the Selectize
 * constructor (by `settings.loadDelay` milliseconds)
 *
 * @param {string} value
 */
aurora.widgets.Selectize.prototype.onSearchChange = function(value) {
    this.optionsHelper_.forceUpdate();
};

/**
 * @private
 * @return {boolean}
 */
aurora.widgets.Selectize.prototype.isDisabled_ = function() {
    let self = this;
    return this.helper_.accessTrans(function() {
        let settings = self.settingsB_.get();
        return !settings.enabled.val();
    }, true);

};
/**
 * @private
 */
aurora.widgets.Selectize.prototype.triggerDropdown_ = function() {
    let self = this;
    self.helper_.accessTrans(function() {
        if (self.curOptions_.length > 0 || self.canCreate(goog.string.trim(self.controlInput_.value))) {
            self.open();
        } else {
            if (self.isOpen) { self.close(); }
        }
    });
};

/**
 * Triggered on <input> focus.
 *
 * @param {Object=} opt_e
 * @return {boolean|undefined}
 */
aurora.widgets.Selectize.prototype.onFocus = function(opt_e) {
    let self = this;
    let wasFocused = self.isFocused;

    if (this.isDisabled_()) {
        self.blur(null);
        opt_e && opt_e.preventDefault();
        return false;
    }

    if (self.ignoreFocus) {
        return undefined;
    }
    self.isFocused = true;

    this.helper_.accessTrans(function() {
        if (!self.activeB_.get().getCount()) {
            self.showInput();
            self.activeB_.set(new goog.structs.AvlTree(recoil.util.compare));
            let active = self.curOptions_.length ? self.curOptions_[0].value : null;
            if (self.activeOptionB_.get() === null) {
                self.activeOptionB_.set(active);
            }
            if (self.settingsB_.get().openOnFocus) {
                self.triggerDropdown_();
            }
        }
    });
    return undefined;
};

/**
 * Triggered on <input> blur.
 *
 * @param {Object} e
 * @param {Element} dest
 */
aurora.widgets.Selectize.prototype.onBlur = function(e, dest) {
    let self = this;
    if (!self.isFocused) return;
    self.isFocused = false;

    if (self.ignoreFocus) {
        console.log("ignoring focus", dest);
        return;
    } else if (!self.ignoreBlur && document.activeElement === self.dropdownContent_) {
        // necessary to prevent IE closing the dropdown when the scrollbar is clicked
        console.log("drop down", dest);
        self.ignoreBlur = true;
        self.onFocus(e);
        return;
    }
    console.log("dest", dest);

    let deactivate = function() {
        
        self.close();
        self.setTextboxValue('');
        self.helper_.accessTrans(function() {
            self.activeB_.set(new goog.structs.AvlTree(recoil.util.compare));
            self.activeOptionB_.set(null);
            self.setCaret(self.valueB_.get().length);
        });

        // IE11 bug: element still marked as active
        if (dest) {
            (dest || document.body).focus();
        }
        self.ignoreFocus = false;
    };

    self.helper_.accessTrans(function() {
        self.ignoreFocus = true;
        let settings = self.settingsB_.get();
        if (settings.create && settings.createOnBlur) {
            self.createItem(null);
        }
    });
    setTimeout(() => {
        deactivate();
    }, 1);

};

/**
 * Triggered when the user rolls over
 * an option in the autocomplete dropdown menu.
 *
 * @param {!goog.events.Event} e
 */
aurora.widgets.Selectize.prototype.onOptionHover = function(e) {
    if (this.ignoreHover) {
        return;
    }
    this.setActiveOption(e.currentTarget['data-value'], true);
};

/**
 * Triggered when the user clicks on an option
 * in the autocomplete dropdown menu.
 *
 * @param {{currentTarget: Element}|!goog.events.Event} e
 */
aurora.widgets.Selectize.prototype.onOptionSelect = function(e) {
    let value, $option, self = this;

    if (e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }

    self.helper_.accessTrans(function() {
        let target = /** @type {Element} */ (e.currentTarget);
        let settings = self.settingsB_.get();
        if (goog.dom.classlist.contains(target, 'create')) {
            self.createItem(null);
            if (settings.closeAfterSelect) {
                self.close();
            }
        } else {
            value = target['data-value'];
            if (typeof value !== 'undefined') {
                self.lastQuery = null;
                self.setTextboxValue('');
                self.addItem(value);
                if (settings.closeAfterSelect) {
                    self.close();
                } else if (!settings.hideSelected && e.type && /mouse/.test(e.type)) {
                    self.setActiveOption(value);
                }
            }
        }
    });
    setTimeout(self.positionDropdown.bind(this), 1);

};

/**
 * Triggered when the user clicks on an item
 * that has been selected.
 *
 * @param {!goog.events.Event} e
 * @param {?} value
 */
aurora.widgets.Selectize.prototype.onItemSelect = function(e, value) {
    let self = this;

    if (self.isLocked) return;
    if (self.mode_() === 'multi') {
        e.preventDefault();
        self.extendActiveItems(value, e);
    }
};

/**
 * Sets the input field of the control to the specified value.
 *
 * @param {string} value
 */
aurora.widgets.Selectize.prototype.setTextboxValue = function(value) {
    let input = this.controlInput_;
    let changed = input.value !== value;
    if (changed) {
        input.value = value;
        this.lastValue = value;
        this.optionsHelper_.forceUpdate();
    }
};

/**
 * Sets the selected item.
 *
 * @param {Array<?>} items
 */
aurora.widgets.Selectize.prototype.setActiveItems = function(items) {
    let self = this;
    self.helper_.accessTrans(function() {
        if (self.mode_() === 'single') return;

        let active = self.activeB_.get().clone();
        // clear the active selection
        if (!items.length) {
            self.activeB_.set(new goog.structs.AvlTree(recoil.util.compare));
            if (self.isFocused) {
                self.showInput();
            }
            return;
        }
        else {
            active = goog.structs.AvlTree.fromList(items, recoil.util.compare);
            self.activeB_.set(active);
        }
    });
};

/**
 * Sets the selected item.
 *
 * @param {?} item
 * @param {!goog.events.Event} e
 */
aurora.widgets.Selectize.prototype.extendActiveItems = function(item, e) {
    // modify selection
    let self = this;
    if (self.mode_() === 'single') return;

    let eventName = e.type.toLowerCase();

    self.helper_.accessTrans(function() {
        let activeMap = self.activeB_.get().clone();
        if (eventName === 'mousedown' && e.shiftKey && activeMap.getCount()) {

            let last = null;
            let values = self.valueB_.get();
            let begin = values.length - 1;
            for (; begin >= 0; begin--) {
                last = activeMap.findFirst(values[begin]);
                if (last) {
                    break;
                }
            }
            let end = goog.array.findIndex(values, function(v) {return recoil.util.isEqual(item, v);});
            if (begin > end) {
                let swap = begin;
                begin = end;
                end = swap;
            }
            for (let i = begin; i <= end; i++) {
                let item = values[i];

                if (!activeMap.findFirst(item)) {
                    activeMap.add(item);
                }
            }
            self.activeB_.set(activeMap);
            e.preventDefault();
        } else if ((eventName === 'mousedown' && self.isCtrl(e)) || (eventName === 'keydown' && e.shiftKey)) {
            if (activeMap.findFirst(item)) {
                activeMap.remove(item);
            } else {
                activeMap.add(item);
            }

            self.activeB_.set(activeMap);

        } else {
            self.activeB_.set(goog.structs.AvlTree.fromList([item]));
        }

        // ensure control has focus
        self.hideInput();
        if (!self.isFocused) {
            self.focus();
        }
    });
};
/**
 * @private
 */
aurora.widgets.Selectize.prototype.clearScrollAnimate_ = function() {
    let self = this;
    if (self.scrollAniTimeout_) {
        clearTimeout(self.scrollAniTimeout_);
    }
    if (self.animate) {
        self.animate.dispose();
        self.animate = null;
    }
};

/**
 * Sets the selected item in the dropdown menu
 * of available options.
 *
 * @param {Object} option
 * @param {boolean=} opt_scroll
 */
aurora.widgets.Selectize.prototype.setActiveOption = function(option, opt_scroll) {
    let height_menu, height_item, y;
    let scroll_top, scroll_bottom;
    let self = this;

    
    self.helper_.accessTrans(function() {
        self.activeOptionB_.set(option);
        let settings = self.settingsB_.get();
        if (opt_scroll) {
            self.clearScrollAnimate_();
            self.scrollAniTimeout_ = setTimeout(function() {
                self.clearScrollAnimate_();
                if (!self.activeOption_) {
                    return;
                }
                let dropdownBounds = goog.style.getBounds(self.dropdownContent_);
                let activeBounds = goog.style.getBounds(self.activeOption_);
                height_menu = dropdownBounds.height;
                height_item = activeBounds.height;
                let scroll = self.dropdownContent_.scrollTop || 0;
                y = activeBounds.top - dropdownBounds.top + scroll;
                scroll_top = y;
                scroll_bottom = y - height_menu + height_item;
                let scrollTo = null;

                let doAnimate = function(pos)  {
                    self.clearScrollAnimate_();
                    self.animate = new goog.fx.Animation([self.dropdownContent_.scrollTop], [pos], settings.scrollDuration || 0);
                    goog.events.listen(self.animate, goog.fx.Animation.EventType.ANIMATE, function(e) {
                        self.dropdownContent_.scrollTop = e.coords[0];
                    });
                    goog.events.listen(self.animate, goog.fx.Animation.EventType.FINISH, function(e) {
                        self.dropdownContent_.scrollTop = e.coords[0];
                    });
                    self.animate.play();
                };
                if (y + height_item > height_menu + scroll) {
                    doAnimate(scroll_bottom);
                } else if (y < scroll) {
                    doAnimate(scroll_top);
                }
            }, 1);
        }
    });



};

/**
 * Selects all items (CTRL + A).
 */
aurora.widgets.Selectize.prototype.selectAll = function() {
    let self = this;
    self.helper_.accessTrans(function() {

        if (self.mode_() === 'single') return;
        let active = goog.structs.AvlTree.fromList(self.valueB_.get());
        self.activeB_.set(active);

        if (active.getCount()) {
            self.hideInput();
            self.close();
        }
        self.focus();
    });
};

/**
 * Hides the input element out of view, while
 * retaining its focus.
 */
aurora.widgets.Selectize.prototype.hideInput = function() {
    let self = this;

    self.setTextboxValue('');
    goog.style.setStyle(self.controlInput_, {opacity: 0, position: 'absolute', left: (self.rtl ? 10000 : -10000) + 'px'});
    self.isInputHidden = true;
};

/**
 * Restores input visibility.
 */
aurora.widgets.Selectize.prototype.showInput = function() {
    goog.style.setStyle(this.controlInput_, {opacity: 1, position: 'relative', left: 0});
    this.isInputHidden = false;
};

/**
 * Gives the control focus.
 */
aurora.widgets.Selectize.prototype.focus = function() {
    let self = this;
    if (self.isDisabled_()) return;
    self.ignoreFocus = true;
    self.controlInput_.focus();
    window.setTimeout(function() {
        self.ignoreFocus = false;
        self.onFocus();
    }, 0);
};

/**
 * Forces the control out of focus.
 *
 */
aurora.widgets.Selectize.prototype.finishCreate = function() {
    let frp = this.scope_.getFrp();

    let self = this;
    // for now since I can't test only do it for single
    let inputMode = self.mode_();

    if (inputMode == 'single' && self.canCreate(self.controlInput_.value)) {
        let res = self.createItem(self.controlInput_.value);
        if (res) {
            frp.accessTrans(function() {
                self.setActiveOption(res, true);
            }, self.activeOptionB_);
            //                self.optionsHelper_.forceUpdate();
        }
    }
};


/**
 * Forces the control out of focus.
 *
 * @param {Element} dest
 */
aurora.widgets.Selectize.prototype.blur = function(dest) {
    this.controlInput_.blur();
    this.onBlur(null, dest);
};

/**
 * Returns a function that scores an object
 * to show how good of a match it is to the
 * provided query.
 *
 * @param {string} query
 * @return {function(?):number}
 */
aurora.widgets.Selectize.prototype.getScoreFunction = function(query) {
    let self = this;
    return self.helper_.accessTrans(function() {
        let sifter = new aurora.widgets.Sifter(self.getSearchOptions(), {diacritics: self.settingsB_.get().diacritics});
        sifter.getScoreFunction(query, this.getSearchOptions());
    }, function() {return 0;});

};

/**
 * Determines the current selection within a text input control.
 * Returns an object containing:
 *   - start
 *   - length
 *
 * @param {Object} input
 * @return {?{start:number, length:number}}
 */
aurora.widgets.Selectize.getSelection = function(input) {
    if ('selectionStart' in input) {
        return {start: input.selectionStart, length: input.selectionEnd - input.selectionStart};
    } else if (document.selection) {
        input.focus();
        var sel = document.selection.createRange();
        var selLen = document.selection.createRange().text.length;
        sel.moveStart('character', -input.value.length);

        return {start: sel.text.length - selLen, length: selLen};
    }
    else {
        return null;
    }
};

/**
 * Returns search options for sifter (the system
 * for scoring and sorting results).
 *
 * @see https://github.com/brianreavis/sifter.js
 * @return {Object}
 */
aurora.widgets.Selectize.prototype.getSearchOptions = function() {
    let self = this;
    return self.helper_.accessTrans(function() {
        let settings = self.settingsB_.get();
        let sort = settings.sortField;
        if (typeof sort === 'string') {
            sort = [{field: sort}];
        }

        return {
            fields: [settings.searchFunc],
            conjunction: settings.searchConjunction,
            sort: sort
        };
    });
};

/**
 * Searches through available options and returns
 * a sorted array of matches.
 *
 * Returns an object containing:
 *
 *   - query {string}
 *   - tokens {Array}
 *   - total {int}
 *   - items {Array}
 *
 * @param {string} query
 * @param {Array} options
 * @return {Object}
 */
aurora.widgets.Selectize.prototype.search = function(query, options) {
    let self = this;
    let result = null;
    this.helper_.accessTrans(function() {
        let i, value, score, calculateScore;
        let settings = self.settingsB_.get();
        let options = self.getSearchOptions();

        // validate user-provided result scoring function
        if (settings.score) {
            calculateScore = settings.score.apply(this, [query]);
            if (typeof calculateScore !== 'function') {
                throw new Error('Selectize "score" setting must be a function that returns a function');
            }
        }

        // perform search
        if (query !== self.lastQuery) {
            self.lastQuery = query;
            let sifter = new aurora.widgets.Sifter(self.optionsB_.get(), {diacritics: settings.diacritics});
            result = sifter.search(query, Object.assign({}, options, {score: calculateScore}));
            self.currentResults = result;
        } else {
            result = Object.assign({}, self.currentResults);
        }
    });

    return result;
};

/**
 * Returns the jQuery element of the next or
 * previous selectable option.
 *
 * @param {?} option
 * @param {number} direction  can be 1 for next or -1 for previous
 * @return {?}
 */
aurora.widgets.Selectize.prototype.getAdjacentOption = function(option, direction) {
    let index = -1;
    let options = [];
    let self = this;
    index = goog.array.findIndex(self.curOptions_, function(v) {return recoil.util.isEqual(v.value, option);}) + direction;
    return index >= 0 && index < self.curOptions_.length ? self.curOptions_[index].value : null;
};
/**
 * "Selects" multiple items at once. Adds them to the list
 * at the current caret position.
 *
 * @param {!Array<?>} items
 */
aurora.widgets.Selectize.prototype.addItems = function(items) {
    let self = this;
    this.helper_.accessTrans(function() {
        for (let i = 0, n = items.length; i < n; i++) {
            self.isPending = (i < n - 1);
            self.addItem(items[i]);
        }
    });
};

/**
 * "Selects" an item. Adds it to the list
 * at the current caret position.
 *
 * @param {string} value
 */
aurora.widgets.Selectize.prototype.addItem = function(value) {
    let self = this;
    self.helper_.accessTrans(function() {

        let inputMode = self.mode_();
        let values = goog.array.clone(self.valueB_.get());
        let index = goog.array.findIndex(values, function(v) {return recoil.util.isEqual(v, value);});
        if (index !== -1) {
            if (inputMode === 'single') {
                self.close();
            }
            return;
        }

        if (inputMode === 'single') {
            values = [];
        }
        let settings = self.settingsB_.get();
        let isFull = settings.maxValues != null && settings.maxValues <= values.length;

        if (inputMode === 'multi' && isFull) {
            return;
        }
        let caretPos = self.calcCaret_();
        values.splice(caretPos, 0, value);
        self.caretB_.set(caretPos + 1);
        self.valueB_.set(values);
    });
};

/**
 * Invokes the `create` method provided in the
 * selectize options that should provide the data
 * for the new item, given the user input.
 *
 * Once this completes, it will be added
 * to the item list.
 *
 * @param {?string} value
 * @return {?}
 */
aurora.widgets.Selectize.prototype.createItem = function(value) {
    let self = this;
    let caret = self.calcCaret_();
    
    if (value === null) {
        // get the value from the input box
        value = self.controlInput_.value;
        if (value.trim().length == 0) {
            return null;
        }
    }
    return this.helper_.accessTrans(function() {
        let create = self.settingsB_.get().create;
        if (create) {
            let data = create(value);
            self.setTextboxValue('');
            // only add to options if not already present
            let options = self.userOptionsB_.get();
            self.userOptionsB_.set([data].concat(options));
            self.setCaret(caret);
            self.addItem(data);
            return data;
        }
        return null;

    });

};

/**
 * Determines whether or not more items can be added
 * to the control without exceeding the user-defined maximum.
 *
 * @return {boolean}
 */
aurora.widgets.Selectize.prototype.isFull = function() {
    let res = false;
    let self = this;
    this.helper_.accessTrans(function() {
        let settings = self.settingsB_.get();
        res = settings.maxValues !== null && self.valueB_.get().length >= settings.maxValues;
    });
    return res;
};

/**
 * Shows the autocomplete dropdown containing
 * the available options.
 */
aurora.widgets.Selectize.prototype.open = function() {
    var self = this;

    if (self.isLocked || self.isOpen || (self.mode_() === 'multi' && self.isFull())) {
        return;
    }
    self.focus();
    self.isOpen = true;
    // todo self.refreshState();
    goog.style.setStyle(self.dropdown_, {visibility: 'hidden', display: 'block'});
    self.positionDropdown();
    goog.style.setStyle(self.dropdown_, {visibility: 'visible'});
};

/**
 * Closes the autocomplete dropdown menu.
 */
aurora.widgets.Selectize.prototype.close = function() {
    var self = this;
    var trigger = self.isOpen;
    self.helper_.accessTrans(function() {
        if (self.mode_() === 'single' && self.valueB_.get().length) {
            self.hideInput();
        }


        self.isOpen = false;
        goog.style.setStyle(self.dropdown_, {visibility: 'hidden'});
        self.activeOptionB_.set(null);
    });
};

/**
 * Calculates and applies the appropriate
 * position of the dropdown.
 */
aurora.widgets.Selectize.prototype.positionDropdown = function() {
    let self = this;
    var $control = this.control_;
    self.helper_.accessTrans(function() {
        var offset = goog.style.getBounds(self.control_);
        offset.top += offset.height;
        goog.style.setWidth(self.dropdown_, offset.width);
        /* doesn't work messes with stuff
          goog.style.setStyle(self.dropdown_, {
            top: (offset.top + offset.height) +'px' ,
            left: offset.left
        });*/
    });
};

/**
 * Removes the current selected item(s).
 *
 * @param {Object} e
 * @return {boolean}
 */
aurora.widgets.Selectize.prototype.deleteSelection = function(e) {
    var i, n, direction, selection, values, option_select, $option_select, $tail;
    var self = this;
    let KeyCodes = goog.events.KeyCodes;
    self.helper_.accessTrans(function() {
        let settings = self.settingsB_.get();
        direction = (e && e.keyCode === KeyCodes.BACKSPACE) ? -1 : 1;
        selection = aurora.widgets.Selectize.getSelection(self.controlInput_);

        if (self.activeOptionB_.get() && !settings.hideSelected) {
            option_select = self.getAdjacentOption(self.activeOptionB_.get(), -1);
        }

        // determine items that will be removed
        let activeItems = self.activeB_.get();
        let values = [];
        if (activeItems.getCount()) {
            let caret = self.calcCaret_();
            if (direction > 0) { caret++; }
            let adj = 0;
            self.uniqValueB_.get().forEach(function(v, idx) {
                if (!activeItems.findFirst(v)) {
                    values.push(v.value);
                }
                else if (idx < caret) {
                    adj++;
                }

            });

            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            self.setCaret(Math.max(0, Math.min(values.length, caret - adj)));

        } else if ((self.isFocused || self.mode_() === 'single') && self.valueB_.get().length) {
            let oldValues = self.valueB_.get();
            let caret = self.calcCaret_();
            if (direction < 0 && selection.start === 0 && selection.length === 0) {
                values = oldValues.filter(function(v, idx) {return idx != caret - 1;});
                caret = Math.max(caret - 1, 0);
                self.setCaret(caret);
            } else if (direction > 0 && selection.start === self.controlInput_.value.length) {
                values = oldValues.filter(function(v, idx) {return idx != caret;});
            }
            else {
                // do nothing
                values = oldValues;
            }
        }
        activeItems = activeItems.clone();
        activeItems.clear();

        // select previous option
        if (option_select) {
            activeItems.add(option_select);
            self.activeOptionB_.set(option_select);
        }
        self.valueB_.set(values);
        self.activeB_.set(activeItems);

    });
    setTimeout(self.positionDropdown.bind(this), 1);
    return true;
};

/**
 * Selects the previous / next item (depending
 * on the `direction` argument).
 *
 * > 0 - right
 * < 0 - left
 *
 * @param {number} direction
 * @param {Object} e
 */
aurora.widgets.Selectize.prototype.advanceSelection = function(direction, e) {
    var tail, selection, idx, valueLength, cursorAtEdge, $tail;
    var self = this;
    self.helper_.accessTrans(function() {
        if (direction === 0) return;
        if (self.rtl) direction *= -1;

        tail = direction > 0 ? 'last' : 'first';
        selection = aurora.widgets.Selectize.getSelection(self.controlInput_);

        if (self.isFocused && !self.isInputHidden) {
            valueLength = self.controlInput_.value.length;
            cursorAtEdge = direction < 0
                ? selection.start === 0 && selection.length === 0
                : selection.start === valueLength;

            if (cursorAtEdge && !valueLength) {
                self.advanceCaret(direction, e);
            }
        } else {
            let values = direction > 0 ? self.valueB_.slice(0).reverse() : self.valueB_.get();
            let active = self.activeB_.get();
            let idx = null;
            if (direction > 0) {

                for (let i = 0; i < values.length; i++) {
                    if (active.findFirst(values[i])) {
                        let idx = direction > 0 ? values.length - i - 1 : i;
                        self.setCaret(direction > 0 ? idx + 1 : idx);
                        self.activeB_.set(new goog.structs.AvlTree(recoil.util.compare));
                        break;
                    }
                }
            }
        }
    });
};

/**
 * Moves the caret left / right.
 *
 * @param {number} direction
 * @param {Object} e (optional)
 */
aurora.widgets.Selectize.prototype.advanceCaret = function(direction, e) {
    var self = this, fn, $adj;

    if (direction === 0) return;
    self.helper_.accessTrans(function() {
        fn = direction > 0 ? 'next' : 'prev';
        if (e.shiftKey) {
            let caret = self.calcCaret_();
            let values = self.valueB_.get();
            if (self.isInputHidden) {
                let pos = caret;
                if (direction > 0) {

                    pos = Math.max(0, Math.min(values.length, caret + direction));

                }
                self.showInput();
                self.activeB_.set(new goog.structs.AvlTree(recoil.util.compare));
                self.caretB_.set(pos);
                e && e.preventDefault();
            }
            else {
                let pos = caret;

                if (direction < 0) {
                    pos = Math.min(values.length, caret + direction);
                }

                if (pos >= 0 && pos < values.length) {
                    self.activeB_.set(goog.structs.AvlTree.fromList([values[pos]]));
                    self.hideInput();
                    self.caretB_.set(pos);
                    e && e.preventDefault();
                }


            }
        } else {
            self.setCaret(self.calcCaret_() + direction);
        }
    });
};

/**
 * Moves the caret to the specified index.
 *
 * @param {number} i
 */
aurora.widgets.Selectize.prototype.setCaret = function(i) {
    var self = this;
    self.helper_.accessTrans(function() {
        self.caretB_.set(i);
    });
};

/**
 * Disables user input on the control. Used while
 * items are being asynchronously created.
 */
aurora.widgets.Selectize.prototype.lock = function() {
    this.close();
    this.isLocked = true;
};

/**
 * Re-enables user input on the control.
 */
aurora.widgets.Selectize.prototype.unlock = function() {
    this.isLocked = false;
};


/**
 * Determines whether or not to display the
 * create item prompt, given a user input.
 *
 * @param {string} input
 * @return {boolean}
 */
aurora.widgets.Selectize.prototype.canCreate = function(input) {
    var self = this;
    return self.helper_.accessTrans(function() {
        let settings = self.settingsB_.get();
        if (!settings.create) return false;
        var filter = settings.createFilter;
        return input.length
            && (typeof filter !== 'function' || filter.apply(self, [input]))
            && (typeof filter !== 'string' || new RegExp(filter).test(input))
            && (!(filter instanceof RegExp) || filter.test(input));
    }, false);
};

/**
 * @private
 * @return {string}
 */
aurora.widgets.Selectize.prototype.mode_ = function() {
    let self = this;
    return this.helper_.accessTrans(function() {
        return self.settingsB_.get().maxValues === 1 ? 'single' : 'multi';
    });
};
/**
 * @final
 */
aurora.widgets.Selectize.options = recoil.ui.util.StandardOptions(
    'value', 'options', {
        maxValues: null,
        hideSelected: null,// if null true in multi, else false
        maxOptions: 1000,
        splitOn: null,
        renderer: function(txt) {
            return goog.dom.createTextNode(txt);
        },

        optionRenderer: null,
        placeholder: null,
        grow: true,
        delimiter: ',',
        diacritics: true,
        create: null,
        createOnBlur: false,
        createFilter: function(v) { return !!v;},
        highlight: true,
        searchFunc: function(val) {return val ? val.toString() : '';},
        required: false,
        openOnFocus: true,
        addPrecedence: false,
        selectOnTab: false,
        allowEmptyOption: false,
        closeAfterSelect: false,


        scrollDuration: 60,
        loadThrottle: 300,
        loadingClass: 'loading',

        lockOptgroupOrder: false,

        sortField: '$order',
        searchConjunction: 'and',

    });
/**
 * @param {!recoil.frp.Behaviour|!Object} options
 */

aurora.widgets.Selectize.prototype.attachStruct = function(options) {
    let frp = this.scope_.getFrp();
    let bound = aurora.widgets.Selectize.options.bind(frp, options);
    let self = this;
    this.valueB_ = bound.value();
    this.uniqValueB_ = frp.liftBI(function(value) {
        let seen = new goog.structs.AvlTree(recoil.util.object.compareKey);
        let res = [];
        value.forEach(function(v) {
            let info = seen.safeFind({key: value, seen: 0});
            res.push({value: v, id: info.seen});
            info.seen++;
        });
        return res;
    }, function(v) {
        self.valueB_.set(v.map(function(v) {return v.value;}));
    }, this.valueB_);

    // optgroups?
    this.optionsB_ = bound.options();
    // delemiter not needed
    //
    this.settingsB_ = bound.getGroup(
        [
            bound.maxValues, bound.maxOptions,
            bound.renderer, bound.optionRenderer,
            bound.hideSelected, bound.highlight,
            bound.enabled, bound.required,
            bound.placeholder,
            bound.splitOn,
            bound.create, bound.createOnBlur, bound.createFilter,
            bound.delimiter, bound.selectOnTab,
            bound.closeAfterSelect, bound.scrollDuration,
            bound.sortField, bound.searchFunc, bound.searchConjunction,
            bound.score, bound.diacritics, bound.grow,
            bound.openOnFocus

        ]);
    this.helper_.attach(this.valueB_, this.optionsB_, this.settingsB_, this.caretB_, this.activeB_, this.userOptionsB_, this.activeOptionB_, this.uniqValueB_);
    this.optionsHelper_.attach(this.valueB_, this.settingsB_, this.optionsB_, this.activeOptionB_, this.uniqValueB_);
};

/**
   Selectize.define('dropdown_header', function(options) {
   var self = this;

   options = $.extend({
   title         : 'Untitled',
   headerClass   : 'selectize-dropdown-header',
   titleRowClass : 'selectize-dropdown-header-title',
   labelClass    : 'selectize-dropdown-header-label',
   closeClass    : 'selectize-dropdown-header-close',

   html: function(data) {
   return (
   '<div class="' + data.headerClass + '">' +
   '<div class="' + data.titleRowClass + '">' +
   '<span class="' + data.labelClass + '">' + data.title + '</span>' +
   '<a href="javascript:void(0)" class="' + data.closeClass + '">&times;</a>' +
   '</div>' +
   '</div>'
   );
   }
   }, options);

   self.setup = (function() {
   var original = self.setup;
   return function() {
   original.apply(self, arguments);
   self.$dropdown_header = $(options.html(options));
   self.$dropdown.prepend(self.$dropdown_header);
   };
   })();

   });

   Selectize.define('optgroup_columns', function(options) {
   var self = this;

   options = $.extend({
   equalizeWidth  : true,
   equalizeHeight : true
   }, options);

   this.getAdjacentOption = function($option, direction) {
   var $options = $option.closest('[data-group]').find('[data-selectable]');
   var index    = $options.index($option) + direction;

   return index >= 0 && index < $options.length ? $options.eq(index) : $();
   };

   this.onKeyDown = (function() {
   var original = self.onKeyDown;
   return function(e) {
   var index, $option, $options, $optgroup;

   if (this.isOpen && (e.keyCode === KeyCodes.LEFT || e.keyCode === KeyCodes.RIGHT)) {
   self.ignoreHover = true;
   $optgroup = this.$activeOption.closest('[data-group]');
   index = $optgroup.find('[data-selectable]').index(this.$activeOption);

   if(e.keyCode === KeyCodes.LEFT) {
   $optgroup = $optgroup.prev('[data-group]');
   } else {
   $optgroup = $optgroup.next('[data-group]');
   }

   $options = $optgroup.find('[data-selectable]');
   $option  = $options.eq(Math.min($options.length - 1, index));
   if ($option.length) {
   this.setActiveOption($option);
   }
   return;
   }

   return original.apply(this, arguments);
   };
   })();

   var getScrollbarWidth = function() {
   var div;
   var width = getScrollbarWidth.width;
   var doc = document;

   if (typeof width === 'undefined') {
   div = doc.createElement('div');
   div.innerHTML = '<div style="width:50px;height:50px;position:absolute;left:-50px;top:-50px;overflow:auto;"><div style="width:1px;height:100px;"></div></div>';
   div = div.firstChild;
   doc.body.appendChild(div);
   width = getScrollbarWidth.width = div.offsetWidth - div.clientWidth;
   doc.body.removeChild(div);
   }
   return width;
   };

   var equalizeSizes = function() {
   var i, n, height_max, width, width_last, width_parent, $optgroups;

   $optgroups = $('[data-group]', self.$dropdown_content);
   n = $optgroups.length;
   if (!n || !self.$dropdown_content.width()) return;

   if (options.equalizeHeight) {
   height_max = 0;
   for (i = 0; i < n; i++) {
   height_max = Math.max(height_max, $optgroups.eq(i).height());
   }
   $optgroups.css({height: height_max});
   }

   if (options.equalizeWidth) {
   width_parent = self.$dropdown_content.innerWidth() - getScrollbarWidth();
   width = Math.round(width_parent / n);
   $optgroups.css({width: width});
   if (n > 1) {
   width_last = width_parent - width * (n - 1);
   $optgroups.eq(n - 1).css({width: width_last});
   }
   }
   };

   if (options.equalizeHeight || options.equalizeWidth) {
   hook.after(this, 'positionDropdown', equalizeSizes);
   hook.after(this, 'refreshOptions', equalizeSizes);
   }


   });

   Selectize.define('remove_button', function(options) {
   if (this.settings.mode === 'single') return;

   options = $.extend({
   label     : '&times;',
   title     : 'Remove',
   className : 'remove',
   append    : true
   }, options);

   var self = this;
   var html = '<a href="javascript:void(0)" class="' + options.className + '" tabindex="-1" title="' + escape_html(options.title) + '">' + options.label + '</a>';

   /**
   * Appends an element as a child (with raw HTML).
   *
   * @param {string} html_container
   * @param {string} html_element
   * @return {string}
   *//*
       var append = function(html_container, html_element) {
       var pos = html_container.search(/(<\/[^>]+>\s*)$/);
       return html_container.substring(0, pos) + html_element + html_container.substring(pos);
       };

       this.setup = (function() {
       var original = self.setup;
       return function() {
       // override the item rendering method to add the button to each
       if (options.append) {
       var render_item = self.settings.render.item;
       self.settings.render.item = function(data) {
       return append(render_item.apply(this, arguments), html);
       };
       }

       original.apply(this, arguments);

       // add event listener
       this.$control.on('click', '.' + options.className, function(e) {
       e.preventDefault();
       if (self.isLocked) return;

       var $item = $(e.currentTarget).parent();
       self.setActiveItem($item);
       if (self.deleteSelection()) {
       self.setCaret(self.items.length);
       }
       });

       };
       })();

       });

       Selectize.define('restore_on_backspace', function(options) {
       var self = this;

       options.text = options.text || function(option) {
       return option[this.settings.labelField];
       };

       this.onKeyDown = (function() {
       var original = self.onKeyDown;
       return function(e) {
       var index, option;
       if (e.keyCode === KeyCodes.BACKSPACE && this.$control_input.val() === '' && !this.$activeItems.length) {
       index = this.caretPos - 1;
       if (index >= 0 && index < this.items.length) {
       option = this.options[this.items[index]];
       if (this.deleteSelection(e)) {
       this.setTextboxValue(options.text.apply(this, [option]));
       this.refreshOptions(true);
       }
       e.preventDefault();
       return;
       }
       }
       return original.apply(this, arguments);
       };
       })();
       });

     */
/**
 * sifter.js
 * Copyright (c) 2013 Brian Reavis & contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
 * file except in compliance with the License. You may obtain a copy of the License at:
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 *
 * @author Brian Reavis <brian@thirdroute.com>
 */

/**
 * Textually searches arrays and hashes of objects
 * by property (or multiple properties). Designed
 * specifically for autocomplete.
 *
 * @constructor
 * @param {Array|Object} items
 * @param {Object} settings
 */
aurora.widgets.Sifter = function(items, settings) {
    this.items = items;
    this.settings = settings || {diacritics: true};
};

/**
 * Splits a search string into an array of individual
 * regexps to be used to match results.
 *
 * @param {string} query
 * @return {Array}
 */
aurora.widgets.Sifter.prototype.tokenize = function(query) {
    query = aurora.widgets.Sifter.trim_(String(query || '').toLowerCase());
    if (!query || !query.length) return [];
    let DIACRITICS = aurora.widgets.Sifter.DIACRITICS_;
    let escape_regex = aurora.widgets.Sifter.escape_regex_;
    var i, n, regex, letter;
    var tokens = [];
    var words = query.split(/ +/);

    for (i = 0, n = words.length; i < n; i++) {
        regex = escape_regex(words[i]);
        if (this.settings.diacritics) {
            for (letter in DIACRITICS) {
                if (DIACRITICS.hasOwnProperty(letter)) {
                    regex = regex.replace(new RegExp(letter, 'g'), DIACRITICS[letter]);
                }
            }
        }
        tokens.push({
            string: words[i],
            regex: new RegExp(regex, 'i')
        });
    }

    return tokens;
};

/**
 * Iterates over arrays and hashes.
 *
 * ```
 * this.iterator(this.items, function(item, id) {
 *    // invoked for each item
 * });
 * ```
 *
 * @param {Array|Object} object
 * @param {function(?,number,?)} callback
 */
aurora.widgets.Sifter.prototype.iterator = function(object, callback) {
    let iterator;
    if (goog.isArray(object)) {
        iterator = Array.prototype.forEach || function(callback) {
            for (var i = 0, n = this.length; i < n; i++) {
                callback(this[i], i, this);
            }
        };
    } else {
        iterator = function(callback) {
            for (var key in this) {
                if (this.hasOwnProperty(key)) {
                    callback(this[key], key, this);
                }
            }
        };
    }

    iterator.apply(object, [callback]);
};

/**
 * Returns a function to be used to score individual results.
 *
 * Good matches will have a higher score than poor matches.
 * If an item is not a match, 0 will be returned by the function.
 *
 * @param {Object|string} search
 * @param {Object} options (optional)
 * @return {function(?):number}
 */
aurora.widgets.Sifter.prototype.getScoreFunction = function(search, options) {
    let self, fields, tokens, token_count;

    self = this;
    search = self.prepareSearch(search, options);
    tokens = search.tokens;
    fields = search.options.fields;
    token_count = tokens.length;

    /**
     * Calculates how close of a match the
     * given value is against a search token.
     *
     * @param {?} value
     * @param {Object} token
     * @return {number}
     */
    var scoreValue = function(value, token) {
        var score, pos;

        if (!value) return 0;
        value = String(value || '');
        pos = value.search(token.regex);
        if (pos === -1) return 0;
        score = token.string.length / value.length;
        if (pos === 0) score += 0.5;
        return score;
    };

    /**
     * Calculates the score of an object
     * against the search query.
     *
     * @param {Object} token
     * @param {Object} data
     * @return {number}
     */
    var scoreObject = (function() {
        var field_count = fields.length;
        if (!field_count) {
            return function() { return 0; };
        }
        return function(token, data) {
            for (var i = 0, sum = 0; i < field_count; i++) {
                sum += scoreValue(goog.isFunction(fields[i]) ? fields[i](data) : data[fields[i]], token);
            }
            return sum / field_count;
        };
    })();

    if (!token_count) {
        return function() { return 0; };
    }
    if (token_count === 1) {
        return function(data) {
            return scoreObject(tokens[0], data);
        };
    }

    if (search.options.conjunction === 'and') {
        return function(data) {
            var score;
            for (var i = 0, sum = 0; i < token_count; i++) {
                score = scoreObject(tokens[i], data);
                if (score <= 0) return 0;
                sum += score;
            }
            return sum / token_count;
        };
    } else {
        return function(data) {
            for (var i = 0, sum = 0; i < token_count; i++) {
                sum += scoreObject(tokens[i], data);
            }
            return sum / token_count;
        };
    }
};

/**
 * Returns a function that can be used to compare two
 * results, for sorting purposes. If no sorting should
 * be performed, `null` will be returned.
 *
 * @param {string|Object} search
 * @param {Object} options
 * @return function(a,b)
 */
aurora.widgets.Sifter.prototype.getSortFunction = function(search, options) {
    var i, n, self, field, fields, fields_count, multiplier, multipliers, get_field, implicit_score, sort;

    self = this;
    search = self.prepareSearch(search, options);
    sort = (!search.query && options.sort_empty) || options.sort;

    /**
     * Fetches the specified sort field value
     * from a search result item.
     *
     * @param  {string} name
     * @param  {Object} result
     * @return {?}
     */
    get_field = function(name, result) {
        if (name === '$score') return result.score;
        return self.items[result.id][name];
    };

    // parse options
    fields = [];
    if (sort) {
        for (i = 0, n = sort.length; i < n; i++) {
            if (search.query || sort[i].field !== '$score') {
                fields.push(sort[i]);
            }
        }
    }

    // the "$score" field is implied to be the primary
    // sort field, unless it's manually specified
    if (search.query) {
        implicit_score = true;
        for (i = 0, n = fields.length; i < n; i++) {
            if (fields[i].field === '$score') {
                implicit_score = false;
                break;
            }
        }
        if (implicit_score) {
            fields.unshift({field: '$score', direction: 'desc'});
        }
    } else {
        for (i = 0, n = fields.length; i < n; i++) {
            if (fields[i].field === '$score') {
                fields.splice(i, 1);
                break;
            }
        }
    }
    let cmp = aurora.widgets.Sifter.cmp_;
    multipliers = [];
    for (i = 0, n = fields.length; i < n; i++) {
        multipliers.push(fields[i].direction === 'desc' ? -1 : 1);
    }

    // build function
    fields_count = fields.length;
    if (!fields_count) {
        return null;
    } else if (fields_count === 1) {
        field = fields[0].field;
        multiplier = multipliers[0];
        return function(a, b) {
            return multiplier * cmp(
                get_field(field, a),
                get_field(field, b)
            );
        };
    } else {
        return function(a, b) {
            var i, result, a_value, b_value, field;
            for (i = 0; i < fields_count; i++) {
                field = fields[i].field;
                result = multipliers[i] * cmp(
                    get_field(field, a),
                    get_field(field, b)
                );
                if (result) return result;
            }
            return 0;
        };
    }
};

/**
 * Parses a search query and returns an object
 * with tokens and fields ready to be populated
 * with results.
 *
 * @param {string|Object} query
 * @param {Object} options
 * @return {Object}
 */
aurora.widgets.Sifter.prototype.prepareSearch = function(query, options) {
    if (typeof query === 'object') return query;

    options = Object.assign({}, options);

    var option_fields = options.fields;
    var option_sort = options.sort;
    var option_sort_empty = options.sort_empty;

    if (option_fields && !goog.isArray(option_fields)) options.fields = [option_fields];
    if (option_sort && !goog.isArray(option_sort)) options.sort = [option_sort];
    if (option_sort_empty && !goog.isArray(option_sort_empty)) options.sort_empty = [option_sort_empty];

    return {
        options: options,
        query: String(query || '').toLowerCase(),
        tokens: this.tokenize(query),
        total: 0,
        items: []
    };
};

/**
 * Searches through all items and returns a sorted array of matches.
 *
 * The `options` parameter can contain:
 *
 *   - fields {string|array}
 *   - sort {Array}
 *   - score {function}
 *   - filter {bool}
 *   - limit {integer}
 *
 * Returns an object containing:
 *
 *   - options {Object}
 *   - query {string}
 *   - tokens {Array}
 *   - total {int}
 *   - items {Array}
 *
 * @param {string} query
 * @param {Object} options
 * @return {Object}
 */
aurora.widgets.Sifter.prototype.search = function(query, options) {
    var self = this, value, score, search, calculateScore;
    var fn_sort;
    var fn_score;

    search = this.prepareSearch(query, options);
    options = search.options;
    query = search.query;

    // generate result scoring function
    fn_score = options.score || self.getScoreFunction(search, options);

    // perform search and sort
    if (query.length) {
        self.iterator(self.items, function(item, id) {
            score = fn_score(item);
            if (options.filter === false || score > 0) {
                search.items.push({'score': score, 'id': id});
            }
        });
    } else {
        self.iterator(self.items, function(item, id) {
            search.items.push({'score': 1, 'id': id});
        });
    }

    fn_sort = self.getSortFunction(search, options);
    if (fn_sort) search.items.sort(fn_sort);

    // apply limits
    search.total = search.items.length;
    if (typeof options.limit === 'number') {
        search.items = search.items.slice(0, options.limit);
    }

    return search;
};

/**
 * @private
 * @param {?} a
 * @param {?} b
 * @return {number}
 */
aurora.widgets.Sifter.cmp_ = function(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
        return a > b ? 1 : (a < b ? -1 : 0);
    }
    a = aurora.widgets.Sifter.asciifold_(String(a || ''));
    b = aurora.widgets.Sifter.asciifold_(String(b || ''));
    if (a > b) return 1;
    if (b > a) return -1;
    return 0;
};
/**
 * @param {Object} a
 * @param {...Object} var_args
 * @return {Object}
 */
aurora.widgets.Sifter.extend_ = function(a, var_args) {
    var i, n, k, object;
    for (i = 1, n = arguments.length; i < n; i++) {
        object = arguments[i];
        if (!object) continue;
        for (k in object) {
            if (object.hasOwnProperty(k)) {
                a[k] = object[k];
            }
        }
    }
    return a;
};
/**
 * @param {string} str
 * @return {string}
 */
aurora.widgets.Sifter.trim_ = function(str) {
    return (str + '').replace(/^\s+|\s+$|/g, '');
};

/**
 * @private
 * @param {string} str
 * @return {string}
 */
aurora.widgets.Sifter.escape_regex_ = function(str) {
    return (str + '').replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
};

/**
 * @private
 */
aurora.widgets.Sifter.DIACRITICS_ = {
    'a': '[aÀÁÂÃÄÅàáâãäåĀāąĄ]',
    'c': '[cÇçćĆčČ]',
    'd': '[dđĐďĎ]',
    'e': '[eÈÉÊËèéêëěĚĒēęĘ]',
    'i': '[iÌÍÎÏìíîïĪī]',
    'l': '[lłŁ]',
    'n': '[nÑñňŇńŃ]',
    'o': '[oÒÓÔÕÕÖØòóôõöøŌō]',
    'r': '[rřŘ]',
    's': '[sŠšśŚ]',
    't': '[tťŤ]',
    'u': '[uÙÚÛÜùúûüůŮŪū]',
    'y': '[yŸÿýÝ]',
    'z': '[zŽžżŻźŹ]'
};

/**
 * @param {string} str
 * @return {string}
 */
aurora.widgets.Sifter.asciifold_ = (function() {
    var i, n, k, chunk;
    var foreignletters = '';
    var lookup = {};
    let DIACRITICS = aurora.widgets.Sifter.DIACRITICS_;
    for (k in DIACRITICS) {
        if (DIACRITICS.hasOwnProperty(k)) {
            chunk = DIACRITICS[k].substring(2, DIACRITICS[k].length - 1);
            foreignletters += chunk;
            for (i = 0, n = chunk.length; i < n; i++) {
                lookup[chunk.charAt(i)] = k;
            }
        }
    }
    var regexp = new RegExp('[' + foreignletters + ']', 'g');
    return function(str) {
        return str.replace(regexp, function(foreignletter) {
            return lookup[foreignletter];
        }).toLowerCase();
    };
})();

/**
 * @param {Node} element
 * @param {string} pattern
 */
aurora.widgets.Selectize.highlight = function(element, pattern) {
    let createDom = goog.dom.createDom;
    if (typeof pattern === 'string' && !pattern.length) return;
    var regex = (typeof pattern === 'string') ? new RegExp(pattern, 'i') : pattern;

    var highlight = function(node) {
        var skip = 0;
        if (node.nodeType === 3) {
            var pos = node.data.search(regex);
            if (pos >= 0 && node.data.length > 0) {
                var match = node.data.match(regex);
                var spannode = createDom('span', {class: 'highlight'});
                var middlebit = node.splitText(pos);
                var endbit = middlebit.splitText(match[0].length);
                var middleclone = middlebit.cloneNode(true);
                spannode.appendChild(middleclone);
                middlebit.parentNode.replaceChild(spannode, middlebit);
                skip = 1;
            }
        } else if (node.nodeType === 1 && node.childNodes && !/(script|style)/i.test(node.tagName)) {
            for (var i = 0; i < node.childNodes.length; ++i) {
                i += highlight(node.childNodes[i]);
            }
        }
        return skip;
    };
    highlight(element);
};



/**
 * all widgets should not allow themselves to be flatterned
 *
 */

aurora.widgets.Selectize.prototype.flatten = recoil.frp.struct.NO_FLATTEN;
/**
 *
 * @return {!goog.ui.Component}
 */
aurora.widgets.Selectize.prototype.getComponent = function() {
    return this.component_;
};

/**
 * @implements {recoil.ui.widgets.table.Column}
 * @template T
 * @constructor
 * @param {!recoil.structs.table.ColumnKey} key
 * @param {!recoil.ui.message.Message|string} name
 * @param {Object=} opt_meta
 */
aurora.columns.Selectize = recoil.ui.widgets.table.makeStructColumn(aurora.widgets.Selectize, {debug: true});

/**
 *				//
 * @param {!recoil.structs.table.ColumnKey} columnKey
 * @param {string|!recoil.ui.message.Message} name
 * @param {!recoil.frp.Behaviour<!Array<{id:?, name: string}>>} refListB
 * @return {!recoil.frp.Behaviour<!aurora.columns.Selectize>}
 */

aurora.columns.Selectize.makeFromRefList = function(columnKey, name, refListB) {
    let frp = refListB.frp();
    return frp.liftB(function(options) {
        let optMap = {};
        for (let i = 0; i < options.length; i++) {
            optMap[options[i].id] = options[i].name;
        }
        let renderer = function(v) {
            let name = optMap[v];
            if (name === undefined) {
                return goog.dom.createDom('span', {class: 'error'}, recoil.ui.messages.UNKNOWN_VAL.toString({val: '' + v}));
            }
            return goog.dom.createTextNode(name);
        };
        let meta = {
            options: options.map(function(v) {return v.id;}),
            optionRenderer: renderer,
            searchFunc: function(v) {
                let name = optMap[v];
                return name || '';
            },
            renderer: renderer
        };

        return new aurora.columns.Selectize(columnKey, name, meta);
    }, refListB);


};
