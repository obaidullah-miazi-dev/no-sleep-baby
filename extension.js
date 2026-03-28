import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Button } from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { PopupSwitchMenuItem, PopupMenuItem, PopupSeparatorMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

export default class NoSleepBabyExtension {
    constructor(ext) {
        this._ext = ext;
        this._indicator = null;
        this._settings = null;
        this._timerId = null;
        this._icon = null;
        this._toggleItem = null;
        this._statusItem = null;
    }

    enable() {
        console.log('[No Sleep Baby] Enabling extension');

        // Initialize settings for state persistence
        this._settings = this._ext.getSettings('org.gnome.shell.extensions.no-sleep-baby');

        // Create Panel Menu Button
        this._indicator = new Button(0.0, 'No Sleep Baby');

        // Create Icon using the bundled symbolic SVG
        const iconPath = this._ext.dir.get_child('icons').get_child('caffeine-symbolic.svg').get_path();
        const gicon = Gio.icon_new_for_string(iconPath);
        
        this._icon = new St.Icon({
            gicon: gicon,
            style_class: 'no-sleep-baby-icon inactive',
        });
        
        this._indicator.add_child(this._icon);

        // Create Toggle Switch Menu Item
        this._toggleItem = new PopupSwitchMenuItem('Disable Sleep', false);
        this._toggleItem.connect('toggled', (item, state) => this._toggleSleep(state));
        this._indicator.menu.addMenuItem(this._toggleItem);

        // Create Status Text Menu Item
        this._statusItem = new PopupMenuItem('Sleep Enabled', { reactive: false });
        this._indicator.menu.addMenuItem(this._statusItem);

        // Create Quick Timer Options
        this._indicator.menu.addMenuItem(new PopupSeparatorMenuItem());
        
        const timers = [15, 30, 60];
        timers.forEach(mins => {
            let label = mins === 60 ? '1 hour' : `${mins} minutes`;
            let item = new PopupMenuItem(`Disable for ${label}`);
            item.connect('activate', () => this._startTimer(mins));
            this._indicator.menu.addMenuItem(item);
        });

        // Add the indicator to the right side of the main panel
        Main.panel.addToStatusArea('no-sleep-baby', this._indicator);

        // Restore persisted state
        const initialState = this._settings.get_boolean('is-active');
        this._updateUI(initialState);
        this._runGsettings(initialState);
    }

    disable() {
        console.log('[No Sleep Baby] Disabling extension');

        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
        this._icon = null;
        this._toggleItem = null;
        this._statusItem = null;
    }

    _toggleSleep(state) {
        // Save state persistently
        this._settings.set_boolean('is-active', state);
        
        this._updateUI(state);
        this._runGsettings(state);

        // Clear any running timers if turned off manually
        if (!state && this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }

        // Show Notification
        const msg = state ? 'Sleep disabled (system will stay awake)' : 'Sleep enabled (default behavior restored)';
        Main.notify('No Sleep Baby', msg);
    }

    _updateUI(state) {
        if (!this._icon || !this._toggleItem || !this._statusItem) return;

        // Toggle CSS class for visual changes
        this._icon.style_class = state ? 'no-sleep-baby-icon active' : 'no-sleep-baby-icon inactive';
        
        // Update menu state and text
        this._toggleItem.setToggleState(state);
        this._statusItem.label.text = state ? 'Status: Sleep Disabled ☕' : 'Status: Sleep Enabled 💤';
    }

    _runGsettings(state) {
        console.log(`[No Sleep Baby] Setting idle-delay state: ${state}`);
        try {
            if (state) {
                // Disable sleep by setting idle-delay to 0
                GLib.spawn_command_line_async('gsettings set org.gnome.desktop.session idle-delay 0');
            } else {
                // Restore original sleep behavior by resetting the key
                GLib.spawn_command_line_async('gsettings reset org.gnome.desktop.session idle-delay');
            }
        } catch (e) {
            console.error(`[No Sleep Baby] Failed to spawn gsettings command: ${e}`);
        }
    }

    _startTimer(mins) {
        console.log(`[No Sleep Baby] Starting timer for ${mins} minutes`);
        
        // Turn on instantly
        if (!this._settings.get_boolean('is-active')) {
             this._toggleSleep(true);
        }

        // Cancel previous timer if exists
        if (this._timerId) {
            GLib.source_remove(this._timerId);
        }

        Main.notify('No Sleep Baby', `Sleep disabled for ${mins} minutes`);

        // Set new timer
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, mins * 60, () => {
            console.log(`[No Sleep Baby] Timer finished, restoring sleep`);
            this._toggleSleep(false);
            this._timerId = null;
            return GLib.SOURCE_REMOVE;
        });
    }
}
