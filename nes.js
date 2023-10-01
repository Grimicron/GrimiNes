class NES{
    static CPU_CLOCK_HZ = 1_789_773;
    static PPU_CLOCK_HZ = 5_369_318;
    static MAX_OVERDUE_COMPUTING = 0.02;
    
    constructor(){
        this.cpu        = new CPU       (this);
        this.ppu        = new PPU       (this);
        this.mmap       = new MMAP      (this);
        this.logger     = new LOGGER    (this);
        this.controller = new CONTROLLER(this, {
            a:      "KeyX"      ,
            b:      "KeyZ"      ,
            select: "Space"     ,
            start:  "Enter"     ,
            up:     "ArrowUp"   ,
            down:   "ArrowDown" ,
            left:   "ArrowLeft" ,
            right:  "ArrowRight",
        },{
            a:       1,
            b:       0,
            select:  8,
            start:   9,
            up:     12,
            down:   13,
            left:   14,
            right:  15,
        });
        this.keep_logs = false;
        this.prev_ts = 0;
        this.fps_update_ts = 0;
        // Counts how many full images have been rendered by the
        // PPU since we emulated the cycle queue
        this.frame_count = 0;
        // The HTML element where we can display our FPS metric
        this.fps_display = null;
        // The CPU returns how many cycles it should take to
        // complete an instruction, so we wait those out to
        // be somewhat cycle-accurate and keep the timings correct
        this.cpu_wait_cycles = 0;
        this.ppu_wait_dots   = 0;
        this.ctx = null;
    }

    init(p_ctx, rom){
        this.ctx = p_ctx;
        this.fps_display = document.getElementById("fps-counter");
        this.prev_ts = window.performance.now() / 1000;
        this.fps_update_ts = this.prev_ts;
        this.controller.bind_keys();
        this.mmap.load_rom(rom);
        this.ppu.init_buffer();
        this.ppu.load_normal_palette();
        this.cpu.reset();
    }

    update_screen(){
        this.ctx.putImageData(new ImageData(this.ppu.out_buf, 256, 240), 0, 0);
    }
    
    // Not cycle accurate but close enough
    emu_cycle_queue(){
        // / 1000 to convert ms to secs, because since all of the clock speeds are
        // in HZ (cycles / sec), it makes it kinda cleaner
        let now_ts = window.performance.now() / 1000;
        let dt = Math.min(now_ts - this.prev_ts, NES.MAX_OVERDUE_COMPUTING);
        // Assuming that the time between each frame is basically constant, flooring
        // the amount of cycles (which is probably decimal) and loosing one cycle should'nt
        // cause too many issues since it should catch up eventually and execute an extra
        // cycle every once in a while
        let cpu_cycles = Math.floor(dt * NES.CPU_CLOCK_HZ);
        let ppu_cycles = Math.floor(dt * NES.PPU_CLOCK_HZ);
        for (let i = 0; i < ppu_cycles; i++){
            // For now, as a temporary bootstrapping for testing, we'll just put the
            // CPU cycles along with the PPU dots and make them execute once every 3 dots
            // since a CPU cycle is basically 3 PPU dots
            if ((!(i % 3)) && this.cpu_wait_cycles) this.cpu_wait_cycles--;
            else{
                if (this.keep_logs) this.logger.cpu_log();
                this.cpu_wait_cycles += this.cpu.exec_op();
            }
            if (this.ppu_wait_dots) this.ppu_wait_dots--;
            else                    this.ppu_wait_dots += this.ppu.exec_dot_group();
        }
        this.update_screen();
        if ((now_ts - this.fps_update_ts) >= 1) this.update_fps(now_ts);
        this.prev_ts = now_ts;
    }

    count_frame(){
        this.frame_count++;
    }

    update_fps(now){
        let fps = Math.floor(this.frame_count / (now - this.fps_update_ts));
        this.fps_display.innerHTML = fps + " FPS";
        this.fps_update_ts = now;
        this.frame_count = 0;
    }
}
