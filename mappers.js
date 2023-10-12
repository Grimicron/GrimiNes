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

    to_json(){
        let base = {
            cpu_ram    : Array.from(this.cpu_ram),
            ppu_vram   : Array.from(this.ppu_vram),
            ppu_pal_ram: Array.from(this.ppu_pal_ram),
            // We don't need to save any of the ROM
            // data, since that should already be loaded
            // in, nor the debug_out data, since the save
            // feature is meant for users playing games which
            // require multiple sessiosn to beat/enjoy, debuggind
            // and reading the output of a test ROM should be swift
        };
        // If cartdrige uses CHR RAM, we should save that too
        if (this.mmap.rom_flags[5] == 0){
            base.chr_rom = Array.from(this.chr_rom);
        }
        return base;
    }

    from_json(state){
        // Loading in our Uint8Arrays is quite hard, since JSON
        // parses them as objects instead of arrays, but it's just
        // a couple of extra steps
        this.cpu_ram     = new Uint8Array(state.cpu_ram);
        this.ppu_vram    = new Uint8Array(state.ppu_vram);
        this.ppu_pal_ram = new Uint8Array(state.ppu_pal_ram);
        if (this.mmap.rom_flags[5] == 0){
            this.chr_rom = new Uint8Array(state.chr_rom);
        }
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
        // Value 0 for CHR ROM flag means the board uses CHR RAM and
        // we should provide it
        if ((addr >= 0x0000) && (addr <= 0x1FFF) && (this.mmap.rom_flags[5] == 0)){
            this.chr_rom[addr] = val;
        }
        if ((addr >= 0x2000) && (addr <= 0x2FFF)) this.ppu_vram[addr - 0x2000] = val;
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) this.ppu_pal_ram[addr - 0x3F00] = val;
    }
}

class MMC1 extends NROM{ // iNes Mapper #001
    // This mapper is very complex, I recommend reading the docs on it:
    // https://www.nesdev.org/wiki/MMC1
    constructor(mmap){
        super(mmap);
        this.prg_ram = new Uint8Array(0x2000);
        // A clear shift register is 0b10000
        // The 1 is used internally to detect when it's full
        // and should transfer its contents to the appropiate register
        this.shift_reg = 0x10;
        // While this is disputed, the control register should
        // start at value 0x0C, meaning that it starts with the
        // last bank fixed at 0xC000
        this.ctrl_reg     = 0x0C;
        // Decides which CHR ROM bank is loaded into
        // the PPU address space 0x0000 - 0x0FFF
        this.chr_low_bank  = 0x00;
        // Same thing but for 0x1000 - 0x1FFF
        this.chr_high_bank = 0x00;
        // Selects a 16/32KB PRG ROM bank
        this.prg_rom_bank = 0x00;
    }

    to_json(){
        let base = super.to_json();
        base.prg_ram       = Array.from(this.prg_ram);
        base.shift_reg     = this.shift_reg;
        base.ctrl_reg      = this.ctrl_reg;
        base.chr_low_bank  = this.chr_low_bank;
        base.chr_high_bank = this.chr_high_bank;
        base.prg_rom_bank  = this.prg_rom_bank;
        return base;
    }

    from_json(state){
        super.from_json(state);
        this.prg_ram       = new Uint8Array(state.prg_ram);
        this.shift_reg     = state.shift_reg;
        this.ctrl_reg      = state.ctrl_reg;
        this.chr_low_bank  = state.chr_low_bank;
        this.chr_high_bank = state.chr_high_bank;
        this.prg_rom_bank  = state.prg_rom_bank;
    }
    
    load_prg_rom(rom){
        this.prg_rom = new Uint8Array(this.mmap.rom_flags[4] * 0x4000);
        for (let i = 0x0000; i < this.prg_rom.length; i++){
            this.prg_rom[i] = rom[0x0010 + i];
        }
    }
    
    load_chr_rom(rom){
        if (this.mmap.rom_flags[5] == 0){
            // Cartdriges that use CHR RAM always use an 8KB
            // region for it, since there's no point in bank-switching RAM
            this.chr_rom = new Uint8Array(0x2000);
            return;
        }
        this.chr_rom = new Uint8Array(0x20000);
        for (let i = 0x0000; i < (this.mmap.rom_flags[5]*0x2000); i++){
            this.chr_rom[i] = rom[0x0010 + (this.mmap.rom_flags[4]*0x4000) + i];
        }
    }
    
