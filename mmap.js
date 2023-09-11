class MMAP{
    static CPU_MEM_SIZE = 0x10000;
    static PPU_MEM_SIZE = 0x04000;
    static PRG_ROM_BLOCK_SIZE = 0x04000;
    static CHR_ROM_BLOCK_SIZE = 0x02000;

    // IMPORTANT NOTE TO SELF:
    // The PPU has its own address space from 0x0000 to 0x3FFF
    // seperate from the CPU's address space. They communicate
    // through special memory mapped locations (0x2000 - 0x2007).
    // The address space 0x0000 - 0x1FFF is where the CHR-ROM
    // is stored (usually with a mapping system). That space is
    // called the pattern table.

    constructor(p_nes){
        this.nes = p_nes;
        // No need to initialize these, they have all their
        // entries set to 0 by default
        this.cpu_memory = new Uint8Array(MMAP.CPU_MEM_SIZE);
        this.ppu_memory = new Uint8Array(MMAP.PPU_MEM_SIZE);
        // First 16 bytes of ROMs contain certain info about it
        this.rom_flags  = new Uint8Array(0x10);
    }

    load_prg_rom_block(rom, rom_addr, mmap_addr){
        for (let i = 0; i < MMAP.PRG_ROM_BLOCK_SIZE; i++){
            this.cpu_memory[i + mmap_addr] = rom[i + rom_addr];
        }
    }

    load_prg_rom(rom){
        if      (this.rom_flags[4] == 1){
            this.load_prg_rom_block(rom, 0x0010, 0x8000);
        }
        else if (this.rom_flags[4] == 2){
            this.load_prg_rom_block(rom, 0x0010, 0x8000);
            this.load_prg_rom_block(rom, 0x4010, 0xC000);
        }
    }

    load_chr_rom(rom){
        for (let i = 0; i < MMAP.CHR_ROM_BLOCK_SIZE; i++){
            this.ppu_memory[i] = rom[i + (this.rom_flags[4]*0x4000) + 0x0010];
        }
    }

    load_rom(rom){
        // Load ROM flags
        for (let i = 0; i < 0x10; i++) this.rom_flags[i] = rom[i];
        this.load_prg_rom(rom);
        this.load_chr_rom(rom);
    }

    apply_mirrors(addr){
        // See NesDev wiki for a more detailed explanation
        // We do this sort of recursiveness just in case there are
        // multiple layers of mirroring/redirects
        if ((addr >= 0x0800) && (addr <= 0x1FFF)) return this.apply_mirrors( addr % 0x0800);
        if ((addr >= 0x2008) && (addr <= 0x3FFF)) return this.apply_mirrors((addr % 8) + 0x2000);
        // Mirror 0xC000 - 0xFFFF to 0x8000 - 0xBFFF if the ROM only has 16KB PRG-ROM
        if ((this.rom_flags[4] == 1)
         && (addr >= 0xC000) && (addr <= 0xFFFF)) return this.apply_mirrors( addr - 0x4000);
        return addr;
    }

    get_byte(addr, mod=true){
        addr = this.apply_mirrors(addr);
        // Map to PPU registers
        switch (addr){
            case 0x2000:
                // Write only register
                debug_log("Attempted read to PPU_CTRL");
                return null;
            case 0x2001:
                // Write only register
                debug_log("Attempted read to PPU_MASK");
                return null;
            case 0x2002:
                return this.nes.ppu.get_status();
            case 0x2003:
                // Write only register
                debug_log("Attempted read to OAM_ADDR");
                return null;
            case 0x2004:
                return this.nes.ppu.get_oam_data();
            case 0x2005:
                // Write only register
                debug_log("Attempted read to PPU_SCROLL");
                return null;
            case 0x2006:
                // Write only register
                debug_log("Attempted read to PPU_ADDR");
                return null;
            case 0x2007:
                return this.nes.ppu.get_reg_data(mod);
            case 0x4014:
                debug_log("Attempted read to OAM_DMA");
                return null;
            case 0x4016:
                return this.nes.controller.get_status(mod);
        }
        return this.cpu_memory[addr];
    }

    set_byte(addr, val){
        addr = this.apply_mirrors(addr);
        switch (addr){
            case 0x2000:
                this.nes.ppu.set_ctrl(val);
                return;
            case 0x2001:
                this.nes.ppu.set_mask(val);
                return;
            case 0x2002:
                // Read only register
                debug_log("Attempted write to PPU_STATUS");
                return;
            case 0x2003:
                this.nes.ppu.set_oam_addr(val);
                return;
            case 0x2004:
                this.nes.ppu.set_oam_data(val);
                return;
            case 0x2005:
                this.nes.ppu.set_scroll(val);
                return;
            case 0x2006:
                this.nes.ppu.set_addr(val);
                return;
            case 0x2007:
                this.nes.ppu.set_data(val);
                return;
            case 0x4014:
                this.nes.ppu.oam_dma(val);
                return;
            case 0x4016:
                this.nes.controller.set_strobe(val);
                return;
        }
        this.cpu_memory[addr] = val;
    }

    ppu_apply_mirrors(addr){
        // Same recursive principle as before except
        // for these first 4 single address mirrors
        if  (addr == 0x3F10)                      return 0x3F00;
        if  (addr == 0x3F14)                      return 0x3F04;
        if  (addr == 0x3F18)                      return 0x3F08;
        if  (addr == 0x3F1C)                      return 0x3F0C;
        if ((addr >= 0x3F20) && (addr <= 0x3FFF)) return this.ppu_apply_mirrors((addr % 0x0020) + 0x3F00);
        if  (addr >= 0x3FFF)                      return this.ppu_apply_mirrors( addr % 0x4000);
        if ((addr >= 0x3000) && (addr <= 0x3EFF)) return this.ppu_apply_mirrors( addr - 0x1000);
        // Vertical NT mirroring
        if  (this.rom_flags[6] & 0x01){
            // I know I could merge these 2 ifs into 1, but it becomes
            // a lot less clear what the mirroring actually is
            if ((addr >= 0x2800) && (addr <= 0x2BFF)) return this.ppu_apply_mirrors(addr - 0x0800);
            if ((addr >= 0x2C00) && (addr <= 0x2FFF)) return this.ppu_apply_mirrors(addr - 0x0800);
        }
        // Horizontal NT mirroring
        else {
            if ((addr >= 0x2400) && (addr <= 0x27FF)) return this.ppu_apply_mirrors(addr - 0x0400);
            if ((addr >= 0x2C00) && (addr <= 0x2FFF)) return this.ppu_apply_mirrors(addr - 0x0400);
        }
        return addr;
    }

    ppu_get_byte(addr){
        return this.ppu_memory[this.ppu_apply_mirrors(addr)];
    }

    ppu_set_byte(addr, val){
        this.ppu_memory[this.ppu_apply_mirrors(addr)] = val;
    }

    // Returns all the CPU memory in the interval [start, end]
    memdump(start, end){
        let result = "";
        for (let i = start; i <= end; i++){
            // We send in false for the optional argument mod because
            // we don't want to modify the internal state of the NES when
            // debugging and reading its state
            let current_byte = this.get_byte(i, false);
            // Don't worry if the address is write-only and returns null,
            // the hx_fmt just writes NN in place of an actual value
            result += hx_fmt(current_byte);
        }
        return result;
    }

    // Returns all the PPU memory in the interval [start, end]
    ppudump(start, end){
        let result = "";
        for (let i = start; i <= end; i++){
            // No such internal state shenanigans in the
            // PPU address space
            result += hx_fmt(this.ppu_get_byte(i));
        }
        return result;
    }
}

