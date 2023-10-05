class NROM{ // iNES Mapper #000
    constructor(mmap){
        this.mmap           = mmap;
        this.cpu_ram        = new Uint8Array(0x0800);
        this.prg_rom        = new Uint8Array(0);
        this.chr_rom        = new Uint8Array(0);
        this.ppu_vram       = new Uint8Array(0x1000);
        this.ppu_pal_ram    = new Uint8Array(0x20);
        this.mem_mirror_map = new Uint16Array(0x10000);
        this.ppu_mirror_map = new Uint16Array(0x04000);
        // Used by some test ROMs to write their output
        // in ASCII form in addition to printing on screen
        this.debug_out      = new Uint8Array(0x1000);
    }

    load_prg_rom(rom){
        if (this.mmap.rom_flags[4] == 1){
            this.prg_rom = new Uint8Array(0x4000);
            for (let i = 0x0000; i < 0x4000; i++){
                this.prg_rom[i] = rom[0x0010 + i];
            }
        }
        else if (this.mmap.rom_flags[4] == 2){
            this.prg_rom = new Uint8Array(0x8000);
            for (let i = 0x0000; i < 0x8000; i++){
                this.prg_rom[i] = rom[0x0010 + i];
            }
        }
    }

    load_chr_rom(rom){
        this.chr_rom = new Uint8Array(0x2000);
        for (let i = 0x0000; i < 0x2000; i++){
            this.chr_rom[i] = rom[0x0010 + (this.mmap.rom_flags[4]*0x4000) + i];
        }
    }

    init_mem_mirrors(){
        // Start off with all addresses mirroring themselves
        for (let i = 0x0000; i < 0x10000; i++){
            this.mem_mirror_map[i] = i;
        }
        // Internal RAM mirrors
        for (let i = 0x0800; i <= 0x1FFF; i++){
            this.mem_mirror_map[i] = i % 0x0800;
        }
        // PPU registers mirrors
        for (let i = 0x2008; i <= 0x3FFF; i++){
            this.mem_mirror_map[i] = (i % 8) + 0x2000;
        }
        // If PRG ROM is only 16KB, mirror the upper 16KB
        if (this.mmap.rom_flags[4] == 1){
            for (let i = 0xC000; i <= 0xFFFF; i++){
                this.mem_mirror_map[i] = i - 0x4000;
            }
        }
    }
    
    init_ppu_mirrors(){
        // Start off with all addresses mirroring themselves
        for (let i = 0x0000; i < 0x4000; i++){
            this.ppu_mirror_map[i] = i;
        }
        // Vertical NT mirroring
        if (this.mmap.rom_flags[6] & 0x01){
            for (let i = 0x2800; i <= 0x2FFF; i++){
                this.ppu_mirror_map[i] = i - 0x0800;
            }
        }
        // Horizontal NT mirroring
        else{
            for (let i = 0x2400; i <= 0x27FF; i++){
                this.ppu_mirror_map[i] = i - 0x0400;
            }
            for (let i = 0x2C00; i <= 0x2FFF; i++){
                this.ppu_mirror_map[i] = i - 0x0400;
            }
        }
        // Weird mirroring, check wiki for more info:
        // https://www.nesdev.org/wiki/PPU_memory_map
        for (let i = 0x3000; i <= 0x3EFF; i++){
            this.ppu_mirror_map[i] = this.ppu_mirror_map[i - 0x1000];
        }
        // Palette mirroring
        this.ppu_mirror_map[0x3F10] = 0x3F00;
        this.ppu_mirror_map[0x3F14] = 0x3F04;
        this.ppu_mirror_map[0x3F18] = 0x3F08;
        this.ppu_mirror_map[0x3F1C] = 0x3F0C;
        for (let i = 0x3F20; i <= 0x3FFF; i++){
            // Again, a kind of weird mirroring, check wiki for more info
            // (link above)
            this.ppu_mirror_map[i] = this.ppu_mirror_map[0x3F00 | (i % 0x20)];
        }
    }
    
    init(rom){
        this.load_prg_rom(rom);
        this.load_chr_rom(rom);
        this.init_mem_mirrors();
        this.init_ppu_mirrors();
    }

    read(addr){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) return this.cpu_ram[addr];
        if ((addr >= 0x8000) && (addr <= 0xFFFF)) return this.prg_rom[addr - 0x8000];
        return 0x00;
    }

    write (addr, val){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) this.cpu_ram[addr] = val;
        if ((addr >= 0x6000) && (addr <= 0x7FFF)) this.debug_out[addr - 0x6000] = val;
    }

    ppu_read(addr){
        if ((addr >= 0x0000) && (addr <= 0x1FFF)) return this.chr_rom[addr];
        if ((addr >= 0x2000) && (addr <= 0x2FFF)) return this.ppu_vram[addr - 0x2000];
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) return this.ppu_pal_ram[addr - 0x3F00];
        return 0x00;
    }

    ppu_write(addr, val){
        // Some test ROMs provide 0 CHR ROM and manually write to it themselves,
        // so we can do this little work around
        if ((addr >= 0x0000) && (addr <= 0x1FFF) && (this.mmap.rom_flags[5] == 0)){
            this.chr_rom[addr] = val;
        }
        if ((addr >= 0x2000) && (addr <= 0x2FFF)) this.ppu_vram[addr - 0x2000] = val;
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) this.ppu_pal_ram[addr - 0x3F00] = val;
    }
}

