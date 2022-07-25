goog.provide('budget.widgets.Menu');

goog.require('aurora.permissions');
goog.require('budget.Client');
goog.require('budget.WidgetScope');
goog.require('goog.dom');
goog.require('goog.object');
goog.require('recoil.structs.Tree');
goog.require('recoil.ui.Widget');
goog.require('recoil.ui.frp.LocalBehaviour');
goog.require('recoil.ui.widgets.MenuBarWidget');
goog.require('recoil.ui.widgets.TreeView');
goog.require('recoil.ui.widgets.table.Column');
/**
 * @constructor
 * @export
 * @param {!budget.WidgetScope} scope
 * @implements {recoil.ui.Widget}
 */
budget.widgets.Menu = function(scope) {
    this.scope_ = scope;
    var frp = scope.getFrp();
    var html = new recoil.ui.HtmlHelper(scope);
    this.scope_ = scope;
    this.menuWidget_ = new recoil.ui.widgets.MenuBarWidget(scope);


    this.menuWidget_.attach({}, this.makeMenuBar(), true);

};

/**
 * @return {!recoil.frp.Behaviour<!Array<!recoil.ui.widgets.MenuButtonWidget>>}
 */
budget.widgets.Menu.prototype.makeMenuBar = function() {
    let scope = this.scope_;
    let frp = scope.getFrp();
    let menuInfoB = frp.liftB(function(inMenu, context) {
        let res = [];
        let filterChildren = function(children, context) {
            let res = [];
            for (let i = 0; i < children.length; i++) {
                let item = children[i];
                if (item.perm && !item.perm(context)) {
                    continue;
                }
                if (item.children) {
                    item = goog.object.clone(item);
                    item.children = filterChildren(item.children, context);
                    if (item.children.length === 0) {
                        continue;
                    }
                }
                res.push(item);
            }
            return res;
        };

        inMenu.forEach(function(item) {
            if (item.perm && !item.perm(context)) {
                return;
            }
            if (!item.children || item.children.length === 0) {
                // this is a singular menu and should be a button no need to
                // check permissions further
                res.push(item);
            }
            else {
                let newItem = goog.object.clone(item);
                newItem.children = filterChildren(newItem.children, context);
                if (newItem.children.length > 0) {
                    res.push(newItem);
                }

            }
        });

        return res;
    }, frp.createB(budget.widgets.Menu.menu), aurora.permissions.getContext(scope));

    let userMenu = goog.dom.createDom('i', {'class': 'fas fa-user'});
    let noUserMenu = goog.dom.createDom('i', {'class': 'fas fa-bars'});
    let userDiv = goog.dom.createDom('div', {class: 'user-logged-in'}, userMenu, noUserMenu);

    let query = new recoil.db.Query();
    let username = goog.net.cookies.get('username');

    let menuIconB = frp.liftB(function(context) {

        if (aurora.permissions.loggedIn(true)(context)) {
            return userDiv;
        } else {
            return noUserMenu;
        }
    }, aurora.permissions.getContext(scope));

    let loginInfoB = frp.liftB(function(context) {
        if (aurora.permissions.loggedIn(true)(context)) {
            return {userName: username, loggedIn: true};
        }
        return {userName: '', loggedIn: false};
    }, aurora.permissions.getContext(scope));


    let makeUsernameDiv = function(loginInfo) {
        let cd = goog.dom.createDom;
        return cd('div', {class: 'budget-menu-user-container'}, cd('div', {class: 'budget-menu-username'}, loginInfo));
    };
    return frp.liftB(function(menuInfo, loginInfo) {


        let res = [];
        menuInfo.forEach(function(item) {
            let menuItems = [];
            if (!item.children || item.children.length === 0) {
                let menuButton = new recoil.ui.widgets.MenuActionButtonWidget(scope);
                let action = item.action ?  item.action(scope) : frp.createCallback(function(e) {
                    if (e.button == 1 || e.ctrlKey) {
                        window.open(item.url);
                    }
                    else {
                        window.location = item.url;
                    }
                }, frp.createB(null));
                menuButton.attachStruct({name: item.name, action: action, items: []});
                res.push(menuButton);
            }

            else {
                let menuButton = new recoil.ui.widgets.MenuButtonWidget(scope);
                item.children.forEach(function(menuItemInfo) {
                    if (menuItemInfo.seperator) {
                        let menuButton = new recoil.ui.widgets.MenuSeparatorWidget();
                        menuItems.push(menuButton);
                    }
                    else if (menuItemInfo.userName) {

                         if (loginInfo.loggedIn) {
                             let itemWidget = new recoil.ui.widgets.LabelWidget(scope);

                             let formatterB = frp.liftB(function(loginInfo) {
                                 return makeUsernameDiv;
                             }, loginInfoB);
                             itemWidget.attachStruct({name: loginInfo.userName, formatter: formatterB});
                             menuItems.push(itemWidget);
                         }
                    }

                    else {
                        let itemWidget = new recoil.ui.widgets.MenuItemActionWidget(scope);

                        itemWidget.attach(menuItemInfo.name.toString(), true, menuItemInfo.action ?
                                          menuItemInfo.action(scope) :
                                          frp.createCallback(function(e) {
                                              if (e.button == 1 || e.ctrlKey) {
                                                  window.open(menuItemInfo.url);
                                              }
                                              else {
                                                  
                                                  window.location = menuItemInfo.url;
                                              }
                                          }, frp.createB(null)));
                        menuItems.push(itemWidget);
                    }
                });
                menuButton.attach(menuIconB, menuItems);
                res.push(menuButton);
            }

        });
        return res;
    }, menuInfoB, loginInfoB);


/*
    {'name': 'Account', 'children' : [
        {'name': 'Schedule Appointment', 'url': '/account/appointment'},
        {'name': 'Personal Details', 'url': '/account/details'},
        {'name': 'Remove Details', 'url': '/account/details'},*/
};
/**
 * @type {!recoil.frp.Behaviour<string>}
 */
