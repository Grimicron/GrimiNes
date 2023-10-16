class CONTROLLER{
    constructor(p_nes, p_kb_binds, p_gpbinds, p_bt_container){
        this.nes          = p_nes;
        // p_keybinds is an object which has 8 properties:
        // a, b, select, start, up, down, left, right
        // Each of these properties has a key assigned to it
        // identifying the key which is bound to its respective button
        this.kb_binds     = p_kb_binds;
        // Controller API properties
        this.gp_connected = false;
        this.gp_binds     = p_gpbinds;
        this.gp_index     = 0;
        // Tactile buttons container (each button will have a property
        // which describes which button they correspond to)
        this.bt_container = p_bt_container;
        // An array with the state of the controller
        // since it was last updated
        // It's in the order laid out above
        this.state        = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        // The actual state of the controller on the keyboard, gamepad and tactile buttons
        this.kb_state     = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        this.gp_state     = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        this.bt_state     = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        // Increases with each successive read of of 0x4016
        // and determines which status bit is sent back
        this.read_index   = 0x00;
        // When high (0x01), the state of the controller is
        // continuosly reloaded and read_index reset
        this.strobe_bit   = 0x00;
    }

    to_json(){
        return {
            // It might be useful to keep the binds
            // in our saves, since they might custom binds
            // set by the user
            kb_binds:     this.kb_binds,
            gp_binds:     this.gp_binds,
            bt_container: this.bt_container,
            state:        this.state,
            read_index:   this.read_index,
            strobe_bit:   this.strobe_bit,
        };
    }

    from_json(state){
        this.kb_binds     = state.kb_binds;
        this.gp_binds     = state.gp_binds;
        this.bt_container = state.bt_container;
        this.state        = state.state;
        this.read_index   = state.read_index;
        this.strobe_bit   = state.strobe_bit;
    }

    // This function simply halfs the code size, not much else to it
    kb_handle_change(key, pressed){
        switch (key){
            case this.kb_binds.a:
                this.kb_state[0] = pressed;
                break;
            case this.kb_binds.b:
                this.kb_state[1] = pressed;
                break;
            case this.kb_binds.select:
                this.kb_state[2] = pressed;
                break;
            case this.kb_binds.start:
                this.kb_state[3] = pressed;
                break;
            case this.kb_binds.up:
                this.kb_state[4] = pressed;
                break;
            case this.kb_binds.down:
                this.kb_state[5] = pressed;
                break;
            case this.kb_binds.left:
                this.kb_state[6] = pressed;
                break;
            case this.kb_binds.right:
                this.kb_state[7] = pressed;
                break;
        }
    }

    bt_handle_change(button, pressed){
        switch (button){
            case "a":
                this.bt_state[0] = pressed;
                break;
            case "b":
                this.bt_state[1] = pressed;
                break;
            case "select":
                this.bt_state[2] = pressed;
                break;
            case "start":
                this.bt_state[3] = pressed;
                break;
            case "up":
                this.bt_state[4] = pressed;
                break;
            case "down":
                this.bt_state[5] = pressed;
                break;
            case "left":
                this.bt_state[6] = pressed;
                break;
            case "right":
                this.bt_state[7] = pressed;
                break;
        }
    }
    
    bind_keys(){
        document.addEventListener("keydown", (e) => {
            // Only cancel default and handle event if the key is in our keybinds
            if (!Object.values(this.kb_binds).includes(e.code)) return;
            if (e.cancelable) e.preventDefault();
            this.kb_handle_change(e.code, 0x01);
        });
        document.addEventListener("keyup",   (e) => {
            // Same as before
            if (!Object.values(this.kb_binds).includes(e.code)) return;
            if (e.cancelable) e.preventDefault();
            this.kb_handle_change(e.code, 0x00);
        });
        // We also set up our controller API listeners here
        window.addEventListener("gamepadconnected",    (e) => {
            this.gp_connected = true;
            this.gp_index     = e.gamepad.index;
        });
        window.addEventListener("gamepaddisconnected", (e) => {
            this.gp_connected = false;
            this.gamepad      = null;
        })
    };

    bind_buttons(){
        document.getElementById(this.bt_container).childNodes.forEach((bt) => {
            bt.addEventListener("touchstart", (e) => {
                this.bt_handle_change(bt.id.split("-")[1], 0x01);
                // Stop unwanted selections/zooms
                if (!e.cancelable) return;
                e.preventDefault();
                e.stopPropagation();
            });
            bt.addEventListener("touchend",   (e) => {
                this.bt_handle_change(bt.id.split("-")[1], 0x00);
                // Same as before
                if (!e.cancelable) return;
                e.preventDefault();
                e.stopPropagation();
            });
        });
        document.addEventListener("touchstart", (e) => {
            if (!e.cancelable) return;
            e.preventDefault();
            e.stopPropagation();
        });
        document.addEventListener("touchstart", (e) => {
            if (!e.cancelable) return;
            e.preventDefault();
            e.stopPropagation();
        });
    }
    
    read_gamepad(){
        // Since the controller API has a simple interface where we can simply
        // poll the state of the controller, we don't have to do event-based
        // keydown/keyup detection, just use the state of the controller here
        if (!this.gp_connected) return;
        let gamepad = navigator.getGamepads()[this.gp_index];
        if (!gamepad) return;
        // Use keybinds to set state of buffer_state
        this.gp_state[0] = !!(gamepad.buttons[this.gp_binds.a     ] || {}).pressed;
        this.gp_state[1] = !!(gamepad.buttons[this.gp_binds.b     ] || {}).pressed;
        this.gp_state[2] = !!(gamepad.buttons[this.gp_binds.select] || {}).pressed;
        this.gp_state[3] = !!(gamepad.buttons[this.gp_binds.start ] || {}).pressed;
        this.gp_state[4] = !!(gamepad.buttons[this.gp_binds.up    ] || {}).pressed;
        this.gp_state[5] = !!(gamepad.buttons[this.gp_binds.down  ] || {}).pressed;
        this.gp_state[6] = !!(gamepad.buttons[this.gp_binds.left  ] || {}).pressed;
        this.gp_state[7] = !!(gamepad.buttons[this.gp_binds.right ] || {}).pressed;
        // Also use state of axes to update the buffer_state
        if (gamepad.axes.length >= 2){
            if      (gamepad.axes[0] >=  0.75) this.gp_state[7] = 0x01;
            else if (gamepad.axes[0] <= -0.75) this.gp_state[6] = 0x01;
            if      (gamepad.axes[1] >=  0.75) this.gp_state[5] = 0x01;
            else if (gamepad.axes[1] <= -0.75) this.gp_state[4] = 0x01;
        }
    }
    
    update(){
        this.read_gamepad();
        for (let i = 0; i < this.state.length; i++){
            this.state[i] = this.kb_state[i] | this.gp_state[i] | this.bt_state[i];
        }
        this.read_index = 0x00;
    }

    set_strobe(val){
        // The remaining bits are thrown out (I think)
        this.strobe_bit = val & 0x01;
        if (this.strobe_bit) this.update();
    }

    get_status(){
        if (this.strobe_bit) this.update();
        // Always return 0x01 when all the status bits
        // have been read (happens in the original controller)
        if (this.read_index >= 0x08) return 0x01;
        // We can't increment read_index after we return,
        // so we have to settle for this workaround
        let tmp = this.state[this.read_index];
        this.read_index++;
        return tmp;
    }
}