class UXROM extends NROM{ // iNes Mapper #002
    constructor(mmap){
        super(mmap);
        this.prg_rom_bank = 0x00;
    }

    load_prg_rom(rom){
        this.prg_rom = new Uint8Array(this.mmap.rom_flags[4] * 0x4000);
        for (let i = 0x0000; i < this.prg_rom.length; i++){
            this.prg_rom[i] = rom[0x0010 + i];
        }
    }

    read(addr){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) return this.cpu_ram[addr];
        if ((addr >= 0x8000) && (addr <= 0xBFFF)) return this.prg_rom[(this.prg_rom_bank << 14)      + (addr - 0x8000)];
        if ((addr >= 0xC000) && (addr <= 0xFFFF)) return this.prg_rom[(this.prg_rom.length - 0x4000) + (addr - 0xC000)];
        return 0x00;
    }

    write(addr, val){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) this.cpu_ram[addr] = val;
        if ((addr >= 0x6000) && (addr <= 0x7FFF)) this.debug_out[addr - 0x6000] = val;
        if ((addr >= 0x8000) && (addr <= 0xFFFF)) this.prg_rom_bank = Math.min(val & 0x0F, this.mmap.rom_flags[4] - 1);
    }

    ppu_write(addr, val){
        // UxROM uses CHR RAM instead of CHR ROM
        if ((addr >= 0x0000) && (addr <= 0x1FFF)) this.chr_rom[addr] = val;
        if ((addr >= 0x2000) && (addr <= 0x2FFF)) this.ppu_vram[addr - 0x2000] = val;
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) this.ppu_pal_ram[addr - 0x3F00] = val;
    }
}

class CNROM extends NROM{ // iNES Mapper #003
    constructor(mmap){
        super(mmap);
        this.chr_bank = 0x00;
    }

    load_chr_rom(rom){
        this.chr_rom = new Uint8Array(0x10000);
        for (let i = 0x0000; i < (this.mmap.rom_flags[5]*0x2000); i++){
            this.chr_rom[i] = rom[0x0010 + (this.mmap.rom_flags[4]*0x4000) + i];
        }
    }

    write(addr, val){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) this.cpu_ram[addr] = val;
        if ((addr >= 0x6000) && (addr <= 0x7FFF)) this.debug_out[addr - 0x6000] = val;
        if ((addr >= 0x8000) && (addr <= 0xFFFF)) this.chr_bank = val & 0x3;
    }
    
    ppu_read(addr){
        if ((addr >= 0x0000) && (addr <= 0x1FFF)) return this.chr_rom[(this.chr_bank << 13) | addr];
        if ((addr >= 0x2000) && (addr <= 0x2FFF)) return this.ppu_vram[addr - 0x2000];
        if ((addr >= 0x3F00) && (addr <= 0x3F1F))  return this.ppu_pal_ram[addr - 0x3F00];
    }
}

class AXROM extends NROM{ // iNES Mapper #007
    constructor(mmap){
        super(mmap);
        this.prg_rom_bank = 0x00;
        this.mirror_screen = 0x0000;
    }

    load_prg_rom(rom){
        this.prg_rom = new Uint8Array(0x40000);
        for (let i = 0x0000; i < this.prg_rom.length; i++){
            this.prg_rom[i] = rom[0x0010 + i];
        }
    }

    read(addr){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) return this.cpu_ram[addr];
        if ((addr >= 0x8000) && (addr <= 0xFFFF)) return this.prg_rom[(this.prg_rom_bank << 15) + (addr - 0x8000)];
        return 0x00;
    }

    write(addr, val){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) this.cpu_ram[addr] = val;
        if ((addr >= 0x6000) && (addr <= 0x7FFF)) this.debug_out[addr - 0x6000] = val;
        if ((addr >= 0x8000) && (addr <= 0xFFFF)){
            this.prg_rom_bank = val & 0x07;
            this.mirror_screen = (val & 0x10) ? 0x0400 : 0x0000;
        }
    }
    
    ppu_read(addr){
        if ((addr >= 0x0000) && (addr <= 0x1FFF)) return this.chr_rom[addr];
        if ((addr >= 0x2000) && (addr <= 0x2FFF)) return this.ppu_vram[this.mirror_screen | (addr % 0x1000)];
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) return this.ppu_pal_ram[addr - 0x3F00];
        return 0x00;
    }

    ppu_write(addr, val){
        // Same as in NROM
        if ((addr >= 0x0000) && (addr <= 0x1FFF) && (this.mmap.rom_flags[5] == 0)){
            this.chr_rom[addr] = val;
        }
        if ((addr >= 0x2000) && (addr <= 0x2FFF)) this.ppu_vram[this.mirror_screen | (addr % 0x1000)] = val;
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) this.ppu_pal_ram[addr - 0x3F00] = val;
    }
}

function mapper_factory(mmap, mapper_id){
    if (mapper_id == 0) return new NROM(mmap);
    if (mapper_id == 2) return new UXROM(mmap);
    if (mapper_id == 3) return new CNROM(mmap);
    if (mapper_id == 7) return new AXROM(mmap);
    return null;
}