    init_ppu_mirrors(){
        // Start off with all addresses mirroring themselves
        for (let i = 0x0000; i < 0x4000; i++){
            this.ppu_mirror_map[i] = i;
        }
        // We don't need any NT mirroring, since it's decided by the
        // control register (I think)
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
    
    read(addr){
        if      ((addr >= 0x0000) && (addr <= 0x07FF)) return this.cpu_ram[addr];
        else if ((addr >= 0x6000) && (addr <= 0x7FFF)){
            // PRG RAM read occurs here        
            // Depending on the board, the most significant bit of
            // the PRG ROM bank register (0x10) can select if the
            // PRG RAM is enabled or disabled, so we'll just assume
            // all MMC1 boards are like that for simplicity's sake
            if (this.prg_rom_bank & 0x10) return 0x00;
            return this.prg_ram[addr - 0x6000];
        }
        else if ((addr >= 0x8000) && (addr <= 0xFFFF)){
            let prg_rom_mode = this.ctrl_reg & 0x0C;
            // PRG ROM bank mode 0/1 (32KB switchable)
            if      ((prg_rom_mode == 0x00) || (prg_rom_mode == 0x04)){
                // Pretty sure the PRG ROM page warps around if it's
                // bigger than the size of our PRG ROM
                let page = (this.prg_rom_bank & 0x0E) % this.mmap.rom_flags[4];
                return this.prg_rom[(page * 0x8000) | (addr - 0x8000)];
            }
            // PRG ROM bank mode 2 (16KB fixed + 16KB switchable)
            else if (prg_rom_mode == 0x08){
                if (addr >= 0xC000){
                    let page = (this.prg_rom_bank & 0x0F) % this.mmap.rom_flags[4];
                    return this.prg_rom[(page * 0x4000) | (addr - 0xC000)];
                }
                else{
                    return this.prg_rom[addr - 0x8000];
                }
            }
            // PRG ROM bank mode 3 (16KB switchable + 16KB fixed)
            else if (prg_rom_mode == 0x0C){
                if (addr >= 0xC000){
                    return this.prg_rom[((this.mmap.rom_flags[4] - 1) * 0x4000) | (addr - 0xC000)];
                }
                else{
                    let page = (this.prg_rom_bank & 0x0F) % this.mmap.rom_flags[4];
                    return this.prg_rom[(page * 0x4000) | (addr - 0x8000)];
                }
            }
        }
        return 0x00;
    }

    write(addr, val){
        if ((addr >= 0x0000) && (addr <= 0x07FF)) this.cpu_ram[addr] = val;
        else if ((addr >= 0x6000) && (addr <= 0x7FFF)){
            // PRG RAM write occurs here
            // Reason for this explained above
            if (this.prg_rom_bank & 0x10) return;
            this.prg_ram[addr - 0x6000] = val;
        }
        else if ((addr >= 0x8000) && (addr <= 0xFFFF)){
            // Reset shift register if most significant bit is set
            if (val & 0x80){
                this.shift_reg = 0x10;
                // Also resets the control register to
                // PRG ROM bank mode 3
                this.ctrl_reg |= 0x0C;
                return;
            }
            // Shift register is full if the 1 reached the least significant bit
            if (this.shift_reg & 0x01){
                let reg_val = ((val & 0x01) << 4) | ((this.shift_reg) >>> 1);
                // We don't need to check if addr is bigger than 0x8000,
                // we already know it is since we are in this if
                if      (addr <= 0x9FFF) this.ctrl_reg      = reg_val;
                else if (addr <= 0xBFFF) this.chr_low_bank  = reg_val;
                else if (addr <= 0xDFFF) this.chr_high_bank = reg_val;
                else                     this.prg_rom_bank  = reg_val;
                // Reset shift register
                this.shift_reg = 0x10;
            }
            else{
                // Otherwise just shift another bit in
                this.shift_reg = ((val & 0x01) << 4) | (this.shift_reg >>> 1);
            }
        }
    }

    ppu_read(addr){
        if ((addr >= 0x0000) && (addr <= 0x1FFF)){
            // If board uses CHR RAM, we don't need to do any weird mirroring
            if (this.mmap.rom_flags[5] == 0) return this.chr_rom[addr];
            // 4KB switchable, 4KB switchable
            if (this.ctrl_reg & 0x10){
                // CHR low bank
                if (this.addr <= 0x0FFF){
                    return this.chr_rom[(this.chr_low_bank * 0x1000) | addr];
                }
                // CHR high bank
                else{
                    return this.chr_rom[(this.chr_high_bank * 0x1000) | (addr - 0x1000)];
                }
            }
            // 8KB switchable
            else{
                // The CHR low ROM bank is used for the 8KB switchable mode
                // The least significant bit is ignored
                return this.chr_rom[((this.chr_low_bank & 0x1E) * 0x1000) | addr];
            }
        }
        if ((addr >= 0x2000) && (addr <= 0x2FFF)){
            let mirror_mode = this.ctrl_reg & 0x03;
            // Single-screen, lower bank
            if      (mirror_mode == 0x00) return this.ppu_vram[addr % 0x0400];
            // Single-screen, upper bank
            else if (mirror_mode == 0x01) return this.ppu_vram[(addr % 0x0400) + 0x0400];
            // Vertical mirroring
            // Lower bank = 0x2000-0x23FF, 0x2800-0x2BFF
            // Upper bank = 0x2400-0x27FF, 0x2C00-0x2FFF
            else if (mirror_mode == 0x02) return this.ppu_vram[(addr - 0x2000) % 0x0800];
            // Horizontal mirroring
            // Lower bank = 0x2000-0x23FF, 0x2400-0x27FF
            // Upper bank = 0x2800-0x2BFF, 0x2C00-0x2FFF
            // Making this mirroring read from 0x2000-0x23FF for the lower bank
            // and to 0x2400-0x27FF for the upper bank is kinda hard
            else if (mirror_mode == 0x03){
                addr &= 0x0BFF;
                if (addr & 0x0800) addr -= 0x0400;
                return this.ppu_vram[addr];
            }
        }
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) return this.ppu_pal_ram[addr - 0x3F00];
    }