budget.widgets.Menu.breadCrumbsB = budget.Client.scope().getFrp().createB('');
/**
 * @private
 * update title and context sensitive help
*/
budget.widgets.Menu.prototype.updatePageInfo_ = function() {
    var curPath = [];
    var match = null;

    var traverse = function(menu, path) {
        menu.forEach(function(item) {

            var subPath = goog.array.clone(path);
            subPath.push(item.name);
            if (window.location.pathname === item.url) {
                match = subPath;
            }
            if (item.children) {
                traverse(item.children, subPath);
            }
        });
    };

    traverse(budget.widgets.Menu.menu, []);
    if (match) {
        this.scope_.getFrp().accessTrans(function() {
            budget.widgets.Menu.breadCrumbsB.set(match.join('>'));
        }, budget.widgets.Menu.breadCrumbsB);
    }

};

/**
 * @final
 */
budget.widgets.Menu.menu = [
    {userIcon: true, 'children' : [
        {'name': '', userName: true},
        {'name': 'Users', 'url': '/admin/mentors', perm: aurora.permissions.has('user-management')},
        {seperator: true, perm: aurora.permissions.has('user-management')},
        {'name': 'Budget Template', 'url': '/budget_template', perm: aurora.permissions.has('site-management')},
        {'name': 'Site Info', 'url': '/site', perm: aurora.permissions.has('site-management')},
        {'name': 'Office Hours', 'url': '/hours', perm: aurora.permissions.has('site-management')},
        {'name': 'Available Hours', 'url': '/appointments', perm: aurora.permissions.hasAny(['site-management', 'mentor'])},
        {'name': 'Bookings', 'url': '/bookings', perm: aurora.permissions.hasAny(['site-management', 'mentor'])},
        {seperator: true, perm: aurora.permissions.has('user-management')},

        {'name': 'New Client', 'url': '/client/new', perm: aurora.permissions.has('mentor')},
        {'name': 'Manage Client', 'url': '/client/manage', perm: aurora.permissions.has('mentor')},
        {seperator: true, perm: aurora.permissions.has('mentor')},
        {'name': 'Login', 'url': '/account/login', perm: aurora.permissions.loggedIn(false)},
        {'name': 'Signup', 'url': '/account/signup', perm: aurora.permissions.loggedIn(false)},
        {seperator: true, perm: aurora.permissions.loggedIn(false)},
        {'name': 'My Details', 'url': '/client', perm: aurora.permissions.loggedIn(true)},
        {'name': 'Change Password', action: function (scope) {
            let frp = scope.getFrp();
            let permsB = aurora.permissions.getContext(scope);
            return frp.createCallback(function (e) {
                aurora.widgets.UserManagement.changePassword(scope,  BigInt(permsB.get().userid));
                
                console.log("change password",);
            }, permsB);
        }, perm: aurora.permissions.loggedIn(true)},
        {seperator: true, perm: aurora.permissions.has('client')},
        {'name': 'Resources', url: '/resources'},
        {'name': 'Administration', url: '/admin/admin', perm: aurora.permissions.has('site-management')},
        {seperator: true, perm: aurora.permissions.loggedIn(true)},
        {'name': 'Logout', 'url': '/logout', perm: aurora.permissions.loggedIn(true)}
    ]},
];

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.Menu.prototype.flatten = recoil.frp.struct.NO_FLATTEN;

