class CONTROLLER{
    constructor(p_nes, p_keybinds){
        this.nes          = p_nes;
        // p_keybinds is an object which has 8 properties:
        // a, b, select, start, up, down, left, right
        // Each of these properties has a key assigned to it
        // identifying the key which is bound to its respective button
        this.keybinds     = p_keybinds;
        // An array with the state of the controller
        // since it was last updated
        // It's in the order laid out above
        this.state        = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        // The actual state of the controller
        this.buffer_state = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        // Increases with each successive read of of 0x4016
        // and determines which status bit is sent back
        this.read_index   = 0x00;
        // When high (0x01), the state of the controller is
        // continuosly reloaded and read_index reset
        this.strobe_bit   = 0x00;
        // Since there is no way to get a straight keyboard state
        // in the browser, we implement it with the keydown and keyup events
        this.bind_keys();
    }

    // This function simply halfs the code size, not much else to it
    handle_change(key, pressed){
        switch (key){
            case this.keybind.a:
                this.buffer_state[0] = pressed;
                break;
            case this.keybind.b:
                this.buffer_state[1] = pressed;
                break;
            case this.keybind.select:
                this.buffer_state[2] = pressed;
                break;
            case this.keybind.start:
                this.buffer_state[3] = pressed;
                break;
            case this.keybind.up:
                this.buffer_state[4] = pressed;
                break;
            case this.keybind.down:
                this.buffer_state[5] = pressed;
                break;
            case this.keybind.left:
                this.buffer_state[6] = pressed;
                break;
            case this.keybind.right:
                this.buffer_state[7] = pressed;
                break;
        }
    }

    bind_keys(){
        document.addEventListener("keydown", (e) => {
            if (e.cancelable) e.preventDefault();
            this.handle_change(e.key, 0x01);
        });
        document.addEventListener("keyup",   (e) => {
            if (e.cancelable) e.preventDefault();
            this.handle_change(e.key, 0x00);
        });
    }

    update(){
        this.read_index = 0x00;
        this.state = this.buffer_state;
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
        // If it's a debug read, we don't increase read_index
        if (mod) read_index++;
        // If we increased read_index (mod=true), we need
        // to go one back to see what was actually read
        return this.state[this.read_index-mod];
    }
}