    ppu_write(addr, val){
        // Explained above in NROM mapper
        if ((addr >= 0x0000) && (addr <= 0x1FFF) && (this.mmap.rom_flags[5] == 0)){
            this.chr_rom[addr] = val;
        }
        if ((addr >= 0x2000) && (addr <= 0x2FFF)){
            let mirror_mode = this.ctrl_reg & 0x03;
            // Single-screen, lower bank
            if      (mirror_mode == 0x00) this.ppu_vram[addr % 0x0400] = val;
            // Single-screen, upper bank
            else if (mirror_mode == 0x01) this.ppu_vram[(addr % 0x0400) + 0x0400] = val;
            // Vertical mirroring
            else if (mirror_mode == 0x02) this.ppu_vram[(addr - 0x2000) % 0x0800] = val;
            // Horizontal mirroring
            else if (mirror_mode == 0x03){
                // Explained above in ppu_read()
                addr &= 0x0BFF;
                if (addr & 0x0800) addr -= 0x0400;
                this.ppu_vram[addr] = val;
            }
        }
        if ((addr >= 0x3F00) && (addr <= 0x3F1F)) this.ppu_pal_ram[addr - 0x3F00] = val;
    }
}

class UXROM extends NROM{ // iNes Mapper #002
    constructor(mmap){
        super(mmap);
        this.prg_rom_bank = 0x00;
    }

    to_json(){
        let base = super.to_json();
        base.prg_rom_bank = this.prg_rom_bank;
        return base;
    }

    from_json(state){
        super.from_json(state);
        this.prg_rom_bank = state.prg_rom_bank;
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

    to_json(){
        let base = super.to_json();
        base.chr_bank = this.chr_bank;
        return base;
    }

    from_json(state){
        super.from_json(state);
        this.chr_bank = state.chr_bank;
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
        this.prg_rom_bank  = 0x00;
        this.mirror_screen = 0x0000;
    }

    to_json(){
        let base = super.to_json();
        base.prg_rom_bank  = this.prg_rom_bank;
        base.mirror_screen = this.mirror_screen;
        return base;
    }

    from_json(state){
        super.from_json(state);
        this.prg_rom_bank  = state.prg_rom_bank;
        this.mirror_screen = state.mirror_screen;
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
    if (mapper_id == 1) return new MMC1(mmap);
    if (mapper_id == 2) return new UXROM(mmap);
    if (mapper_id == 3) return new CNROM(mmap);
    if (mapper_id == 7) return new AXROM(mmap);
    return null;
}