/**
 * @return {!goog.ui.Component}
 */
budget.widgets.Menu.prototype.getComponent = function() {
    return this.menuWidget_.getComponent();
};


/**
 * @constructor
 * @param {!budget.WidgetScope} scope
 * @param {!recoil.frp.Behaviour<{name:string,url:string,licensed:boolean,requires:Array}>} nodeB
 * @implements {recoil.ui.Widget}
 */
budget.widgets.MenuNode = function(scope, nodeB) {
    var frp = scope.getFrp();
    this.scope_ = scope;
    this.description_ = goog.dom.createDom('a', {class: 'menu-entity'});
    this.componentDiv_ = goog.dom.createDom(
        'div', {class: 'treeView_descriptionRow'},
        this.description_);


    this.nodeB_ = nodeB;
    this.component_ = recoil.ui.ComponentWidgetHelper.elementToNoFocusControl(this.componentDiv_);
    this.component_.addClassName('goog-inline-block');
    this.helper_ = new recoil.ui.ComponentWidgetHelper(scope, this.component_, this, this.update_);
    this.helper_.attach(this.nodeB_);
};

/**
 * @private
 */
budget.widgets.MenuNode.prototype.detach_ = function() {
    if (this.tooltip_) {
        this.tooltip_.detach(this.description_);
        this.tooltip_.dispose();
        this.tooltip_ = null;
    }
};


/**
 * @private
 * @param {!recoil.ui.ComponentWidgetHelper} helper
 */
budget.widgets.MenuNode.prototype.update_ = function(helper) {
    if (helper.isGood()) {
        var node = this.nodeB_.get();
        this.detach_();
        if (node) {
            goog.dom.classlist.remove(this.description_, 'menu-tree-current');
            if (node.licensed) {
                goog.dom.classlist.remove(this.description_, 'menu-tree-unlicensed');
                this.description_.href = node.url;
                if (node.url === window.location.pathname) {
                    goog.dom.classlist.add(this.description_, 'menu-tree-current');
                    this.description_.removeAttribute('href');
                }
            }
            else {
                this.description_.removeAttribute('href');
                var req = node.requires.length > 1 ? 'Requires Licenses: ' : 'Requires License: ';
                this.tooltip_ = new goog.ui.Tooltip(this.description_, req + node.requires.join(','));
                goog.dom.classlist.add(this.description_, 'menu-tree-unlicensed');
            }
            goog.dom.setTextContent(this.description_, node.name);
        }
        if (node && node.url === window.location.pathname) {

            var cur = this.componentDiv_;
            while (cur) {
                if (cur.className == 'menu-tree-row') {
                    cur.style.background = '#222222';
                    cur.style.color = '#fff';
                    var item = null; //jQuery(cur).find('.menu-tree-file-icon');
                    if (item && item.length > 0) {
                        item[0].style.backgroundPosition = '-428px -493px';
                    }
                    break;
                }
                cur = cur.parentElement;
            }
        }
    }
};

/**
 * @param {!budget.WidgetScope} scope
 * @param {!recoil.frp.Behaviour<{name:string,licensed:boolean,requires:Array,url:string}>} nodeB
 * @return {!budget.widgets.MenuNode}
 */
budget.widgets.MenuNode.factory = function(scope, nodeB) {
    return new budget.widgets.MenuNode(scope, nodeB);
};
/**
 * @return {!goog.ui.Component}
 */
budget.widgets.MenuNode.prototype.getComponent = function() {
    return this.component_;
};

/**
 * all widgets should not allow themselves to be flatterned
 *
 */

budget.widgets.MenuNode.prototype.flatten = recoil.frp.struct.NO_FLATTEN;
