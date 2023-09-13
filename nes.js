class NES{
    static CPU_CLOCK_HZ = 1_789_773;
    static PPU_CLOCK_HZ = 5_369_318;
    
    constructor(ctx){
        this.cpu        = new CPU       (this);
        this.ppu        = new PPU       (this, ctx, 1);
        this.mmap       = new MMAP      (this);
        this.controller = new CONTROLLER(this, {
            a:      "KeyS"      ,
            b:      "KeyA"      ,
            select: "Space"     ,
            start:  "Enter"     ,
            up:     "ArrowUp"   ,
            down:   "ArrowDown" ,
            left:   "ArrowLeft" ,
            right:  "ArrowRight",
        });
        this.prev_ts = 0;
        // The CPU returns how many cycles it should take to
        // complete an instruction, so we wait those out to
        // be somewhat cycle-accurate and keep the timings correct
        this.cpu_wait_cycles = 0;
        this.ppu_wait_dots   = 0;
    }

    init(rom){
        this.cpu_cycle_ts = window.performance.now() / 1000;
        this.controller.bind_keys();
        this.mmap.load_rom(rom);
        this.ppu.init_buffer();
        this.ppu.load_normal_palette();
        this.cpu.reset();
    }

    // Not cycle accurate but close enough
    emu_cycle_queue(){
        // / 1000 to convert ms to secs, because since all of the clock speeds are
        // in HZ (cycles / sec), it makes it kinda cleaner
        let now_ts = window.performance.now() / 1000;
        // For now, as a temporary fix for our poor performance, we can just
        // keep DT low by modding it by 0.5
        let dt = (now_ts - this.cpu_cycle_ts) % 0.5;
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
            else                                    this.cpu_wait_cycles = this.cpu.exec_op();
            if (this.ppu_wait_dots) this.ppu_wait_dots--;
            else                    this.ppu_wait_dots = this.ppu.exec_dot_group();
        }
        this.prev_ts = now_ts;
    }
}
