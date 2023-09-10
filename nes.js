class NES{
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
    }

    init(rom){
        this.controller.bind_keys();
        this.mmap.load_rom(rom);
        this.ppu.load_normal_palette();
        this.cpu.reset();
    }

    // Not cycle accurate but close enough
    emu_cycle(){
        this.cpu.exec_op();
    }
}

