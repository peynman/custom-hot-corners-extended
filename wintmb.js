/* This is a part of Custom Hot Corners - Extended, the Gnome Shell extension
 * Copyright 2021 GdH <georgdh@gmail.com>
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
'use strict';

const GObject                = imports.gi.GObject;
const GLib                   = imports.gi.GLib;
const St                     = imports.gi.St;
const DND                    = imports.ui.dnd;
const Clutter                = imports.gi.Clutter;
const Main                   = imports.ui.main;
const Meta                   = imports.gi.Meta;

var   WindowThumbnail = GObject.registerClass(
class WindowThumbnail extends St.Bin {
    _init(winActor, parent, actionTimeout) {
        this._initTbmbWidth = 300; // px
        this._actionTimeoutId = null;
        this._scrollTimeout = actionTimeout;
        this._reverseTmbWheelFunc = false;
        this._parent = parent;
        this.w = winActor.get_meta_window();
        super._init({visible: true, reactive: true, can_focus: true, track_hover: true});
        this.connect('button-release-event', this._onBtnReleased.bind(this));
        this.connect('button-press-event', this._onBtnPressed.bind(this));
        this.connect('scroll-event', this._onScrollEvent.bind(this));
        //this.connect('motion-event', this._onMouseMove.bind(this)); // may be useful in the future..

        this._delegate = this;
        this._draggable = DND.makeDraggable(this, {dragActorOpacity: 200});

        this.saved_snap_back_animation_time = DND.SNAP_BACK_ANIMATION_TIME;

        this._draggable.connect('drag-end', this._end_drag.bind(this));
        this._draggable.connect('drag-cancelled', this._end_drag.bind(this));

        this.clone = new Clutter.Clone({reactive: true});
        Main.layoutManager.addChrome(this);

        this.window = this.w.get_compositor_private();

        //this.max_width = 25 / 100 * global.display.get_size()[0];
        //this.max_height = 25 / 100 * global.display.get_size()[1];

        this.clone.set_source(this.window);
        this._setSize(true);
        this.set_child(this.clone);

        // the main reason for the +2 is to avoid immediete button release event
        // switching the control mode when triggerd on full screen window
        this.set_position(winActor.x + 2,winActor.y + 2);
        this.show();
        this.window_id = this.w.get_id();
        this.tmbRedrawDirection = true;

        // remove thumbnail content and hide thumbnail if its window is destroyed
        this.windowConnect = this.window.connect('destroy', () => {
            if (this) {
                this._remove();
            }
        });
    }

    _setSize(resetScale = false) {
        if (resetScale)
            //this.scale = Math.min(1.0, this.max_width / this.window.width, this.max_height / this.window.height);
            this.scale = Math.min(1.0, this._initTbmbWidth / this.window.width );
        // when this.clone source window resize, this.clone and this. actor resize accordingly
        this.scale_x = this.scale;
        this.scale_y = this.scale;
        // when scale of this. actor change, this.clone resize accordingly,
        // but the reactive area of the actor doesn't change until the actor is redrawn
        // don't know how to do it better..
        this.set_position(this.x,this.y + (this.tmbRedrawDirection? 1 : -1));
        // switch direction of the move for each resize
        this.tmbRedrawDirection = !this.tmbRedrawDirection;
    }

    _onMouseMove(actor, event) {
        let [pos_x,pos_y] = event.get_coords();
        let state = event.get_state();
        if (this._ctrlPressed(state)) {
        }
    }

    _onBtnPressed(actor, event) {
        let doubleclick = event.get_click_count() === 2;
        if (doubleclick) this.w.activate(global.get_current_time());
    }

    _onBtnReleased(actor, event) {
        let button = event.get_button();
        switch (button) {
            case Clutter.BUTTON_PRIMARY:
                //if (this._ctrlPressed(state))
                this._reverseTmbWheelFunc = !this._reverseTmbWheelFunc;
                    return;
                break;
            case Clutter.BUTTON_SECONDARY:
                //if (this._ctrlPressed(state))
                this._remove();
                    return;
                break;
            case Clutter.BUTTON_MIDDLE:
                //if (this._ctrlPressed(state))
                this.w.delete(global.get_current_time());
                    return;
                break;
            default:
                return Clutter.EVENT_PROPAGATE;
        }
    }

    _onScrollEvent(actor, event) {
        let direction = event.get_scroll_direction();
        if (direction === 4) return;
        if (this._actionTimeoutActive()) return;
        let state = event.get_state();
        switch (direction) {
            case Clutter.ScrollDirection.UP:
                if (this._shiftPressed(state))
                    this.opacity = Math.min(255, this.opacity + 24);
                else if (this._reverseTmbWheelFunc !== this._ctrlPressed(state)){
                    this._switchSourceWin(-1);
                }
                else if (this._reverseTmbWheelFunc === this._ctrlPressed(state))
                    this.scale = Math.max(0.1, this.scale - 0.025);
                break;
            case Clutter.ScrollDirection.DOWN:
                if (this._shiftPressed(state))
                    this.opacity = Math.max(48, this.opacity - 24);
                else if (this._reverseTmbWheelFunc !== this._ctrlPressed(state)){
                    this._switchSourceWin(+1);
                }
                else if (this._reverseTmbWheelFunc === this._ctrlPressed(state))
                    this.scale = Math.min(1, this.scale + 0.025);
                break;
            default:
                return Clutter.EVENT_PROPAGATE;
        }
        this._setSize();
        //this.scale = Math.min(1.0, this.max_width / this.width, this.max_height / this.height);
        return Clutter.EVENT_STOP;
    }

    _remove() {
        if (this.clone) {
            this.window.disconnect(this.windowConnect);
            this.clone.set_source(null);
        }
        this._parent.windowThumbnails.splice(this._parent.windowThumbnails.indexOf(this), 1);
        this.destroy();
    }

    _end_drag() {
        this.set_position(this._draggable._dragOffsetX + this._draggable._dragX, this._draggable._dragOffsetY + this._draggable._dragY);
        DND.SNAP_BACK_ANIMATION_TIME = 0;
        this.timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 0, () => {
            DND.SNAP_BACK_ANIMATION_TIME = this.saved_snap_back_animation_time;
        });
    }

    _ctrlPressed(state) {
        return (state & Clutter.ModifierType.CONTROL_MASK) != 0;
    }

    _shiftPressed(state) {
        return (state & Clutter.ModifierType.SHIFT_MASK) != 0;
    }

    _switchSourceWin(direction) {
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
            windows = windows.filter( w => !(w.skip_taskbar || w.minimized));
        let idx = -1;
        for (let i = 0; i < windows.length; i++){
            if (windows[i] === this.w) {
                idx = i + direction;
                break;
            }
        }
        idx = idx >= windows.length ? 0 : idx;
        idx = idx < 0 ? windows.length - 1 : idx;
        let w = windows[idx];
        let win = w.get_compositor_private();
        this.clone.set_source(win);
        this.window.disconnect(this.windowConnect);
        // the new thumbnail should be the same height as the previous one
        this.scale = (this.scale * this.window.height) / win.height;
        this.window = win;
        this.windowConnect = this.window.connect('destroy', () => {
            if (this) {
                this._remove();
            }
        });
        this.w = w;
        let scale = this._setSize();
    }

    _actionTimeoutActive() {
        if (this._actionTimeoutId)
            return true;
        this._actionTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                // timeout for resizing should be shorter than for window switching
                this._reverseTmbWheelFunc ? this._scrollTimeout : this._scrollTimeout / 2,
                this._removeActionTimeout.bind(this)
            );
        return false;
    }

    _removeActionTimeout() {
        if (this._actionTimeoutId) {
            GLib.Source.remove(this._actionTimeoutId);
        }
        this._actionTimeoutId = null;
        return false;
}

});
