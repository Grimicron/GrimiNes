class CONTROLLER{
    constructor(p_nes, p_keybinds, p_gpbinds, p_bt_binds){
        this.nes          = p_nes;
        // p_keybinds is an object which has 8 properties:
        // a, b, select, start, up, down, left, right
        // Each of these properties has a key assigned to it
        // identifying the key which is bound to its respective button
        this.keybinds     = p_keybinds;
        // Controller API properties
        this.gp_connected = false;
        this.gp_binds     = p_gpbinds;
        this.gamepad      = null;
        // Tactile button binds
        this.bt_binds     = p_bt_binds;
        // An array with the state of the controller
        // since it was last updated
        // It's in the order laid out above
        this.state        = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        // The actual state of the controller on the keyboard and gamepad
        this.kb_state     = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        this.gp_state     = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        // Increases with each successive read of of 0x4016
        // and determines which status bit is sent back
        this.read_index   = 0x00;
        // When high (0x01), the state of the controller is
        // continuosly reloaded and read_index reset
        this.strobe_bit   = 0x00;
    }

    // This function simply halfs the code size, not much else to it
    handle_change(key, pressed){
        switch (key){
            case this.keybinds.a:
                this.kb_state[0] = pressed;
                break;
            case this.keybinds.b:
                this.kb_state[1] = pressed;
                break;
            case this.keybinds.select:
                this.kb_state[2] = pressed;
                break;
            case this.keybinds.start:
                this.kb_state[3] = pressed;
                break;
            case this.keybinds.up:
                this.kb_state[4] = pressed;
                break;
            case this.keybinds.down:
                this.kb_state[5] = pressed;
                break;
            case this.keybinds.left:
                this.kb_state[6] = pressed;
                break;
            case this.keybinds.right:
                this.kb_state[7] = pressed;
                break;
        }
    }

    bind_keys(){
        document.addEventListener("keydown", (e) => {
            // Only cancel default and handle event if the key is in our keybinds
            if (!Object.values(this.keybinds).includes(e.code)) return;
            if (e.cancelable) e.preventDefault();
            this.handle_change(e.code, 0x01);
        });
        document.addEventListener("keyup",   (e) => {
            // Same as before
            if (!Object.values(this.keybinds).includes(e.code)) return;
            if (e.cancelable) e.preventDefault();
            this.handle_change(e.code, 0x00);
        });
        // We also set up our controller API listeners here
        window.addEventListener("gamepadconnected",    (e) => {
            this.gp_connected = true;
            this.gamepad      = navigator.getGamepads()[e.gamepad.index];
        });
        window.addEventListener("gamepaddisconnected", (e) => {
            this.gp_connected = false;
            this.gamepad      = null;
        })
    };

    update(){
        // Since the controller API has a simple interface where we can simply
        // poll the state of the controller, we don't have to do event-based
        // keydown/keyup detection, just use the state of the controller here
        if (this.gp_connected){
            // Use keybinds to set state of buffer_state
            this.gp_state[0] = !!(this.gamepad.buttons[this.gp_binds.a     ] || {}).pressed;
            this.gp_state[1] = !!(this.gamepad.buttons[this.gp_binds.b     ] || {}).pressed;
            this.gp_state[2] = !!(this.gamepad.buttons[this.gp_binds.select] || {}).pressed;
            this.gp_state[3] = !!(this.gamepad.buttons[this.gp_binds.start ] || {}).pressed;
            this.gp_state[4] = !!(this.gamepad.buttons[this.gp_binds.up    ] || {}).pressed;
            this.gp_state[5] = !!(this.gamepad.buttons[this.gp_binds.down  ] || {}).pressed;
            this.gp_state[6] = !!(this.gamepad.buttons[this.gp_binds.left  ] || {}).pressed;
            this.gp_state[7] = !!(this.gamepad.buttons[this.gp_binds.right ] || {}).pressed;
            // Also use state of axes to update the buffer_state
            if (this.gamepad.axes.length == 2){
                if      (this.gamepad.axes[0] >=  0.75) this.gp_state[7] = 0x01;
                else if (this.gamepad.axes[0] <= -0.75) this.gp_state[6] = 0x01;
                if      (this.gamepad.axes[1] >=  0.75) this.gp_state[5] = 0x01;
                else if (this.gamepad.axes[1] <= -0.75) this.gp_state[4] = 0x01;
            }
        }
        for (let i = 0; i < this.state.length; i++){
            this.state[i] = this.kb_state[i] | this.gp_state[i];
        }
        this.read_index = 0x00;
    }

    set_strobe(val){
        // The remaining bits are thrown out (I think)
        this.strobe_bit = val & 0x01;
        if (this.strobe_bit) this.update();
    }

    get_status(mod){
        if (this.strobe_bit) this.update();
        // Always return 0x01 when all the status bits
        // have been read (in the original controller)
        if (this.read_index >= 0x08) return 0x01;
        // We can't increment read_index after we return,
        // so we have to settle for this workaround
        let tmp = this.state[this.read_index];
        // If it's a debug read, we don't increase read_index
        if (mod) this.read_index++;
        return tmp;
    }
}
